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


