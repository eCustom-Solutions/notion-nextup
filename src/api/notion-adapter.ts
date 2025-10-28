import notion from './client';
import { Task, ProcessedTask, EXCLUDED_STATUSES } from '../core/types';
import {
  ESTIMATED_HOURS_PROP,
  ESTIMATED_HOURS_REMAINING_PROP,
  WORKDAY_START_HOUR,
  WORKDAY_END_HOUR,
} from '../webhook/config';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
import { findUserUUID } from './user-lookup';
import { GROUP_BY_PROP, TASK_OWNER_PROP, PEOPLE_DB_ID, PEOPLE_USER_PROP, DEBUG_ROUTING } from '../webhook/config';

/**
 * Loads tasks from Notion database
 */
export async function loadTasks(databaseId: string, userFilter?: string): Promise<Task[]> {
  const tasks: Task[] = [];
  let cursor: string | undefined = undefined;
  
  // Helper: resolve People page id for a given Notion user UUID via People DB
  async function resolvePeoplePageIdForUser(userUuid: string): Promise<string | null> {
    if (!PEOPLE_DB_ID) {
      console.log('[resolvePeople] PEOPLE_DB_ID not set');
      return null;
    }
    try {
      const notionClient = await notion.databases();
      const queryParams = {
        database_id: PEOPLE_DB_ID,
        page_size: 1,
        filter: { property: PEOPLE_USER_PROP, people: { contains: userUuid } } as any,
      };
      console.log(`[resolvePeople] Querying People DB with config ${JSON.stringify({
        PEOPLE_DB_ID,
        PEOPLE_USER_PROP,
        userUuid
      })}`);
      console.log(`[resolvePeople] Query params: ${JSON.stringify(queryParams)}`);
      const res: any = await notionClient.query(queryParams);
      console.log(`[resolvePeople] Response meta: ${JSON.stringify({ has_more: res?.has_more, results_count: res?.results?.length ?? 0 })}`);
      const pg = (res?.results ?? [])[0];
      if (pg) {
        console.log(`[resolvePeople] Found People page: ${pg.id}`);
      } else {
        console.log(`[resolvePeople] No People page found for UUID: ${userUuid}`);
      }
      return pg?.id ?? null;
    } catch (e: any) {
      console.error(`[resolvePeople] Error querying People DB: ${JSON.stringify({
        name: e?.name,
        message: e?.message,
        code: e?.code,
        status: e?.status,
        body: e?.body,
        stack: e?.stack,
      })}`);
      return null;
    }
  }

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
        if (GROUP_BY_PROP === 'Owner') {
          console.log(`[load] Owner mode enabled; attempting People→User resolution ${JSON.stringify({
            userUUID,
            TASK_OWNER_PROP,
            PEOPLE_DB_ID_present: !!PEOPLE_DB_ID,
            PEOPLE_USER_PROP
          })}`);
          const peoplePageId = await resolvePeoplePageIdForUser(userUUID);
          if (peoplePageId) {
            filterConditions.push({
              property: TASK_OWNER_PROP,
              relation: { contains: peoplePageId }
            } as any);
            console.log(`[load] Using Owner relation filter with peoplePageId ${peoplePageId}`);
          } else {
            console.warn(`⚠️ Could not resolve People page for user UUID ${userUUID}; falling back to unfiltered load`);
          }
        } else {
          filterConditions.push({
            property: 'Assignee',
            people: { contains: userUUID }
          });
          console.log(`[load] Using legacy Assignee people filter for ${userUUID}`);
        }
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

    let res: any;
    try {
      if (DEBUG_ROUTING) {
        console.log('[load] Querying tasks with params:', JSON.stringify(queryParams));
      }
      res = await notionClient.query(queryParams);
    } catch (e: any) {
      const errInfo = {
        name: e?.name,
        message: e?.message,
        code: e?.code,
        status: e?.status,
        body: e?.body,
      };
      console.error('[load] Notion query failed', errInfo);
      // Abort load gracefully with whatever we have so far
      return tasks;
    }
    
    for (const page of res.results) {
      if ((page as any).archived === true) continue;
      // Extract properties from Notion page
      const props = (page as any).properties;
      const title = props['Name']?.title?.[0]?.plain_text ?? '';
      // Resolve owner display name or key for grouping
      let owner = '';
      // Prefer Owner relation title (fallback to Assignee people name)
      const ownerRel = props[TASK_OWNER_PROP]?.relation as Array<{ id: string }> | undefined;
      if (ownerRel && ownerRel.length > 0) {
        // Use the page id as owner key if no title field present; UI-only name map can be resolved upstream if needed
        owner = ownerRel[0].id;
      } else {
        const ownerPeople = props['Assignee']?.people ?? [];
        owner = ownerPeople[0]?.name ?? '';
      }
      const status = props['Status (IT)']?.status?.name ?? '';
      // Hours-only mode: require hours or hours-remaining, convert to days
      const workdayHours = WORKDAY_END_HOUR - WORKDAY_START_HOUR;
      const hours = props[ESTIMATED_HOURS_PROP]?.number;
      const hoursRem = props[ESTIMATED_HOURS_REMAINING_PROP]?.number;
      const hasHours = typeof hours === 'number';
      const hasHoursRem = typeof hoursRem === 'number';

      let estDays = 0;
      let estRem = 0;
      if (hasHoursRem) {
        estRem = (hoursRem as number) / workdayHours;
        estDays = estRem;
        console.log(`[estimate] Using hours-remaining for "${title}": ${hoursRem}h → ${estRem.toFixed(2)} days (workdayHours=${workdayHours})`);
      } else if (hasHours) {
        estDays = (hours as number) / workdayHours;
        estRem = estDays;
        console.log(`[estimate] Using hours(total) for "${title}": ${hours}h → ${estDays.toFixed(2)} days (workdayHours=${workdayHours})`);
      } else {
        // No hours present – skip task entirely (hours-only mode)
        console.log(`[estimate] Skipping "${title}" – no ${ESTIMATED_HOURS_REMAINING_PROP} or ${ESTIMATED_HOURS_PROP} set`);
        continue;
      }
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

      // Read Labels and Objective for QA override logic
      const labels = props['Labels']?.multi_select?.map((s: any) => s.name) ?? [];
      const objective = props['Objective']?.relation ?? [];
      
      // Debug logging for Labels property loading (only when DEBUG_LABELS=true)
      if ((process.env.DEBUG_LABELS === 'true') && (title.includes('QA') || title.includes('qa'))) {
        console.log(`🔍 Debug Labels for "${title}":`);
        console.log(`   Raw Labels prop: ${JSON.stringify(props['Labels'])}`);
        console.log(`   Labels type: ${typeof props['Labels']}`);
        console.log(`   Labels multi_select: ${JSON.stringify(props['Labels']?.multi_select)}`);
        console.log(`   Final labels array: ${JSON.stringify(labels)}`);
        console.log(`   All available properties: ${JSON.stringify(Object.keys(props))}`);
        console.log(`   Properties that contain 'label': ${JSON.stringify(Object.keys(props).filter(key => key.toLowerCase().includes('label')))}`);
        console.log(`   Properties that contain 'tag': ${JSON.stringify(Object.keys(props).filter(key => key.toLowerCase().includes('tag')))}`);
        
        // Check specific property names that might exist
        console.log(`   Has 'Labels' property: ${'Labels' in props}`);
        console.log(`   Has 'Tags' property: ${'Tags' in props}`);
        console.log(`   Has 'Label' property: ${'Label' in props}`);
        console.log(`   Has 'Tag' property: ${'Tag' in props}`);
        
        // Show first few properties in detail
        const propNames = Object.keys(props).slice(0, 5);
        for (const propName of propNames) {
          console.log(`   Property "${propName}": ${JSON.stringify(props[propName])}`);
        }
      }

      // No client-side filtering needed - database already filtered
      tasks.push({
        pageId: page.id,
        Name: title,
        // Store owner under both keys during transition for compatibility
        'Assignee': owner,
        'Owner': owner,
        'Status (IT)': status,
        'Estimated Days': estDays,
        'Estimated Days Remaining': estRem,
        'Due': dueDate,
        'Priority': priority,
        'Parent Task': parentTask,
        'Importance Rollup': importanceRollup,
        'Task Started Date': taskStartedDate,
        'Projected Completion': projectedCompletion,
        Labels: labels,
        Objective: objective
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

  // Local helper: resolve People page id for a Notion user UUID
  async function resolvePeoplePageIdForUserUuid(userUuid: string): Promise<string | null> {
    if (!PEOPLE_DB_ID) return null;
    try {
      const notionClient = await notion.databases();
      const res: any = await notionClient.query({
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
      if (GROUP_BY_PROP === 'Owner') {
        const peoplePageId = await resolvePeoplePageIdForUserUuid(userUUID);
        if (peoplePageId) {
          andFilters.push({ property: TASK_OWNER_PROP, relation: { contains: peoplePageId } } as any);
        } else {
          console.warn(`⚠️ Could not resolve People page for user UUID ${userUUID}; clearing ranks without owner filter`);
        }
      } else {
        andFilters.push({ property: 'Assignee', people: { contains: userUUID } });
      }
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
  console.log(`🔄 Updating queue ranks for user: ${userFilter}`);
  
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
          console.log(`📄 Page updated ${task.pageId}: Projected Completion=${verifiedDate ?? 'undefined'}, Queue Rank=${verifiedRank ?? 'undefined'}`);
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

    // Add user filter (Owner relation preferred)
    const userUUID = await findUserUUID(userFilter);
    if (userUUID) {
      if (GROUP_BY_PROP === 'Owner') {
        // Resolve People page id for this user's UUID
        try {
          const peopleDb = await notion.databases();
          const res: any = await peopleDb.query({
            database_id: PEOPLE_DB_ID,
            page_size: 1,
            filter: { property: PEOPLE_USER_PROP, people: { contains: userUUID } } as any,
          });
          const peoplePageId: string | undefined = (res?.results ?? [])[0]?.id;
          if (peoplePageId) {
            filterConditions.push({ property: TASK_OWNER_PROP, relation: { contains: peoplePageId } } as any);
          } else {
            console.warn(`⚠️ Could not resolve People page for user UUID ${userUUID}; clearing without owner filter`);
          }
        } catch (e) {
          console.warn('⚠️ Failed resolving People page for Owner filter:', e);
        }
      } else {
        filterConditions.push({ property: 'Assignee', people: { contains: userUUID } });
      }
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