import { Task } from './types';

/**
 * Return a custom projected completion date for the task, or undefined to fall back
 * to the default algorithm in queue-ranking.ts.
 *
 * Add rules here to special-case particular task types/statuses/etc.
 */
export function customProjectedCompletion(task: Task): Date | undefined {
  // TODO: add real rules. Returning undefined keeps current behaviour.
  return undefined;
}

