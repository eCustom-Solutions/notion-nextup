import { Scheduler } from './scheduler';
import { classifyFromPage, shouldProcess, logClassification, logSkip } from './author-classifier';
import notion from '../api/client';
import { ALLOWLIST_MODE, PEOPLE_DB_ID, PEOPLE_USER_PROP, TASK_OWNER_PROP } from './config';

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

  // New path: resolve identity from Owner relation if present
  const props = pageLike?.properties ?? {};
  const ownerRel = props[TASK_OWNER_PROP]?.relation as Array<{ id: string }> | undefined;
  let idName: { id: string; name: string } | null = null;
  if (ownerRel && ownerRel.length > 0 && PEOPLE_DB_ID) {
    const ownerPageId = ownerRel[0].id;
    try {
      const pages = await (await notion.pages());
      // Retrieve People page and read PEOPLE_USER_PROP (people property)
      const peoplePage: any = await pages.retrieve({ page_id: ownerPageId });
      const userProp = peoplePage?.properties?.[PEOPLE_USER_PROP]?.people ?? [];
      const uid: string | undefined = userProp[0]?.id;
      const uname: string | undefined = userProp[0]?.name;
      if (uid && uname) idName = { id: uid, name: uname };
    } catch {}
  }

  // Legacy fallback: Assignee people
  if (!idName) {
    const people = props?.Assignee?.people ?? [];
    const uid: string | undefined = people[0]?.id;
    const uname: string | undefined = people[0]?.name;
    if (uid && uname) idName = { id: uid, name: uname };
  }

  if (!idName) return 0;
  // If allowlist mode is people_db_has_user and no explicit allowlist provided, treat as allowed
  if (allowlist && allowlist.size > 0 && !allowlist.has(idName.id)) return 0;
  scheduler.routeEvent(idName.id, idName.name);
  return 1;
}
