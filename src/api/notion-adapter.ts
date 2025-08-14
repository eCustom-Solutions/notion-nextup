import notion from './client';
import { Task, ProcessedTask, EXCLUDED_STATUSES } from '../core/types';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
import { findUserUUID } from './user-lookup';

/**
 * Loads tasks from Notion database
 */
export async function loadTasks(databaseId: string, userFilter?: string): Promise<Task[]> {
  const tasks: Task[] = [];
  let cursor: string | undefined = undefined;

  do {
    const notionClient = await notion.databases();
    
    // Use database-level filtering for both status and user (if userFilter provided)
    const queryParams: any = {
      database_id: databaseId,
      page_size: 100,
      start_cursor: cursor,
    };

    // Build filter conditions
    const filterConditions: any[] = [
      // Status filter: exclude all excluded statuses
      ...EXCLUDED_STATUSES.map(status => ({
        property: 'Status (IT)',
        status: { does_not_equal: status }
      }))
    ];

    // Add user filter if specified
    if (userFilter) {
      const userUUID = await findUserUUID(userFilter);
      if (userUUID) {
        filterConditions.push({
          property: 'Assignee',
          people: { contains: userUUID }
        });
      } else {
        console.warn(`⚠️ Could not find UUID for user: ${userFilter}. Falling back to client-side filtering.`);
      }
    }

    // Apply filters
    if (filterConditions.length === 1) {
      queryParams.filter = filterConditions[0];
    } else if (filterConditions.length > 1) {
      queryParams.filter = { and: filterConditions };
    }

    const res = await notionClient.query(queryParams);
    
    for (const page of res.results) {
      if ((page as any).archived === true) continue;
      // Extract properties from Notion page
      const props = (page as any).properties;
      const title = props['Name']?.title?.[0]?.plain_text ?? '';
      const ownerPeople = props['Assignee']?.people ?? [];
      const owner = ownerPeople[0]?.name ?? '';
      const status = props['Status (IT)']?.status?.name ?? '';
      const estDays = props['Estimated Days']?.number ?? 0;
      const estRem = props['Estimated Days Remaining']?.number ?? estDays;
      const dueDate = props['Due']?.date?.start
        ? new Date(props['Due'].date.start).toLocaleDateString('en-US', { 
            month: 'long', 
            day: 'numeric', 
            year: 'numeric' 
          })
        : undefined;
      const priority = props['Priority']?.status?.name ?? '';
      const parentTaskId = props['Parent Task']?.relation?.[0]?.id;
      const parentTask = parentTaskId && parentTaskId !== null ? String(parentTaskId) : undefined;
      
      const importanceRollup = props['Importance Rollup']?.rollup?.number ?? 0;
      
      // Read date properties
      const taskStartedDate = props['Task Started Date']?.date?.start;
      const projectedCompletion = props['Projected Completion']?.date?.start;

      // No client-side filtering needed - database already filtered
      tasks.push({
        pageId: page.id,
        Name: title,
        'Assignee': owner,
        'Status (IT)': status,
        'Estimated Days': estDays,
        'Estimated Days Remaining': estRem,
        'Due': dueDate,
        'Priority': priority,
        'Parent Task': parentTask,
        'Importance Rollup': importanceRollup,
        'Task Started Date': taskStartedDate,
        'Projected Completion': projectedCompletion
      } as Task);
    }
    
    cursor = res.has_more && res.next_cursor ? res.next_cursor : undefined;
  } while (cursor);

  return tasks;
}

/**
 * Clears Queue Rank for tasks for a user that are in excluded statuses and still have a rank set.
 * Returns the number of pages cleared.
 */
export async function clearExcludedQueueRanksForUser(
  databaseId: string,
  userFilter: string,
  limit: number = 50
): Promise<number> {
  let cleared = 0;
  let cursor: string | undefined = undefined;
  const userUUID = await findUserUUID(userFilter);

  do {
    const notionClient = await notion.databases();

    const statusFilters = EXCLUDED_STATUSES.map(status => ({
      property: 'Status (IT)',
      status: { equals: status }
    }));

    const andFilters: any[] = [
      { property: 'Queue Rank', number: { is_not_empty: true } },
    ];

    if (userUUID) {
      andFilters.push({ property: 'Assignee', people: { contains: userUUID } });
    }

    const queryParams: any = {
      database_id: databaseId,
      page_size: Math.min(100, limit - cleared > 0 ? limit - cleared : 0) || 1,
      start_cursor: cursor,
      filter: {
        and: [
          { or: statusFilters },
          ...andFilters,
        ]
      }
    };

    const res = await notionClient.query(queryParams);
    if (!res.results || res.results.length === 0) {
      break;
    }

    for (const page of res.results) {
      if (cleared >= limit) break;
      const pagesClient = await notion.pages();
      try {
        await pagesClient.update({ page_id: (page as any).id, properties: { 'Queue Rank': { number: null } } });
        cleared++;
      } catch (e: any) {
        const msg: string = e?.message || '';
        const code: string | undefined = e?.code;
        if (code === 'validation_error' && msg.includes('archived')) {
          console.warn(`⚠️ Skipping excluded clear on archived page ${(page as any).id}`);
        } else if (code === 'conflict_error') {
          try {
            await sleep(150);
            await pagesClient.update({ page_id: (page as any).id, properties: { 'Queue Rank': { number: null } } });
            cleared++;
          } catch {
            console.warn(`⚠️ Conflict clearing excluded rank on ${(page as any).id} – giving up`);
          }
        } else {
          console.warn(`⚠️ Failed clearing excluded rank on ${(page as any).id}:`, e);
        }
      }
    }

    cursor = (res as any).has_more && (res as any).next_cursor ? (res as any).next_cursor : undefined;
  } while (cursor && cleared < limit);

  return cleared;
}

/**
 * Updates queue ranks surgically - sets new ranks and clears old ones
 */
export async function updateQueueRanksSurgically(
  databaseId: string, 
  userFilter: string, 
  processedTasks: ProcessedTask[]
): Promise<void> {
  console.log(`🎯 Surgically updating queue ranks for user: ${userFilter}`);
  
  // Step 1: Set new queue ranks for processed tasks
  console.log(`📝 Setting new queue ranks for ${processedTasks.length} tasks...`);
  for (const task of processedTasks) {
    if (!task.pageId) {
      console.warn(`⚠️ Skipping task "${task.Name}" - no pageId found`);
      continue;
    }

    const pagesClient = await notion.pages();
    let attempt = 0;
    while (attempt < 3) {
      try {
        await pagesClient.update({
          page_id: task.pageId,
          properties: {
            'Queue Rank': { number: task.queue_rank },
            'Projected Completion': { date: { start: task['Projected Completion'] } }
          }
        });
        try {
          const updated = await pagesClient.retrieve({ page_id: task.pageId });
          const updatedProps: any = (updated as any).properties ?? {};
          const verifiedDate: string | undefined = updatedProps['Projected Completion']?.date?.start;
          const verifiedRank: number | null | undefined = updatedProps['Queue Rank']?.number;
          console.log(`🔎 Verified page ${task.pageId}: Projected Completion=${verifiedDate ?? 'undefined'}, Queue Rank=${verifiedRank ?? 'undefined'}`);
        } catch {
          console.warn(`⚠️ Verification failed for page ${task.pageId}`);
        }
        break;
      } catch (e: any) {
        const msg: string = e?.message || '';
        const code: string | undefined = e?.code;
        if (code === 'validation_error' && msg.includes('archived')) {
          console.warn(`⚠️ Skipping archived page ${task.pageId} (${task.Name})`);
          break;
        }
        if (code === 'conflict_error') {
          attempt++;
          await sleep(150 * attempt);
          continue;
        }
        console.error(`❌ Update failed for ${task.pageId} (${task.Name}):`, e);
        break;
      }
    }
  }
  console.log(`✅ Set queue ranks for ${processedTasks.length} tasks`);

  // Step 2: Clear queue ranks for tasks that shouldn't be in queue anymore
  console.log(`🧹 Clearing queue ranks for tasks no longer in queue...`);
  const processedTaskIds = new Set(processedTasks.map(t => t.pageId));
  let clearedCount = 0;

  let cursor: string | undefined = undefined;
  do {
    const notionClient = await notion.databases();
    
    // Use database-level filtering for both status and user
    const queryParams: any = {
      database_id: databaseId,
      page_size: 100,
      start_cursor: cursor,
    };

    // Build filter conditions
    const filterConditions: any[] = [
      // Status filter: exclude all excluded statuses
      ...EXCLUDED_STATUSES.map(status => ({
        property: 'Status (IT)',
        status: { does_not_equal: status }
      }))
    ];

    // Add user filter
    const userUUID = await findUserUUID(userFilter);
    if (userUUID) {
      filterConditions.push({
        property: 'Assignee',
        people: { contains: userUUID }
      });
    } else {
      console.warn(`⚠️ Could not find UUID for user: ${userFilter}. Falling back to client-side filtering.`);
    }

    // Apply filters
    if (filterConditions.length === 1) {
      queryParams.filter = filterConditions[0];
    } else if (filterConditions.length > 1) {
      queryParams.filter = { and: filterConditions };
    }

    const res = await notionClient.query(queryParams);
    
    for (const page of res.results) {
      // Only clear if this task is NOT in our processed tasks
      if (!processedTaskIds.has(page.id)) {
        const pagesClient = await notion.pages();
        try {
          await pagesClient.update({ page_id: page.id, properties: { 'Queue Rank': { number: null } } });
          clearedCount++;
        } catch (e: any) {
          const msg: string = e?.message || '';
          const code: string | undefined = e?.code;
          if (code === 'validation_error' && msg.includes('archived')) {
            console.warn(`⚠️ Skipping clear on archived page ${page.id}`);
          } else if (code === 'conflict_error') {
            try {
              await sleep(150);
              await pagesClient.update({ page_id: page.id, properties: { 'Queue Rank': { number: null } } });
              clearedCount++;
            } catch {
              console.warn(`⚠️ Conflict clearing rank on ${page.id} – giving up`);
            }
          } else {
            console.warn(`⚠️ Failed clearing rank on ${page.id}:`, e);
          }
        }
      }
    }
    
    cursor = res.has_more && res.next_cursor ? res.next_cursor : undefined;
  } while (cursor);

  console.log(`✅ Cleared queue ranks for ${clearedCount} tasks no longer in queue`);

  // Step 3: Clear queue ranks for tasks that are now in excluded statuses
  console.log(`🧹 Clearing queue ranks for excluded-status tasks...`);
  const clearedExcluded = await clearExcludedQueueRanksForUser(databaseId, userFilter);
  console.log(`✅ Cleared queue ranks for ${clearedExcluded} excluded-status tasks`);
}

/**
 * Writes processed tasks back to Notion database
 */
export async function writeBack(tasks: ProcessedTask[], dbId: string): Promise<void> {
  for (const task of tasks) {
    if (!task.pageId) {
      console.warn(`Skipping task "${task.Name}" - no pageId found`);
      continue;
    }

    const notionClient = await notion.pages();
    await notionClient.update({
      page_id: task.pageId,
      properties: {
        'Queue Rank': {
          number: task.queue_rank
        },
        'Projected Completion': {
          date: {
            start: task['Projected Completion']
          }
        }
      }
    });
  }
} 