#!/usr/bin/env ts-node

import * as dotenv from 'dotenv';
dotenv.config();

import { createBaseApp } from './base-server';
import { PORT, DEBOUNCE_MS } from '../config';
import { startScheduler } from '../scheduler';

const app = createBaseApp();

const scheduler = startScheduler({ debounceMs: DEBOUNCE_MS, enableLogging: true });

app.post('/notion-webhook', async (req, res) => {
  const assignee = req.body?.data?.properties?.Assignee?.people?.[0];
  const assigneeId = assignee?.id;
  const assigneeName = assignee?.name;

  if (assigneeId && assigneeName) {
    scheduler.routeEvent(assigneeId, assigneeName);
    res.status(202).send('accepted');
  } else {
    res.status(202).send('accepted - no assignee');
  }
});

app.listen(PORT, () => {
  console.log(`Webhook server listening on port ${PORT}`);
});
