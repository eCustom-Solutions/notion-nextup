import { ProcessedTask, RankedTask, Task } from './types';
import { USE_INTRADAY, WORKDAY_START_HOUR, WORKDAY_END_HOUR } from '../webhook/config';
import { addBusinessHours, daysToHours } from '../utils/intraday';
import { calculateBusinessDaysFrom } from './queue-ranking';
import { latestProjectionForObjective } from '../api/objective-projection';

/**
 * Assign Projected Completion for already-ranked tasks.
 * - Resets projection cursor per owner (assignee)
 * - Mirrors legacy logic for intraday vs business-day modes
 * - Preserves the special-case for first task with zero estimate → today (Mon if weekend)
 *
 * Read me first (context):
 * - Source of estimates: Upstream, the Notion adapter prefers staging HOUR fields when
 *   PREFER_ESTIMATED_HOURS_STAGING is true, then converts those hours → days using the configured
 *   workday length. By the time tasks reach here, we treat all estimates as "days" for uniformity.
 * - Modes:
 *   • Intraday mode (USE_INTRADAY=true): We plan in business-hours precision. We convert days → hours
 *     via daysToHours(...) and walk the calendar with addBusinessHours(...), honoring weekends and
 *     work window [WORKDAY_START_HOUR, WORKDAY_END_HOUR].
 *   • Business-day mode: We only move in whole business days via calculateBusinessDaysFrom(...).
 * - Owner batching: We project independently per assignee so each person has their own time cursor.
 * - Queue rank: Tasks passed in are already ranked; we ensure stable order per owner.
 * - QA inheritance: If a task is labeled as QA for an Objective, we try to inherit the latest
 *   projection date from sibling tasks of the same Objective.
 */
export async function assignProjections(rankedTasks: RankedTask[]): Promise<ProcessedTask[]> {
  const tasksByOwner = new Map<string, RankedTask[]>();
  for (const t of rankedTasks) {
    const owner = t['Assignee'];
    if (!tasksByOwner.has(owner)) tasksByOwner.set(owner, []);
    tasksByOwner.get(owner)!.push(t);
  }

  const processed: ProcessedTask[] = [];

  for (const [owner, ownerTasks] of tasksByOwner) {
    // Ensure owner tasks are in rank order
    const sorted = [...ownerTasks].sort((a, b) => a.queue_rank - b.queue_rank);

    let businessDaysSoFar = 0;
    let cursorTime: Date | null = null;

    for (let i = 0; i < sorted.length; i++) {
      const task = sorted[i];
      const rawEstRemaining = task['Estimated Days Remaining'];
      const rawEstDays = task['Estimated Days'];
      // Single source of truth for estimate in "days". Upstream code may have started with hours
      // (staging) and converted to days for us; if not present, fall back to legacy days.
      const estimatedDaysRemaining = (rawEstRemaining ?? rawEstDays ?? 0);

      // QA override: inherit latest projection from sibling tasks of the same Objective
      const labels: string[] = (task as any)?.Labels ?? [];
      const isQATask = Array.isArray(labels) && labels.includes('IT: QA Task');
      
      // Debug logging for QA detection
      // Note: These logs are intentionally verbose during migrations/QA and can be dialed back later.
      if (task.Name.includes('QA') || task.Name.includes('qa')) {
        console.log(`🔍 QA task candidate: "${task.Name}"`);
        console.log(`   Labels: ${JSON.stringify(labels)}`);
        console.log(`   Objective: ${JSON.stringify((task as any)?.Objective)}`);
        console.log(`   Is QA task: ${JSON.stringify(isQATask)}`);
      }
      
      if (isQATask) {
        const objectiveId: string | undefined = (task as any)?.Objective?.[0]?.id;
        if (objectiveId) {
          console.log(`🎯 QA task "${task.Name}" has objective ${objectiveId}, fetching sibling projection...`);
          const inherited = await latestProjectionForObjective(objectiveId);
          if (inherited) {
            console.log(`✅ QA task "${task.Name}" inherited projection: ${inherited}`);
            processed.push({
              ...task,
              'Projected Completion': inherited,
              'Estimated Days Remaining': estimatedDaysRemaining,
              pageId: task.pageId || '',
            } as ProcessedTask);
            continue;
          } else {
            console.log(`⚠️ QA task "${task.Name}" no sibling projection found, falling back to normal calculation`);
          }
        } else {
          console.log(`⚠️ QA task "${task.Name}" has no objective relation`);
        }
      }

      let projectedCompletion: string;

      if (USE_INTRADAY) {
        // Intraday (hour-accurate) planning
        // 1) choose an anchor not before the task's start
        const startDate = task['Task Started Date'] ? new Date(task['Task Started Date']) : new Date();
        const anchor = cursorTime ? new Date(Math.max(cursorTime.getTime(), startDate.getTime())) : startDate;
        // 2) convert days → hours using configured work window, then walk business hours
        const completion = addBusinessHours(anchor, daysToHours(estimatedDaysRemaining, WORKDAY_START_HOUR, WORKDAY_END_HOUR));
        cursorTime = completion;
        projectedCompletion = completion.toISOString().split('T')[0];
      } else {
        // Business-day (whole-day) planning
        businessDaysSoFar += estimatedDaysRemaining;
        const startDate = task['Task Started Date'] ? new Date(task['Task Started Date']) : new Date();
        const completionDate = calculateBusinessDaysFrom(startDate, businessDaysSoFar);
        projectedCompletion = completionDate.toISOString().split('T')[0];
      }

      // Special-case: first ranked task for owner with zero/blank estimate → today (Mon if weekend)
      // This preserves historical behavior so "start now" tasks don't appear in the past or undefined.
      if (i === 0 && (!rawEstRemaining && !rawEstDays || estimatedDaysRemaining === 0)) {
        const today = new Date();
        const todayAdj = calculateBusinessDaysFrom(today, 0);
        projectedCompletion = todayAdj.toISOString().split('T')[0];
      }

      processed.push({
        ...task,
        'Projected Completion': projectedCompletion,
        'Estimated Days Remaining': estimatedDaysRemaining,
        pageId: task.pageId || '',
      } as ProcessedTask);
    }
  }

  return processed;
}


