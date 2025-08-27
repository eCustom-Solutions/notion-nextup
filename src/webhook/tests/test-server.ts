#!/usr/bin/env ts-node

// Load env first, then initialize structured logging
import * as dotenv from 'dotenv';
dotenv.config();
import '../../utils/logger';

import { startScheduler } from '../scheduler';
import { routeAssignees } from '../assignee-router';
import fs from 'fs';
import path from 'path';
import { getAllUsers } from '../../api/user-lookup';
import { invokePipeline } from '../runtime/invoke-pipeline';
import { DEBOUNCE_MS } from '../config';
// Notion client instance used by adapters – we can monkey‑patch for simulations
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import notionClient from '../../api/client';

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

// Install simulation of mid‑workflow errors (archived/conflict) for specific page IDs
function installWriteSimulators() {
  const archivedIds = new Set(
    (process.env.SIMULATE_ARCHIVED_PAGE_IDS || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
  );
  const conflictIds = new Set(
    (process.env.SIMULATE_CONFLICT_PAGE_IDS || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
  );
  if (archivedIds.size === 0 && conflictIds.size === 0) return;

  const conflictOnce = new Set<string>();
  const origPages = notionClient.pages.bind(notionClient);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (notionClient as any).pages = async () => {
    const p = await origPages();
    const origUpdate = p.update.bind(p);
    const origRetrieve = p.retrieve?.bind(p);
    return {
      ...p,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      update: async (params: any) => {
        const pageId = params?.page_id as string | undefined;
        if (pageId && archivedIds.has(pageId)) {
          const err: any = new Error("Can't edit block that is archived. You must unarchive the block before editing.");
          err.code = 'validation_error';
          throw err;
        }
        if (pageId && conflictIds.has(pageId) && !conflictOnce.has(pageId)) {
          conflictOnce.add(pageId);
          const err: any = new Error('Conflict occurred while saving. Please try again.');
          err.code = 'conflict_error';
          throw err;
        }
        return origUpdate(params);
      },
      // pass through
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      retrieve: origRetrieve ? (async (params: any) => origRetrieve(params)) : undefined,
    };
  };

  console.log(`🔬 Write simulators active: archived=${archivedIds.size}, conflict-once=${conflictIds.size}`);
}

async function runAllUsersHarness() {
  const dbId = process.env.NOTION_DB_ID;
  if (!dbId) {
    throw new Error('NOTION_DB_ID missing in env');
  }

  // -------------------------------------------------------------
  // Optional: Multi-assignee webhook simulation mode
  // If MULTI_ASSIGNEE_PAYLOAD is set (format: id1:name1,id2:name2,...)
  // we bypass the all-users harness and instead fire a single webhook-like
  // payload through routeAssignees to validate fan-out behaviour end-to-end.
  // -------------------------------------------------------------
  const multiPayloadRaw = process.env.MULTI_ASSIGNEE_PAYLOAD;
  if (multiPayloadRaw) {
    console.log('🧪 Multi-assignee simulation mode enabled');
    const pairs = multiPayloadRaw.split(',').map(s => s.trim()).filter(Boolean);
    const people = pairs.map(pair => {
      const [id, ...nameParts] = pair.split(':');
      return { id, name: nameParts.join(':') || id };
    });

    console.log('👥 Simulated people:', people);

    const completed = new Set<string>();
    const scheduler = startScheduler({
      debounceMs: DEBOUNCE_MS,
      enableLogging: true,
      processUser: async (userId: string, userName: string) => {
        await invokePipeline(userId, userName);
        completed.add(userId);
      },
    });

    // Build fake webhook payload and fan-out
    const payload = {
      data: {
        properties: {
          Assignee: { people },
        },
      },
    };

    const count = await routeAssignees(payload, scheduler as any);
    console.log(`📨 routeAssignees enqueued ${count} users`);

    // Wait for all processing to complete (simple timeout 5m)
    const deadline = Date.now() + 5 * 60 * 1000;
    while (completed.size < people.length && Date.now() < deadline) {
      await sleep(100);
    }

    scheduler.stop();
    console.log(`✅ Multi-assignee simulation completed: processed ${completed.size}/${people.length} users`);
    return;
  }

  const dryRun = String(process.env.ENABLE_DATABASE_UPDATES ?? 'false') !== 'true';
  const confirmLive = String(process.env.CONFIRM_LIVE ?? '');
  if (!dryRun && confirmLive !== 'ALL_USERS') {
    throw new Error('Live run requested but CONFIRM_LIVE=ALL_USERS not set');
  }

  const usersFilterRaw = process.env.USERS_FILTER;
  const includeUuidsRaw = process.env.USERS_INCLUDE_UUIDS; // comma-separated
  const includeFileRaw = process.env.USERS_INCLUDE_FILE; // path to JSON or CSV
  const defaultAllowlistPath = path.resolve(process.cwd(), 'src/webhook/allowlists/tech-users.json');
  const maxUsers = Number(process.env.MAX_USERS ?? '0');
  const regex = usersFilterRaw ? new RegExp(usersFilterRaw, 'i') : undefined;

  console.log('🧪 All-users scheduler harness starting...');
  console.log(`   - Mode: ${dryRun ? 'DRY-RUN (no writes)' : 'LIVE (writes enabled)'}`);
  if (regex) console.log(`   - Users filter: ${regex}`);
  if (maxUsers > 0) console.log(`   - Max users: ${maxUsers}`);

  // Enable mid‑workflow error simulations if requested
  installWriteSimulators();

  const completed = new Set<string>();
  const scheduler = startScheduler({
    debounceMs: DEBOUNCE_MS,
    enableLogging: true,
    processUser: async (userId: string, userName: string) => {
      await invokePipeline(userId, userName);
      completed.add(userId);
    }
  });

  // Determine include list priority: USERS_INCLUDE_UUIDS > USERS_INCLUDE_FILE > default allowlist > regex
  let includeUUIDs: string[] | undefined;
  if (includeUuidsRaw) {
    includeUUIDs = includeUuidsRaw.split(',').map(s => s.trim()).filter(Boolean);
  } else {
    const candidatePath = includeFileRaw ? path.resolve(process.cwd(), includeFileRaw) : defaultAllowlistPath;
    if (fs.existsSync(candidatePath)) {
      const content = fs.readFileSync(candidatePath, 'utf8');
      if (/\{/.test(content)) {
        // JSON
        const json = JSON.parse(content);
        if (Array.isArray(json.uuids)) includeUUIDs = json.uuids as string[];
      } else {
        // CSV: try to parse uuid column
        includeUUIDs = content.split(/\r?\n/)
          .map(l => l.trim())
          .filter(l => l && !/^name/i.test(l))
          .map(l => l.split(',')[1]?.trim())
          .filter(Boolean) as string[];
      }
    }
  }

  // Discover users from workspace, then select by include list or regex
  const userMap = await getAllUsers(); // Map<name, uuid>
  const selected: Array<{ id: string; name: string }> = [];
  if (includeUUIDs && includeUUIDs.length > 0) {
    // Build reverse map uuid->name
    const uuidToName = new Map<string, string>();
    for (const [name, uuid] of userMap.entries()) uuidToName.set(uuid, name);
    for (const uuid of includeUUIDs) {
      const name = uuidToName.get(uuid) ?? uuid;
      selected.push({ id: uuid, name });
    }
  } else {
    for (const [name, id] of userMap.entries()) {
      if (regex && !regex.test(name)) continue;
      selected.push({ id, name });
    }
  }
  if (maxUsers > 0) selected.splice(maxUsers);

  if (selected.length === 0) {
    console.log('⚠️ No users selected. Use USERS_FILTER or check workspace users.');
    scheduler.stop();
    return;
  }

  console.log(`👥 Selected ${selected.length} users:`);
  selected.slice(0, 10).forEach(u => console.log(`   - ${u.name} (${u.id})`));
  if (selected.length > 10) console.log(`   ... and ${selected.length - 10} more`);

  // Generate one event per selected user with small jitter
  for (const u of selected) {
    scheduler.routeEvent(u.id, u.name);
    await sleep(25);
  }

  // Wait for all to complete (each user processed at least once)
  const timeoutMinutes = Number(process.env.TIMEOUT_MINUTES ?? '10'); // default 10 minutes
  const deadlineMs = Date.now() + (timeoutMinutes * 60 * 1000);
  console.log(`⏰ Timeout set to ${timeoutMinutes} minutes (${deadlineMs - Date.now()}ms)`);
  
  while (completed.size < selected.length && Date.now() < deadlineMs) {
    await sleep(200);
  }

  const done = completed.size;
  scheduler.stop();
  console.log(`✅ Completed ${done}/${selected.length} users (${dryRun ? 'dry-run' : 'live'})`);
}

runAllUsersHarness().catch((e) => {
  console.error('❌ Harness error:', e);
  process.exit(1);
});
