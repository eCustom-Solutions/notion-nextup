#!/usr/bin/env ts-node

// Initialize structured logging & env first
import '../../utils/logger';
import * as dotenv from 'dotenv';
dotenv.config();

import { createBaseApp } from '../http/base-server';
import { startScheduler } from '../scheduler';
import { DEBOUNCE_MS, OBJECTIVES_DB_ID } from '../config';
import { getAssigneesForObjective } from '../../api/objective-fanout';

const PORT = 4000;

async function main() {
  console.log('🧪 Webhook flow harness starting on port', PORT);

  // Stub scheduler: log only; no Notion calls
  const processed: Array<{ userId: string; userName: string }> = [];
  const objectiveLastHandledAt = new Map<string, number>();
  const scheduler = startScheduler({
    debounceMs: DEBOUNCE_MS,
    enableLogging: true,
    processUser: async (userId: string, userName: string) => {
      console.log(`▶️ processUser(stub) ${userName} (${userId})`);
      processed.push({ userId, userName });
    }
  });

  const app = createBaseApp();

  app.post('/notion-webhook', async (req, res) => {
    const assignee = req.body?.data?.properties?.Assignee?.people?.[0];
    const assigneeId = assignee?.id;
    const assigneeName = assignee?.name;
    const parentDb = req.body?.data?.parent?.database_id as string | undefined;

    if (OBJECTIVES_DB_ID && parentDb === OBJECTIVES_DB_ID) {
      const objectiveId = req.body?.data?.id as string | undefined;
      console.log(`🎯 Objective event detected for page ${objectiveId} (db=${parentDb})`);
      if (!objectiveId) return res.status(202).send('accepted - objective event with no page id');
      const now = Date.now();
      const last = objectiveLastHandledAt.get(objectiveId) || 0;
      if (now - last < Number(DEBOUNCE_MS)) {
        console.log(`⏱️  Skipping objective fanout (debounced) for ${objectiveId}`);
        return res.status(202).send('accepted - objective event debounced');
      }
      objectiveLastHandledAt.set(objectiveId, now);
      // Debounce is naturally applied when we enqueue users; we only fanout
      const tasksDbId = process.env.NOTION_DB_ID as string;
      const relationName = process.env.TASKS_OBJECTIVE_RELATION_NAME; // undefined → auto-detect
      const { assignees, triedRelations } = await getAssigneesForObjective(tasksDbId, objectiveId, relationName);
      console.log(`🎯 Relation scan:`, triedRelations);
      console.log(`🎯 Fanout: objective ${objectiveId} → ${assignees.length} unique assignees`);
      for (const a of assignees) scheduler.routeEvent(a.id, a.name);
      return res.status(202).send('accepted - objective event enqueued assignees');
    }

    if (assigneeId && assigneeName) {
      console.log(`📨 Task event detected for assignee ${assigneeName} (${assigneeId})`);
      scheduler.routeEvent(assigneeId, assigneeName);
      return res.status(202).send('accepted - task event enqueued');
    }

    console.log('ℹ️ Event without assignee ignored');
    return res.status(202).send('accepted - no assignee');
  });

  const server = app.listen(PORT, () => console.log(`🧪 Test server listening on ${PORT}`));

  // Helper to POST JSON using global fetch (Node >=18)
  async function postJson(url: string, body: any) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    const text = await res.text();
    console.log(`HTTP ${res.status} → ${text}`);
  }

  // Compose payloads
  const tasksDbId = process.env.NOTION_DB_ID || 'TASKS_DB_PLACEHOLDER';
  const objectivesDbId = OBJECTIVES_DB_ID || 'OBJECTIVES_DB_PLACEHOLDER';

  const taskPayload = {
    data: {
      id: 'mock-task-page',
      parent: { database_id: tasksDbId },
      properties: {
        Assignee: {
          people: [ { id: 'mock-user-uuid', name: 'Mock User' } ]
        }
      }
    }
  };

  // Normalize a 32-char Notion id into dashed UUID (8-4-4-4-12)
  function normalizeNotionId(id: string | undefined): string | undefined {
    if (!id) return undefined;
    const bare = id.replace(/[^a-fA-F0-9]/g, '');
    if (bare.length === 32) {
      return `${bare.slice(0,8)}-${bare.slice(8,12)}-${bare.slice(12,16)}-${bare.slice(16,20)}-${bare.slice(20)}`.toLowerCase();
    }
    if (/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) return id.toLowerCase();
    return undefined;
  }

  const objectiveTestIdRaw = process.env.OBJECTIVE_TEST_PAGE_ID;
  const objectiveTestId = normalizeNotionId(objectiveTestIdRaw);
  const objectivePayload = objectiveTestId ? {
    data: {
      id: objectiveTestId,
      parent: { database_id: objectivesDbId },
      properties: {}
    }
  } : null;

  // Send both events
  await postJson(`http://localhost:${PORT}/notion-webhook`, taskPayload);
  if (objectivePayload) {
    await postJson(`http://localhost:${PORT}/notion-webhook`, objectivePayload);
  } else {
    console.log('⚠️  Skipping objective event: set OBJECTIVE_TEST_PAGE_ID to a valid Notion page id');
  }

  // Wait a moment for debounce + stub processing
  await new Promise(r => setTimeout(r, Number(DEBOUNCE_MS) + 250));

  console.log('✅ Processed (stub):', processed);

  server.close();
  scheduler.stop();
  console.log('🧪 Webhook flow harness complete');
}

main().catch((e) => {
  console.error('❌ Harness error:', e);
  process.exit(1);
});


