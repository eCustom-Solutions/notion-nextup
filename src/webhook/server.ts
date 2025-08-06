#!/usr/bin/env ts-node

import express from 'express';
import * as dotenv from 'dotenv';
dotenv.config();

import { calculateQueueRank } from '../core';
import { loadTasks, updateQueueRanksSurgically } from '../api';

const PORT = Number(process.env.PORT ?? 8080);
const DEBOUNCE_MS = 30_000;   // 30-second back-off
const app = express();
app.use(express.json({ limit: '1mb' }));

/**
 * Idempotent queue rebuild – called after each webhook but debounced so
 * bursts of events coalesce into one run.
 */
let lastRun = 0;
async function runPipeline() {
  if (Date.now() - lastRun < DEBOUNCE_MS) return;
  lastRun = Date.now();

  const db = process.env.NOTION_DB_ID;
  if (!db) throw new Error('NOTION_DB_ID missing in env');

  console.log('🔄  Rebuilding queue…');
  const allTasks   = await loadTasks(db);            // filtered inside
  const processed  = calculateQueueRank(allTasks);
  await updateQueueRanksSurgically(db, 'ALL', processed);
  console.log(`✅  Queue updated (${processed.length} tasks)`);
}

app.post('/notion-webhook', async (req, res) => {
  console.log('📨  Incoming webhook payload:');
  console.dir(req.body, { depth: 5 });
  runPipeline().catch(e => console.error('❌ pipeline error:', e));
  res.status(202).send('accepted');
});

// simple liveness check
app.get('/healthz', (_, res) => res.send('ok'));

app.listen(PORT, () => {
  console.log(`🚀  Webhook server listening on port ${PORT}`);
}); 