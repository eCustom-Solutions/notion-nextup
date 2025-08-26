import { Scheduler } from './scheduler';

/**
 * Routes all assignees found in a Notion webhook payload to the scheduler.
 * Optionally takes an allowlist of UUIDs; if provided and non-empty, only
 * assignees whose `id` is present in the allowlist will be enqueued.
 *
 * @returns the number of assignees enqueued
 */
// Helper: determine if webhook was triggered by at least one human author
function isHumanTriggered(payload: unknown): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const authors = (payload as any)?.authors as Array<{ id?: string; type?: string }> | undefined;
  if (!authors || authors.length === 0) return true; // default: treat as human if unknown
  return authors.some(a => a?.type === 'person');
}

export function routeAssignees(
  payload: unknown,
  scheduler: Scheduler,
  allowlist?: Set<string>
): number {
  // Ignore events triggered solely by bots/agents
  if (!isHumanTriggered(payload)) {
    /* eslint-disable no-console */
    console.log(`🤖 Ignored webhook triggered by bot only id=${(payload as any)?.id ?? 'unknown'}`);
    /* eslint-enable no-console */
    return 0;
  }
  // Notion webhook shape: payload.data.properties.Assignee.people is an array
  // of { id, name }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const people = (payload as any)?.data?.properties?.Assignee?.people ?? [];
  let count = 0;
  for (const person of people) {
    const id: string | undefined = person?.id;
    const name: string | undefined = person?.name;
    if (!id || !name) continue;
    if (allowlist && allowlist.size > 0 && !allowlist.has(id)) continue;
    scheduler.routeEvent(id, name);
    count += 1;
  }
  return count;
}
