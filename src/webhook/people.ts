import notion from '../api/client';
import { PEOPLE_DB_ID, PEOPLE_USER_PROP } from './config';

/**
 * Resolve the People database page id for a given Notion user UUID.
 * Returns null if the People DB is not configured or the page isn't found.
 */
export async function resolvePeoplePageIdForUserUuid(userUuid: string): Promise<string | null> {
  if (!PEOPLE_DB_ID) return null;
  try {
    const db = await notion.databases();
    const res: any = await db.query({
      database_id: PEOPLE_DB_ID,
      page_size: 1,
      filter: { property: PEOPLE_USER_PROP, people: { contains: userUuid } } as any,
    });
    const pg = (res?.results ?? [])[0];
    return pg?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve a Notion user (id, name) from a People database page id by reading
 * the configured PEOPLE_USER_PROP people property.
 * Returns null if the property is empty or resolution fails.
 */
export async function resolveUserFromPeoplePageId(peoplePageId: string): Promise<{ id: string; name: string } | null> {
  try {
    const pages = await notion.pages();
    const page: any = await pages.retrieve({ page_id: peoplePageId });
    const ppl = page?.properties?.[PEOPLE_USER_PROP]?.people ?? [];
    const id: string | undefined = ppl[0]?.id;
    const name: string | undefined = ppl[0]?.name;
    return id && name ? { id, name } : null;
  } catch {
    return null;
  }
}


