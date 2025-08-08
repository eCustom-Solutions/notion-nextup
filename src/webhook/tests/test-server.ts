#!/usr/bin/env ts-node

import * as dotenv from 'dotenv';
dotenv.config();

import { startScheduler } from '../scheduler';

// Basic mock payload
const mockAssignee = { id: process.env.DEMO_USER_ID, name: process.env.DEMO_USER_NAME };

async function run() {
  const assigneeId = mockAssignee.id!;
  const assigneeName = mockAssignee.name!;

  console.log('🧪 Testing scheduler + pipeline (tests/test-server.ts)...');
  const scheduler = startScheduler({ debounceMs: 3000, enableLogging: true });
  scheduler.routeEvent(assigneeId, assigneeName);
  await new Promise((r) => setTimeout(r, 4000));
  scheduler.stop();

  console.log('✅ Completed test run');
}

run().catch(console.error);
