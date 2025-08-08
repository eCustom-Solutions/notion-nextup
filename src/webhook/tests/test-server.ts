#!/usr/bin/env ts-node

import * as dotenv from 'dotenv';
dotenv.config();

import { startScheduler } from '../scheduler';
import { getAllUsers } from '../../api/user-lookup';
import { invokePipeline } from '../runtime/invoke-pipeline';
import { DEBOUNCE_MS } from '../config';

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function runAllUsersHarness() {
  const dbId = process.env.NOTION_DB_ID;
  if (!dbId) {
    throw new Error('NOTION_DB_ID missing in env');
  }

  const dryRun = String(process.env.ENABLE_DATABASE_UPDATES ?? 'false') !== 'true';
  const confirmLive = String(process.env.CONFIRM_LIVE ?? '');
  if (!dryRun && confirmLive !== 'ALL_USERS') {
    throw new Error('Live run requested but CONFIRM_LIVE=ALL_USERS not set');
  }

  const usersFilterRaw = process.env.USERS_FILTER;
  const maxUsers = Number(process.env.MAX_USERS ?? '0');
  const regex = usersFilterRaw ? new RegExp(usersFilterRaw, 'i') : undefined;

  console.log('🧪 All-users scheduler harness starting...');
  console.log(`   - Mode: ${dryRun ? 'DRY-RUN (no writes)' : 'LIVE (writes enabled)'}`);
  if (regex) console.log(`   - Users filter: ${regex}`);
  if (maxUsers > 0) console.log(`   - Max users: ${maxUsers}`);

  const completed = new Set<string>();
  const scheduler = startScheduler({
    debounceMs: DEBOUNCE_MS,
    enableLogging: true,
    processUser: async (userId: string, userName: string) => {
      await invokePipeline(userId, userName);
      completed.add(userId);
    }
  });

  // Discover users from workspace, then optionally filter/limit
  const userMap = await getAllUsers(); // Map<name, uuid>
  const selected: Array<{ id: string; name: string }> = [];
  for (const [name, id] of userMap.entries()) {
    if (regex && !regex.test(name)) continue;
    selected.push({ id, name });
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
  const deadlineMs = Date.now() + Math.max(60_000, selected.length * 5_000); // scale with users
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
