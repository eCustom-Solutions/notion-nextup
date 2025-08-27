import { Scheduler } from './scheduler';
import { classifyFromPage, shouldProcess, logClassification, logSkip } from './author-classifier';

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

export async function routeAssignees(
  payload: unknown,
  scheduler: Scheduler,
  allowlist?: Set<string>
): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p: any = payload as any;
  const pageLike = p?.data ?? p; // Automations send Page as body; tests may nest under data

  const klass = await classifyFromPage(pageLike);
  const eventId = p?.id ?? p?.request_id ?? pageLike?.id ?? 'unknown';
  logClassification(eventId, klass);
  if (!shouldProcess(klass.kind)) {
    logSkip(eventId, klass.kind);
    return 0;
  }

  const people = pageLike?.properties?.Assignee?.people ?? p?.data?.properties?.Assignee?.people ?? [];
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
