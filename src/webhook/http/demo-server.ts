#!/usr/bin/env ts-node

import * as dotenv from 'dotenv';
dotenv.config();

import { createBaseApp } from './base-server';
import { PORT, DEBOUNCE_MS, DEMO_USER_ID, DEMO_USER_NAME } from '../config';
import { DebounceManager, delayedExecution, DebounceOptions } from '../debounce';
import { invokePipeline } from '../runtime/invoke-pipeline';

const app = createBaseApp();

const debounceOptions: DebounceOptions = {
  debounceMs: DEBOUNCE_MS,
  enableLogging: true,
};
const debounceManager = new DebounceManager(debounceOptions, delayedExecution);

app.post('/notion-webhook', async (req, res) => {
  const assignee = req.body?.data?.properties?.Assignee?.people?.[0];
  const assigneeId = assignee?.id;
  const assigneeName = assignee?.name;

  if (assigneeId === DEMO_USER_ID && assigneeName === DEMO_USER_NAME) {
    debounceManager.processEvent(assigneeId, assigneeName, (userId, userName) => 
      invokePipeline(userId, userName)
    ).catch((e: Error) => console.error('pipeline error:', e));
    res.status(200).send('accepted - demo user processed');
  } else {
    res.status(202).send('accepted - demo user only');
  }
});

app.listen(PORT, () => {
  console.log(`DEMO webhook server listening on port ${PORT}`);
});
