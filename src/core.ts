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
  let score = 0;
  
  // Factor 1: Priority (0-100 points)
  const priorityScore = {
    'High': 100,
    'Medium': 60,
    'Low': 20,
    '': 0
  };
  score += priorityScore[task['Priority'] as keyof typeof priorityScore] || 0;
  
  // Factor 2: Due date urgency (0-50 points)
  if (task['Due']) {
    const dueDate = parseDate(task['Due']);
    if (dueDate) {
      const now = new Date();
      const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysUntilDue <= 0) {
        score += 50; // Overdue - highest urgency
      } else if (daysUntilDue <= 3) {
        score += 40; // Due very soon
      } else if (daysUntilDue <= 7) {
        score += 30; // Due this week
      } else if (daysUntilDue <= 14) {
        score += 20; // Due in 2 weeks
      } else if (daysUntilDue <= 30) {
        score += 10; // Due in a month
      }
      // Beyond 30 days = 0 points
    }
  }
  
  // Factor 3: Parent task bonus (25 points)
  if (task['Parent Task']) {
    score += 25; // Parent tasks get priority
  }
  
  // Factor 4: Task size penalty (0 to -20 points)
  // Shorter tasks get slight preference
  const estimatedDays = task['Estimated Days'] || 0;
  if (estimatedDays > 10) {
    score -= 20; // Very long tasks get penalized
  } else if (estimatedDays > 5) {
    score -= 10; // Long tasks get slight penalty
  }
  
  return Math.max(0, score); // Ensure score is never negative
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
    
    // Calculate scores and sort tasks for this owner
    const tasksWithScores = ownerTasks.map(task => ({
      task,
      score: calculateQueueScore(task)
    }));
    
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
    
    // Calculate queue rank and projected days
    let daysSoFar = 0;
    for (let i = 0; i < sortedTasks.length; i++) {
      const task = sortedTasks[i];
      daysSoFar += task['Estimated Days'];
      
      const processedTask: ProcessedTask = {
        ...task,
        queue_rank: i + 1,
        queue_score: calculateQueueScore(task),
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
          'Name', 'Assignee', 'Status (IT)', 'Estimated Days', 
    'Estimated Days Remaining', 'Due', 'Priority', 'Parent Task',
    'queue_rank', 'queue_score', 'Projected Days to Completion'
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