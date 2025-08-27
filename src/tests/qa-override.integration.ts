#!/usr/bin/env ts-node

import assert from 'assert';
import { calculateQueueRankAsync } from '../core/queue-ranking';

// This test simulates tasks where a QA task inherits sibling projection via Objective.
// We don't hit the Notion API; the helper will return undefined and the engine
// will compute a normal projection. This ensures the path does not break.

;(async () => {
  const tasks: any[] = [
    {
      Name: 'Feature A',
      Assignee: 'Tester',
      'Status (IT)': 'In Progress',
      'Estimated Days': 1,
      'Estimated Days Remaining': 1,
    },
    {
      Name: 'QA for Feature A',
      Assignee: 'Tester',
      'Status (IT)': 'In Progress',
      'Estimated Days': 0,
      'Estimated Days Remaining': 0,
      Labels: ['IT: QA Task'],
      Objective: [{ id: 'obj-1' }],
    }
  ];

  const out = await calculateQueueRankAsync(tasks as any);
  assert.strictEqual(out.length, 2);
  assert.ok(out[0]['Projected Completion']);
  assert.ok(out[1]['Projected Completion']);
  console.log('✅ QA override path exercised (no API dependency)');
})();


