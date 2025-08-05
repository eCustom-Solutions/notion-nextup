import { Task, ProcessedTask, EXCLUDED_STATUSES, PRIORITY_MAP } from './types';

/**
 * Core business logic for Notion NextUp task processing
 * This module contains the core algorithms that work with Task data
 * regardless of the data source (CSV, Notion API, etc.)
 */

/**
 * Determines if a task is eligible for processing
 */
export function isEligible(task: Task): boolean {
  return task['Task Owner'].trim() !== '' && 
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
 * Calculates queue rankings and projected completion times for all tasks
 * This is the core algorithm that processes tasks per person
 */
export function calculateQueueRank(tasks: Task[]): ProcessedTask[] {
  // Group tasks by owner
  const tasksByOwner = new Map<string, Task[]>();
  
  for (const task of tasks) {
    if (!isEligible(task)) continue;
    
    const owner = task['Task Owner'];
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
    
    // Sort tasks for this owner
    const sortedTasks = ownerTasks.sort((a, b) => {
      // 1. Parent before child (depth-first)
      const aIsParent = taskHierarchy.get(a.Name)?.some(child => child.Name === b.Name);
      const bIsParent = taskHierarchy.get(b.Name)?.some(child => child.Name === a.Name);
      
      if (aIsParent) return -1;
      if (bIsParent) return 1;
      
      // 2. Earlier due date first
      const aDate = parseDate(a['Due'] || '');
      const bDate = parseDate(b['Due'] || '');
      
      if (aDate && !bDate) return -1;
      if (!aDate && bDate) return 1;
      if (aDate && bDate) {
        const dateDiff = aDate.getTime() - bDate.getTime();
        if (dateDiff !== 0) return dateDiff;
      }
      
      // 3. Higher priority first
      const priorityDiff = getPriorityValue(a['Priority']) - getPriorityValue(b['Priority']);
      if (priorityDiff !== 0) return priorityDiff;
      
      // 4. Fallback to original order (deterministic)
      return tasks.indexOf(a) - tasks.indexOf(b);
    });
    
    // Calculate queue rank and projected days
    let daysSoFar = 0;
    for (let i = 0; i < sortedTasks.length; i++) {
      const task = sortedTasks[i];
      daysSoFar += task['Estimated Days'];
      
      const processedTask: ProcessedTask = {
        ...task,
        queue_rank: i + 1,
        'Projected Days to Completion': daysSoFar,
        'Estimated Days Remaining': task['Estimated Days'],
        pageId: task.pageId || '' // Provide default for CSV tasks
      };
      
      processedTasks.push(processedTask);
    }
  }
  
  return processedTasks;
}

/**
 * Converts processed tasks to CSV format
 */
export function tasksToCSV(tasks: ProcessedTask[]): string {
  const headers = [
    'Name', 'Task Owner', 'Status (IT)', 'Estimated Days', 
    'Estimated Days Remaining', 'Due', 'Priority', 'Parent Task',
    'queue_rank', 'Projected Days to Completion'
  ];
  
  const csvLines = [headers.join(',')];
  
  for (const task of tasks) {
    const values = headers.map(header => {
      const value = task[header as keyof ProcessedTask];
      if (value === undefined || value === null) return '';
      return typeof value === 'string' && value.includes(',') ? `"${value}"` : String(value);
    });
    csvLines.push(values.join(','));
  }
  
  return csvLines.join('\n');
} 