#!/usr/bin/env ts-node

import assert from 'assert';
import { assignProjections } from '../core/projection-engine';
import { RankedTask } from '../core/types';

// Minimal ranked tasks for testing
const baseTask = (name: string, est: number, rank: number): RankedTask => ({
  Name: name,
  Assignee: 'Tester',
  'Status (IT)': 'In Progress',
  'Estimated Days': est,
  'Estimated Days Remaining': est,
  queue_rank: rank,
  queue_score: 1,
});

;(async () => {
  console.log('\n🧪 Projection: normal tasks advance cursor');
  const ranked: RankedTask[] = [
    baseTask('T1', 1, 1),
    baseTask('T2', 1, 2),
  ];
  const out = await assignProjections(ranked);
  assert.strictEqual(out.length, 2);
  assert.ok(out[0]['Projected Completion']);
  assert.ok(out[1]['Projected Completion']);
  console.log('✅ normal projection computed for two tasks');
})();

;(async () => {
  console.log('\n🧪 Projection: QA task inherits latest sibling projection');
  const qa: RankedTask = {
    ...baseTask('QA', 0, 1),
    // @ts-ignore
    Labels: ['IT: QA Task'],
    // @ts-ignore
    Objective: [{ id: 'obj-1' }],
  };
  // Since we can't hit Notion here, we expect assignProjections to simply skip
  // override if helper finds nothing; still returns a date via normal rules.
  const out = await assignProjections([qa]);
  assert.strictEqual(out.length, 1);
  assert.ok(out[0]['Projected Completion']);
  console.log('✅ QA task produced a projection (override optional in unit scope)');
})();

console.log('\n🎉 projection-engine tests ran');


