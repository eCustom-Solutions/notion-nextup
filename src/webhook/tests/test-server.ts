#!/usr/bin/env ts-node

import * as dotenv from 'dotenv';
dotenv.config();

import { DebounceManager, delayedExecution } from '../debounce';
import { invokePipeline } from '../runtime/invoke-pipeline';

// Basic mock payload
const mockAssignee = { id: process.env.DEMO_USER_ID, name: process.env.DEMO_USER_NAME };

async function run() {
  const assigneeId = mockAssignee.id!;
  const assigneeName = mockAssignee.name!;

  console.log('🧪 Testing webhook pipeline (tests/test-server.ts)...');
  const debounceManager = new DebounceManager({ debounceMs: 3000, enableLogging: true }, delayedExecution);

  await debounceManager.processEvent(assigneeId, assigneeName, (userId, userName) => 
    invokePipeline(userId, userName)
  );

  console.log('✅ Completed test run');
}

run().catch(console.error);
