import notion from './client';

const cache = new Map<string, string | undefined>(); // objectiveId -> ISO date

export async function latestProjectionForObjective(objectiveId: string): Promise<string | undefined> {
  if (!objectiveId) return undefined;
  if (cache.has(objectiveId)) return cache.get(objectiveId);

  const tasksDbId = process.env.NOTION_DB_ID as string;
  if (!tasksDbId) return undefined;

  const db = await notion.databases();
  let cursor: string | undefined = undefined;
  let latest: string | undefined = undefined;

  do {
    const res = await db.query({
      database_id: tasksDbId,
      page_size: 100,
      start_cursor: cursor,
      filter: {
        property: 'Objective',
        relation: { contains: objectiveId }
      },
      sorts: [
        { property: 'Projected Completion', direction: 'descending' } as any
      ]
    } as any);

    const results: any[] = (res as any).results || [];
    for (const page of results) {
      const proj = (page as any)?.properties?.['Projected Completion']?.date?.start as string | undefined;
      if (proj) { latest = proj; break; }
    }

    cursor = (res as any).has_more ? (res as any).next_cursor : undefined;
  } while (cursor && !latest);

  cache.set(objectiveId, latest);
  return latest;
}

export function clearObjectiveProjectionCache(): void {
  cache.clear();
}


