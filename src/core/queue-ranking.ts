import { Task, ProcessedTask, EXCLUDED_STATUSES, PRIORITY_MAP } from './types';
import { USE_INTRADAY, WORKDAY_START_HOUR, WORKDAY_END_HOUR } from '../webhook/config';
import { addBusinessHours, daysToHours } from '../utils/intraday';

/**
 * Core business logic for Notion NextUp task processing
 * This module contains the core algorithms that work with Task data
 * regardless of the data source (Notion API, etc.)
 */

/**
 * Determines if a task is eligible for processing
 */
export function isEligible(task: Task): boolean {
  return task['Assignee'].trim() !== '' && 
         !EXCLUDED_STATUSES.includes(task['Status (IT)']);
}

/**
 * Parses a date string into a Date object
 */
export function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  
  // Handle "Month DD, YYYY" format
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Gets the numeric priority value for sorting
 */
export function getPriorityValue(priority: string | undefined): number {
  if (!priority) return PRIORITY_MAP[''];
  return PRIORITY_MAP[priority as keyof typeof PRIORITY_MAP] ?? PRIORITY_MAP[''];
}

/**
 * Builds a hierarchy map of parent-child task relationships
 */
export function buildTaskHierarchy(tasks: Task[]): Map<string, Task[]> {
  const taskMap = new Map<string, Task>();
  const childrenMap = new Map<string, Task[]>();
  
  // Build task map
  for (const task of tasks) {
    taskMap.set(task.Name, task);
    childrenMap.set(task.Name, []);
  }
  
  // Build parent-child relationships
  for (const task of tasks) {
    if (task['Parent Task'] && taskMap.has(task['Parent Task'])) {
      const parent = taskMap.get(task['Parent Task'])!;
      const children = childrenMap.get(parent.Name) || [];
      children.push(task);
      childrenMap.set(parent.Name, children);
    }
  }
  
  return childrenMap;
}

/**
 * Calculates a queue score for a task based on multiple factors
 * Higher score = higher priority
 */
export function calculateQueueScore(task: Task): number {
  // TEMPORARY PATCH: Only use Importance stat for queue ranking
  const importance = task['Importance Rollup'] || 0;
  return importance;
}

/**
 * Calculates a date that is a specified number of business days from a start date
 * Accounts for weekends and moves weekend dates to Monday
 */
export function calculateBusinessDaysFrom(startDate: Date, businessDays: number): Date {
  let currentDate = new Date(startDate);
  let daysAdded = 0;
  
  while (daysAdded < businessDays) {
    currentDate.setDate(currentDate.getDate() + 1);
    
    // Skip weekends (Saturday = 6, Sunday = 0)
    const dayOfWeek = currentDate.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      daysAdded++;
    }
  }
  
  // If final date falls on weekend, move to Monday
  const finalDayOfWeek = currentDate.getDay();
  if (finalDayOfWeek === 6) { // Saturday
    currentDate.setDate(currentDate.getDate() + 2); // Move to Monday
  } else if (finalDayOfWeek === 0) { // Sunday
    currentDate.setDate(currentDate.getDate() + 1); // Move to Monday
  }
  
  return currentDate;
}

/**
 * Calculates queue rankings and projected completion times for tasks
 * This is the core algorithm that processes tasks per person
 * @param tasks - Tasks to process (should be pre-filtered by user if targeting specific user)
 */
export function calculateQueueRank(tasks: Task[]): ProcessedTask[] {
  // Group tasks by owner
  const tasksByOwner = new Map<string, Task[]>();
  
  for (const task of tasks) {
    if (!isEligible(task)) continue;
    
    const owner = task['Assignee'];
    if (!tasksByOwner.has(owner)) {
      tasksByOwner.set(owner, []);
    }
    tasksByOwner.get(owner)!.push(task);
  }
  
  const processedTasks: ProcessedTask[] = [];
  const taskHierarchy = buildTaskHierarchy(tasks);
  
  // Process each owner's tasks
  for (const [owner, ownerTasks] of tasksByOwner) {
    console.log(`Processing tasks for: ${owner}`);
    console.log(`📊 Processing ${ownerTasks.length} tasks for ${owner}`);
    
    // Calculate scores and sort tasks for this owner
    console.log('\n🧮 Calculating scores for each task:');
    const tasksWithScores = ownerTasks.map(task => {
      const score = calculateQueueScore(task);
      console.log(`  "${task.Name}" - Score: ${score} (Priority: ${task['Priority']}, Due: ${task['Due']}, Est Days: ${task['Estimated Days']}, Importance: ${task['Importance Rollup'] || 0})`);
      return { task, score };
    });
    
    console.log('\n📊 Sorting tasks by score...');
    const sortedTasks = tasksWithScores
      .sort((a, b) => {
        // Primary: Higher score first
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        
        // Secondary: Parent before child (depth-first)
        const aIsParent = taskHierarchy.get(a.task.Name)?.some(child => child.Name === b.task.Name);
        const bIsParent = taskHierarchy.get(b.task.Name)?.some(child => child.Name === a.task.Name);
        
        if (aIsParent) return -1;
        if (bIsParent) return 1;
        
        // Tertiary: Original order (deterministic)
        return tasks.indexOf(a.task) - tasks.indexOf(b.task);
      })
      .map(item => item.task);
    
    console.log('\n📋 Final sorted order:');
    sortedTasks.forEach((task, index) => {
      const score = calculateQueueScore(task);
      console.log(`  ${index + 1}. "${task.Name}" (Score: ${score})`);
    });
    
    // Calculate queue rank and projected completion dates
    let businessDaysSoFar = 0;
    let cursorTime: Date | null = null;
    for (let i = 0; i < sortedTasks.length; i++) {
      const task = sortedTasks[i];
      const rawEstRemaining = task['Estimated Days Remaining'];
      const rawEstDays = task['Estimated Days'];
      // Treat undefined/blank as 0 for calculations
      const estimatedDaysRemaining = rawEstRemaining ?? rawEstDays ?? 0;
      let projectedCompletion: string;
      if (USE_INTRADAY) {
        const startDate = task['Task Started Date'] ? new Date(task['Task Started Date']) : new Date();
        const anchor = cursorTime ? new Date(Math.max(cursorTime.getTime(), startDate.getTime())) : startDate;
        const completion = addBusinessHours(anchor, daysToHours(estimatedDaysRemaining, WORKDAY_START_HOUR, WORKDAY_END_HOUR));
        cursorTime = completion;
        projectedCompletion = completion.toISOString().split('T')[0];
      } else {
        businessDaysSoFar += estimatedDaysRemaining;
        const startDate = task['Task Started Date'] ? new Date(task['Task Started Date']) : new Date();
        const completionDate = calculateBusinessDaysFrom(startDate, businessDaysSoFar);
        projectedCompletion = completionDate.toISOString().split('T')[0];
      }
      
      // Special-case: if this is the first task in the queue **and** its estimate is 0/empty,
      // set Projected Completion to today (or next business day if today is a weekend).
      if (i === 0 && (!rawEstRemaining && !rawEstDays || estimatedDaysRemaining === 0)) {
        const today = new Date();
        const todayAdj = calculateBusinessDaysFrom(today, 0); // adjusts weekend → Monday
        projectedCompletion = todayAdj.toISOString().split('T')[0];
      }

      const processedTask: ProcessedTask = {
        ...task,
        queue_rank: i + 1,
        queue_score: calculateQueueScore(task),
        'Projected Completion': projectedCompletion,
        'Estimated Days Remaining': estimatedDaysRemaining,
        pageId: task.pageId || ''
      };
      
      processedTasks.push(processedTask);
    }
  }
  
  return processedTasks;
}

 