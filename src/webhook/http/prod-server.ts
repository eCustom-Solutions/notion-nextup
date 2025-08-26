#!/usr/bin/env ts-node

// Load env first, then initialize structured logging
import * as dotenv from 'dotenv';
dotenv.config();
import '../../utils/logger';

import fs from 'fs';
import path from 'path';
import { createBaseApp } from './base-server';
import { PORT, DEBOUNCE_MS, OBJECTIVES_DB_ID } from '../config';
import { routeAssignees } from '../assignee-router';
import { startScheduler } from '../scheduler';
import { getAssigneesForObjective } from '../../api/objective-fanout';

const app = createBaseApp();

const scheduler = startScheduler({ debounceMs: DEBOUNCE_MS, enableLogging: true });
const objectiveLastHandledAt = new Map<string, number>();

// Include list: allow processing only for these user UUIDs if provided
function loadIncludeUUIDs(): Set<string> {
  const includeUuidsRaw = process.env.USERS_INCLUDE_UUIDS; // comma-separated
  const includeFileRaw = process.env.USERS_INCLUDE_FILE; // JSON or CSV path
  const defaultAllowlistPath = path.resolve(process.cwd(), 'src/webhook/allowlists/tech-users.json');
  let uuids: string[] = [];

  try {
    if (includeUuidsRaw) {
      uuids = includeUuidsRaw.split(',').map(s => s.trim()).filter(Boolean);
    } else {
      const candidatePath = includeFileRaw ? path.resolve(process.cwd(), includeFileRaw) : defaultAllowlistPath;
      if (fs.existsSync(candidatePath)) {
        const content = fs.readFileSync(candidatePath, 'utf8');
        if (/\{/.test(content)) {
          const json = JSON.parse(content);
          if (Array.isArray(json.uuids)) uuids = json.uuids as string[];
        } else {
          // CSV
          uuids = content.split(/\r?\n/)
            .map(l => l.trim())
            .filter(l => l && !/^name/i.test(l))
            .map(l => l.split(',')[1]?.trim())
            .filter(Boolean) as string[];
        }
      }
    }
  } catch {
    // ignore include list parse errors
  }

  const set = new Set<string>(uuids);
  if (set.size > 0) {
    console.log(`🔒 Allowlist active: ${set.size} user UUIDs will be processed`);
  } else {
    console.log('ℹ️ No allowlist configured; processing all users');
  }
  return set;
}

const includeUUIDs = loadIncludeUUIDs();

// Helper to normalize Notion database IDs for comparison (remove dashes)
function normalizeNotionId(id: string): string {
  return id.replace(/-/g, '');
}

app.post('/notion-webhook', async (req, res) => {
  // Log all incoming webhooks for debugging
  const webhookId = req.body?.data?.id || 'unknown';
  const webhookDb = req.body?.data?.parent?.database_id || 'unknown';
  const webhookType = req.body?.data?.properties ? 'with-properties' : 'no-properties';
  // Log authors array (human vs bot diagnostics)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const authorsArr = (req.body as any)?.authors ?? [];
  const authorSummary = Array.isArray(authorsArr) && authorsArr.length > 0
    ? authorsArr.map((a: any) => `${a.type}:${(a.id ?? '').slice(0,8)}`).join(',')
    : 'none';
  console.log(`📨 Webhook received: id=${webhookId}, db=${webhookDb}, type=${webhookType}, authors=[${authorSummary}]`);

  // DEBUG: dump the raw payload (stringified, truncated to 2k chars to avoid log spam)
  try {
    const raw = JSON.stringify(req.body).slice(0, 2048);
    console.log('🔎 Raw webhook payload (truncated 2k):', raw);
  } catch {
    console.log('🔎 Raw webhook payload could not be stringified');
  }

  const parentDb = req.body?.data?.parent?.database_id as string | undefined;

  if (OBJECTIVES_DB_ID && parentDb && normalizeNotionId(parentDb) === normalizeNotionId(OBJECTIVES_DB_ID)) {
    const objectiveId = req.body?.data?.id as string | undefined;
    console.log(`🎯 Objective event received for page ${objectiveId} in DB ${parentDb}`);
    if (!objectiveId) return res.status(202).send('accepted - objective event with no page id');
    const now = Date.now();
    const last = objectiveLastHandledAt.get(objectiveId) || 0;
    if (now - last < Number(DEBOUNCE_MS)) {
      console.log(`⏱️  Skipping objective fanout (debounced) for ${objectiveId}`);
      return res.status(202).send('accepted - objective event debounced');
    }
    objectiveLastHandledAt.set(objectiveId, now);

    try {
      const tasksDbId = process.env.NOTION_DB_ID as string;
      const relationName = process.env.TASKS_OBJECTIVE_RELATION_NAME; // undefined → auto-detect
      const { assignees, triedRelations } = await getAssigneesForObjective(tasksDbId, objectiveId, relationName);
      console.log(`🎯 Relation scan:`, triedRelations);
      const preFilterCount = assignees.length;
      const allowed = assignees.filter(a => includeUUIDs.size === 0 || includeUUIDs.has(a.id));
      console.log(`🎯 Fanout: objective ${objectiveId} → ${preFilterCount} assignees, ${allowed.length} after allowlist`);
      for (const a of allowed) scheduler.routeEvent(a.id, a.name);
      return res.status(202).send('accepted - objective event enqueued assignees');
    } catch (err) {
      console.warn('⚠️ Objective fanout error:', err);
      return res.status(202).send('accepted - objective fanout error (logged)');
    }
  }

  // Fan-out to all assignees using shared helper
  const enqueued = routeAssignees(req.body, scheduler, includeUUIDs);

  if (enqueued > 0) {
    res.status(202).send(`accepted - enqueued ${enqueued} assignees`);
    return;
  }

  // Legacy single-assignee fallback (should rarely hit)
  const assignee = req.body?.data?.properties?.Assignee?.people?.[0];
  const assigneeId = assignee?.id;
  const assigneeName = assignee?.name;

  if (assigneeId && assigneeName) {
    if (includeUUIDs.size > 0 && !includeUUIDs.has(assigneeId)) {
      res.status(202).send('accepted - filtered by allowlist');
      return;
    }
    scheduler.routeEvent(assigneeId, assigneeName);
    res.status(202).send('accepted');
  } else {
    res.status(202).send('accepted - no assignee');
  }
});

app.listen(PORT, () => {
  // Attempt to read current commit hash for observability
  let commit = 'unknown';
  try {
    const headPath = path.resolve(process.cwd(), '.git/HEAD');
    if (fs.existsSync(headPath)) {
      const head = fs.readFileSync(headPath, 'utf8').trim();
      const match = head.match(/ref:\s*(.*)/);
      if (match) {
        const refPath = path.resolve(process.cwd(), '.git', match[1]);
        if (fs.existsSync(refPath)) {
          commit = fs.readFileSync(refPath, 'utf8').trim().slice(0, 12);
        }
      } else {
        commit = head.slice(0, 12);
      }
    }
  } catch {}
  console.log(`Webhook server listening on port ${PORT} • commit=${commit}`);
  console.log(`Objective fanout: ${OBJECTIVES_DB_ID ? 'ENABLED' : 'DISABLED'} • OBJECTIVES_DB_ID=${OBJECTIVES_DB_ID || 'n/a'} • debounceMs=${DEBOUNCE_MS}`);
});
