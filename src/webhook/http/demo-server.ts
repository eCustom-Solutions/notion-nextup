#!/usr/bin/env ts-node

import * as dotenv from 'dotenv';
dotenv.config();

import { createBaseApp } from './base-server';
import { PORT, DEBOUNCE_MS, DEMO_USER_ID, DEMO_USER_NAME } from '../config';
import { startScheduler } from '../scheduler';

const app = createBaseApp();

const scheduler = startScheduler({ debounceMs: DEBOUNCE_MS, enableLogging: true });

app.post('/notion-webhook', async (req, res) => {
  const assignee = req.body?.data?.properties?.Assignee?.people?.[0];
  const assigneeId = assignee?.id;
  const assigneeName = assignee?.name;

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
