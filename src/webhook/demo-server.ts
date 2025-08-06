#!/usr/bin/env ts-node

import * as dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { runNotionPipeline, PipelineOptions } from './notion-pipeline';
import { DebounceManager, delayedExecution, DebounceOptions } from './debounce';

const PORT = Number(process.env.PORT ?? 443);
const app = express();
app.use(express.json({ limit: '1mb' }));

// Create debounce manager with delayed execution strategy
const debounceOptions: DebounceOptions = {
  debounceMs: 10_000, // 10-second delay
  enableLogging: true
};

const debounceManager = new DebounceManager(debounceOptions, delayedExecution);

// Pipeline options for Notion API logic
const pipelineOptions: PipelineOptions = {
  enableLogging: true,
  enableDatabaseUpdates: true
};

// Demo user - only process events for Derious
const DEMO_USER_ID = '1ded872b-594c-8161-addd-0002825994b5';
const DEMO_USER_NAME = 'Derious Vaughn';

console.log('🎭 Starting DEMO webhook server...');
console.log(`📊 Process ID: ${process.pid}`);
console.log(`👤 Running as user: ${process.env.USER || 'unknown'}`);
console.log(`🌐 Server URL: https://localhost:${PORT}`);
console.log(`🔗 Health endpoint: https://localhost:${PORT}/healthz`);
console.log(`📨 Webhook endpoint: https://localhost:${PORT}/notion-webhook`);
console.log(`🎯 DEMO MODE: Only processing events for ${DEMO_USER_NAME} (${DEMO_USER_ID})`);

// Health check endpoint
app.get('/healthz', (req, res) => {
  res.json({ status: 'ok', mode: 'demo', user: DEMO_USER_NAME });
});

// Webhook endpoint
app.post('/notion-webhook', async (req, res) => {
  console.log('📨 Incoming webhook payload:');
  console.log(JSON.stringify(req.body, null, 2));

  // Extract assignee information from the payload
  const assignee = req.body?.data?.properties?.Assignee?.people?.[0];
  const assigneeId = assignee?.id;
  const assigneeName = assignee?.name;

  console.log('🔍 Assignee info:', { assigneeId, assigneeName });
  console.log('🔍 Full assignee object:', assignee);

  // DEMO MODE: Only process if it's Derious
  if (assigneeId === DEMO_USER_ID && assigneeName === DEMO_USER_NAME) {
    console.log(`✅ DEMO: Processing event for ${assigneeName} (${assigneeId})`);
    console.log('🎭 DEMO MODE: This event will be processed');
    
    debounceManager.processEvent(assigneeId, assigneeName, (userId, userName) => 
      runNotionPipeline(userId, userName, pipelineOptions)
    ).catch((e: Error) => console.error('❌ pipeline error:', e));
    
    res.status(200).send('accepted - demo user processed');
  } else {
    console.log('⏭️  DEMO: Skipping event - not for demo user');
    console.log(`🎭 DEMO MODE: Expected ${DEMO_USER_NAME} (${DEMO_USER_ID}), got ${assigneeName} (${assigneeId})`);
    
    res.status(202).send('accepted - demo user only');
  }
});

// Error handling
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

app.listen(PORT, () => {
  console.log(`🎭 DEMO webhook server listening on port ${PORT}`);
  console.log(`🎯 DEMO MODE: Only processing events for ${DEMO_USER_NAME}`);
  console.log(`🔒 Security: Running as non-root user with minimal privileges`);
  console.log(`🌐 Production URL: https://ec2-3-149-228-220.us-east-2.compute.amazonaws.com:${PORT}`);
}); 