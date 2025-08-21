#!/usr/bin/env ts-node

// Load env first, then initialize structured logging
import * as dotenv from 'dotenv';
dotenv.config();
import '../../utils/logger';

import { createBaseApp } from './base-server';
import { PORT, DEBOUNCE_MS, DEMO_USER_ID, DEMO_USER_NAME, OBJECTIVES_DB_ID } from '../config';
import { routeAssignees } from '../assignee-router';
import { startScheduler } from '../scheduler';

const app = createBaseApp();

const scheduler = startScheduler({ debounceMs: DEBOUNCE_MS, enableLogging: true });

app.post('/notion-webhook', async (req, res) => {
  const people = req.body?.data?.properties?.Assignee?.people || [];

  // In demo mode we only process events if Derious is one of the assignees
  const hasDemoUser = people.some((p: any) => p?.id === DEMO_USER_ID);
  if (hasDemoUser) {
    // Enqueue only Derious—even if others are present—to maintain demo safety
    scheduler.routeEvent(DEMO_USER_ID!, DEMO_USER_NAME!);
    res.status(200).send('accepted - demo user processed');
  } else {
    res.status(202).send('accepted - demo user only');
  }
  return;
});

app.listen(PORT, () => {
  console.log(`DEMO webhook server listening on port ${PORT}`);
});
