import assert from 'assert';
import { calculateQueueRank } from '../core';
import { Task } from '../core/types';

function buildTask(name: string, order: number, est?: number): Task {
  return {
    Name: name,
    'Assignee': 'Alice',
    'Status (IT)': 'In Progress',
    'Estimated Days': est,
    'Estimated Days Remaining': est,
    'Importance Rollup': 50 + order,
    'Priority': 'Medium',
    'Due': '',
    'Parent Task': '',
    pageId: `page-${order}`,
    'Task Started Date': ''
  } as unknown as Task;
}

(() => {
  const tasks: Task[] = [
    buildTask('Zero-Est', 100, 0),
    buildTask('Second', 10, 2),
  ];
  const processed = calculateQueueRank(tasks);
  const top = processed.find(t => t.Name === 'Zero-Est')!;
  const today = new Date();
  const isoToday = today.toISOString().split('T')[0];
  assert.strictEqual(top['Projected Completion'], isoToday, 'Top zero-est task should complete today');
  console.log('✅ Projection zero-estimate top-task test passed');
})();
