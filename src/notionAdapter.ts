import notion from './services/notion_client';
import { Task, ProcessedTask } from './types';

/**
 * Loads tasks from Notion database
 */
export async function loadTasks(databaseId: string, userFilter?: string): Promise<Task[]> {
  const tasks: Task[] = [];
  let cursor: string | undefined = undefined;

  do {
    const notionClient = await notion.databases();
    const res = await notionClient.query({
      database_id: databaseId,
      page_size: 100,
      start_cursor: cursor,
    });
    
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

      // Skip pages with excluded statuses
      if (['Backlogged', 'Done', 'Live in Dev', 'Ready for QA', 'Live in Staging'].includes(status)) {
        continue;
      }

      // Filter by user if specified
      if (userFilter && owner !== userFilter) {
        continue;
      }

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