#!/usr/bin/env ts-node

// Initialize structured logging & env first
import '../../utils/logger';
import * as dotenv from 'dotenv';
dotenv.config();

import { createBaseApp } from './base-server';
import { PORT, DEBOUNCE_MS, DEMO_USER_ID, DEMO_USER_NAME, OBJECTIVES_DB_ID } from '../config';
import { startScheduler } from '../scheduler';

const app = createBaseApp();

const scheduler = startScheduler({ debounceMs: DEBOUNCE_MS, enableLogging: true });

app.post('/notion-webhook', async (req, res) => {
  const assignee = req.body?.data?.properties?.Assignee?.people?.[0];
  const assigneeId = assignee?.id;
  const assigneeName = assignee?.name;
  const parentDb = req.body?.data?.parent?.database_id as string | undefined;

  if (OBJECTIVES_DB_ID && parentDb === OBJECTIVES_DB_ID) {
    console.log(`🎯 Objective event received (demo) for page ${req.body?.data?.id} in DB ${parentDb}`);
    return res.status(200).send('accepted - objective event logged');
  }

  if (assigneeId === DEMO_USER_ID && assigneeName === DEMO_USER_NAME) {
    scheduler.routeEvent(assigneeId, assigneeName);
    res.status(200).send('accepted - demo user processed');
  } else {
    res.status(202).send('accepted - demo user only');
  }
});

app.listen(PORT, () => {
  console.log(`DEMO webhook server listening on port ${PORT}`);
});
