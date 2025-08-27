import notion from '../api/client';
import { ALLOW_AUTOMATION_EVENTS, ALLOW_BOT_EVENTS } from './config';

export type AuthorKind = 'person' | 'integration' | 'automation' | 'unknown';

export interface Classification {
  kind: AuthorKind;
  id?: string;
  source: 'page';
  reason?: string;
}

function preview(payload: unknown): string {
  try {
    const s = JSON.stringify(payload);
    return s.length > 2000 ? s.slice(0, 2000) + '…' : s;
  } catch {
    return '[unserializable]';
  }
}

/**
 * Classify actor from a Notion Automation "Send webhook" payload (Page object).
 * Uses Users API (requires user information capability). If the user cannot
 * be retrieved (403/404/etc.), treat it as an Automation actor.
 */
export async function classifyFromPage(payload: any): Promise<Classification> {
  const id = payload?.last_edited_by?.id ?? payload?.created_by?.id;
  if (!id) return { kind: 'unknown', source: 'page', reason: 'no last_edited_by/created_by id' };

  try {
    const users = await notion.users();
    // @ts-ignore notion.users().retrieve typed loosely in wrapper
    const user = await users.retrieve({ user_id: id });
    const t = (user as any)?.type;
    if (t === 'person') return { kind: 'person', id, source: 'page' };
    if (t === 'bot') return { kind: 'integration', id, source: 'page' };
    return { kind: 'unknown', id, source: 'page', reason: `unexpected user.type: ${t}` };
  } catch {
    return { kind: 'automation', id, source: 'page', reason: 'users.retrieve failed' };
  }
}

export function shouldProcess(kind: AuthorKind): boolean {
  if (kind === 'person') return true;
  if (kind === 'integration') return ALLOW_BOT_EVENTS;
  if (kind === 'automation') return ALLOW_AUTOMATION_EVENTS;
  return false;
}

export function logClassification(eventId: string, klass: Classification): void {
  // eslint-disable-next-line no-console
  console.log({
    event_id: eventId,
    actor_id: klass?.id,
    classification: klass?.kind,
    source: klass?.source,
    reason: klass?.reason,
  }, '👤 Author classification result');
}

export function logSkip(eventId: string, classification?: AuthorKind): void {
  // eslint-disable-next-line no-console
  console.log({ event_id: eventId, classification }, '🛑 Skipping event due to actor policy');
}

export { preview };


