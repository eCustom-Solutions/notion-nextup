#!/usr/bin/env ts-node

import assert from 'assert';
import { routeAssignees } from '../assignee-router';

class StubScheduler {
  public events: Array<{ id: string; name: string }> = [];
  routeEvent(id: string, name: string) {
    console.log(`  📤 Scheduler.routeEvent called with: id=${id}, name=${name}`);
    this.events.push({ id, name });
  }
}

function buildPayload(people: Array<{ id?: string; name?: string }>) {
  const payload = {
    data: {
      properties: {
        Assignee: { people },
      },
    },
  };
  console.log(`  📦 Built payload with ${people.length} people:`, people);
  return payload;
}

// 1. Single assignee
;(async () => {
  console.log('\n🧪 Test 1: Single assignee');
  const scheduler = new StubScheduler();
  const payload = buildPayload([{ id: 'u1', name: 'Alice' }]);
  console.log(`  🔍 Calling routeAssignees(payload, scheduler)`);
  const count = await routeAssignees(payload, scheduler as any);
  console.log(`  📊 Result: count=${count}, events.length=${scheduler.events.length}`);
  assert.strictEqual(count, 1, 'should enqueue one assignee');
  assert.deepStrictEqual(scheduler.events[0], { id: 'u1', name: 'Alice' });
  console.log('✅ single-assignee test passed');
})();

// 2. Multiple assignees
;(async () => {
  console.log('\n🧪 Test 2: Multiple assignees');
  const scheduler = new StubScheduler();
  const payload = buildPayload([
    { id: 'u1', name: 'Alice' },
    { id: 'u2', name: 'Bob' },
    { id: 'u3', name: 'Charlie' },
  ]);
  console.log(`  🔍 Calling routeAssignees(payload, scheduler)`);
  const count = await routeAssignees(payload, scheduler as any);
  console.log(`  📊 Result: count=${count}, events.length=${scheduler.events.length}`);
  console.log(`  📋 Events captured:`, scheduler.events);
  assert.strictEqual(count, 3, 'should enqueue all three assignees');
  assert.strictEqual(scheduler.events.length, 3);
  console.log('✅ multi-assignee test passed');
})();

// 3. Allowlist filtering
;(async () => {
  console.log('\n🧪 Test 3: Allowlist filtering');
  const scheduler = new StubScheduler();
  const payload = buildPayload([
    { id: 'u1', name: 'Alice' },
    { id: 'u2', name: 'Bob' },
  ]);
  const allow = new Set<string>(['u2']);
  console.log(`  🔒 Allowlist:`, Array.from(allow));
  console.log(`  🔍 Calling routeAssignees(payload, scheduler, allowlist)`);
  const count = await routeAssignees(payload, scheduler as any, allow);
  console.log(`  📊 Result: count=${count}, events.length=${scheduler.events.length}`);
  console.log(`  📋 Events captured:`, scheduler.events);
  assert.strictEqual(count, 1, 'should enqueue only allowed assignee');
  assert.deepStrictEqual(scheduler.events, [{ id: 'u2', name: 'Bob' }]);
  console.log('✅ allowlist test passed');
})();

// 4. No assignees
;(async () => {
  console.log('\n🧪 Test 4: No assignees');
  const scheduler = new StubScheduler();
  const payload = buildPayload([]);
  console.log(`  🔍 Calling routeAssignees(payload, scheduler)`);
  const count = await routeAssignees(payload, scheduler as any);
  console.log(`  📊 Result: count=${count}, events.length=${scheduler.events.length}`);
  assert.strictEqual(count, 0, 'should enqueue zero when no people');
  assert.strictEqual(scheduler.events.length, 0);
  console.log('✅ empty-people test passed');
})();

console.log('\n🎉 All assignee-router unit tests passed');
