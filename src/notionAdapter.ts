import notion from './services/notion_client';
import { Task, ProcessedTask, EXCLUDED_STATUSES } from './types';
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
        'Parent Task': parentTask
      } as Task);
    }
    
    cursor = res.has_more && res.next_cursor ? res.next_cursor : undefined;
  } while (cursor);

  return tasks;
}

/**
 * Clears queue rank values for all tasks assigned to a specific user
 */
export async function clearQueueRanks(databaseId: string, userFilter: string): Promise<void> {
  console.log(`🧹 Clearing queue ranks for user: ${userFilter}`);
  
  let cursor: string | undefined = undefined;
  let clearedCount = 0;

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
      // No client-side filtering needed - database already filtered
      const pagesClient = await notion.pages();
      await pagesClient.update({
        page_id: page.id,
        properties: {
          'Queue Rank': {
            number: null
          }
        }
      });
      
      clearedCount++;
    }
    
    cursor = res.has_more && res.next_cursor ? res.next_cursor : undefined;
  } while (cursor);

  console.log(`✅ Cleared queue ranks for ${clearedCount} tasks`);
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
        'Projected Days to Completion': {
          number: task['Projected Days to Completion']
        }
      }
    });
  }
} 