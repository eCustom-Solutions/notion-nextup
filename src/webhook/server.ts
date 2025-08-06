#!/usr/bin/env ts-node

import express from 'express';
import * as dotenv from 'dotenv';
dotenv.config();

import { calculateQueueRank } from '../core';
import { loadTasks, updateQueueRanksSurgically } from '../api';

const PORT = Number(process.env.PORT ?? 443);
const DEBOUNCE_MS = 30_000;   // 30-second back-off
const app = express();
app.use(express.json({ limit: '1mb' }));

/**
 * Idempotent queue rebuild – called after each webhook but debounced so
 * bursts of events coalesce into one run.
 */
let lastRun = 0;
async function runPipeline(userId?: string, userName?: string) {
  if (Date.now() - lastRun < DEBOUNCE_MS) return;
  lastRun = Date.now();

  const db = process.env.NOTION_DB_ID;
  if (!db) throw new Error('NOTION_DB_ID missing in env');

  if (userId && userName) {
    console.log(`🔄  Rebuilding queue for user: ${userName} (${userId})`);
    
    // Load tasks with server-side filtering
    console.log('🔍 Loading tasks from Notion API...');
    const userTasks = await loadTasks(db, userName);
    console.log(`📊 Loaded ${userTasks.length} tasks for ${userName}`);
    
    // Calculate queue ranks
    console.log('🧮 Calculating queue ranks...');
    const processed = calculateQueueRank(userTasks);
    console.log(`📈 Processed ${processed.length} tasks with queue ranks`);
    
    // Update Notion database
    console.log('🚀 Updating Notion database with new queue ranks...');
    await updateQueueRanksSurgically(db, userName, processed);
    console.log(`✅  Queue updated for ${userName} (${processed.length} tasks)`);
    
    console.log('\n📝 Summary:');
    console.log(`   - Loaded ${userTasks.length} tasks for ${userName}`);
    console.log(`   - Calculated queue ranks for ${processed.length} tasks`);
    console.log(`   - Updated Notion database with new ranks and projected completion times`);
    
  } else {
    console.log('🔄  Rebuilding queue for all users…');
    const allTasks   = await loadTasks(db);
    const processed  = calculateQueueRank(allTasks);
    await updateQueueRanksSurgically(db, 'ALL', processed);
    console.log(`✅  Queue updated (${processed.length} tasks)`);
  }
}

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
    runPipeline(assigneeId, assigneeName).catch(e => console.error('❌ pipeline error:', e));
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