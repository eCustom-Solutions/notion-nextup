#!/usr/bin/env ts-node

import * as dotenv from 'dotenv';
dotenv.config();

import { createBaseApp } from './base-server';
import { PORT, DEBOUNCE_MS } from '../config';
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

  if (assigneeId && assigneeName) {
    debounceManager.processEvent(assigneeId, assigneeName, (userId, userName) => 
      invokePipeline(userId, userName)
    ).catch((e: Error) => console.error('pipeline error:', e));
    res.status(202).send('accepted');
  } else {
    res.status(202).send('accepted - no assignee');
  }
});

app.listen(PORT, () => {
  console.log(`Webhook server listening on port ${PORT}`);
});
