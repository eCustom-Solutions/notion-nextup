#!/usr/bin/env ts-node

import express from 'express';
import * as dotenv from 'dotenv';
dotenv.config();

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

app.post('/notion-webhook', async (req, res) => {
  console.log('📨  Incoming webhook payload:');
  console.dir(req.body, { depth: 5 });
  
  // Extract assignee information from the webhook payload
  const assignee = req.body?.data?.properties?.Assignee?.people?.[0];
  const assigneeId = assignee?.id;
  const assigneeName = assignee?.name;
  
  console.log('🔍 Assignee info:', { assigneeId, assigneeName });
  console.log('🔍 Full assignee object:', assignee);
  
  // Show task details for debugging
  const taskName = req.body?.data?.properties?.Name?.title?.[0]?.plain_text || 'Unknown Task';
  console.log(`📋 Task being updated: "${taskName}"`);
  
  if (assigneeId && assigneeName) {
    console.log(`👤  Detected assignee: ${assigneeName} (${assigneeId})`);
    debounceManager.processEvent(assigneeId, assigneeName, (userId, userName) => 
      runNotionPipeline(userId, userName, pipelineOptions)
    ).catch((e: Error) => console.error('❌ pipeline error:', e));
  } else {
    console.log('⚠️  No assignee found, skipping queue update');
    res.status(202).send('accepted - no assignee');
    return;
  }
  
  res.status(202).send('accepted');
});

// simple liveness check
app.get('/healthz', (_, res) => res.send('ok'));

app.listen(PORT, () => {
  console.log(`🚀  Webhook server listening on port ${PORT}`);
  console.log(`📊  Process ID: ${process.pid}`);
  console.log(`👤  Running as user: ${process.env.USER || 'unknown'}`);
  console.log(`🌐  Server URL: http://localhost:${PORT}`);
  console.log(`🔗  Health endpoint: http://localhost:${PORT}/healthz`);
  console.log(`📨  Webhook endpoint: http://localhost:${PORT}/notion-webhook`);
});

// Add error handling
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
}); 