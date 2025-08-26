#!/usr/bin/env ts-node

import assert from 'assert';
import { routeAssignees } from '../assignee-router';

class StubScheduler {
  public events: Array<{ id: string; name: string }> = [];
  routeEvent(id: string, name: string) {
    this.events.push({ id, name });
  }
}

function buildPayload(authors: Array<{ id?: string; type?: string }>) {
  return {
    id: 'evt-1',
    authors,
    data: {
      properties: {
        Assignee: {
          people: [{ id: 'u1', name: 'Alice' }],
        },
      },
    },
  };
}

// 1) Bot-only authors should be ignored
(() => {
  const scheduler = new StubScheduler();
  const payload = buildPayload([{ id: 'bot1', type: 'bot' }]);
  const count = routeAssignees(payload, scheduler as any);
  assert.strictEqual(count, 0, 'bot-only webhook should be ignored');
  assert.strictEqual(scheduler.events.length, 0);
})();

// 2) Human author should be processed
(() => {
  const scheduler = new StubScheduler();
  const payload = buildPayload([{ id: 'user1', type: 'person' }]);
  const count = routeAssignees(payload, scheduler as any);
  assert.strictEqual(count, 1, 'human webhook should enqueue');
  assert.deepStrictEqual(scheduler.events[0], { id: 'u1', name: 'Alice' });
})();

console.log('\n🎉 Author filter unit tests passed');
