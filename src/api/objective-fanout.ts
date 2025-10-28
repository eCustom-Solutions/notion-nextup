import notion from './client';
import { TASK_OWNER_PROP } from '../webhook/config';
import { resolveUserFromPeoplePageId } from '../webhook/people';

export interface AssigneeRef {
  id: string;
  name: string;
}

export interface ObjectiveFanoutResult {
  assignees: AssigneeRef[];
  triedRelations: Array<{ name: string; taskCount: number }>;
}

/**
 * Fetch unique assignees for tasks in the Tasks DB that relate to the given Objective page.
 * Only minimal fields are read; caller should apply allowlist and enqueue users.
 */
export async function getAssigneesForObjective(
  tasksDatabaseId: string,
  objectivePageId: string,
  relationProperty?: string
): Promise<ObjectiveFanoutResult> {
  const notionClient = await notion.databases();
  // Build candidate relation properties
  let candidateRelations: string[] = [];
  if (relationProperty) {
    candidateRelations = [relationProperty];
  } else {
    const db = await notionClient.retrieve({ database_id: tasksDatabaseId } as any);
    const props = (db as any).properties || {};
    candidateRelations = Object.entries(props)
      .filter(([, v]: any) => v?.type === 'relation')
      .map(([name]) => name as string);
    if (candidateRelations.length === 0) candidateRelations = ['Objective'];
  }

  const unique = new Map<string, string>(); // id -> name
  const triedRelations: Array<{ name: string; taskCount: number }> = [];

  for (const relationName of candidateRelations) {
    let cursor: string | undefined = undefined;
    let relationTaskCount = 0;
    do {
      const res = await notionClient.query({
        database_id: tasksDatabaseId,
        page_size: 100,
        start_cursor: cursor,
        filter: {
          property: relationName,
          relation: { contains: objectivePageId }
        }
      } as any);

      const results: any[] = (res as any).results || [];
      relationTaskCount += results.length;
      for (const page of results) {
        const props = (page as any).properties || {};
        const ownerRel = props[TASK_OWNER_PROP]?.relation ?? [];
        if (Array.isArray(ownerRel) && ownerRel.length > 0) {
          const ownerPageId = ownerRel[0].id as string;
          const idName = await resolveUserFromPeoplePageId(ownerPageId);
          if (idName && !unique.has(idName.id)) unique.set(idName.id, idName.name);
        }
        // No legacy Assignee fallback; Owner-only mode
      }

      cursor = (res as any).has_more && (res as any).next_cursor ? (res as any).next_cursor : undefined;
    } while (cursor);

    triedRelations.push({ name: relationName, taskCount: relationTaskCount });
  }

  return { assignees: Array.from(unique.entries()).map(([id, name]) => ({ id, name })), triedRelations };
}


