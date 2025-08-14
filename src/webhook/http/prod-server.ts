#!/usr/bin/env ts-node

import * as dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import { createBaseApp } from './base-server';
import { PORT, DEBOUNCE_MS, OBJECTIVES_DB_ID } from '../config';
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

app.post('/notion-webhook', async (req, res) => {
  const assignee = req.body?.data?.properties?.Assignee?.people?.[0];
  const assigneeId = assignee?.id;
  const assigneeName = assignee?.name;
  const parentDb = req.body?.data?.parent?.database_id as string | undefined;

  if (OBJECTIVES_DB_ID && parentDb === OBJECTIVES_DB_ID) {
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
  console.log(`Webhook server listening on port ${PORT}`);
});
