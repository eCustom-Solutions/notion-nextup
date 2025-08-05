#!/usr/bin/env ts-node

import * as fs from 'fs';
import * as path from 'path';

// Types and interfaces
interface Task {
  Name: string;
  'Task Owner': string;
  'Status (IT)': string;
  'Estimated Days': number;
  'Estimated Days Remaining'?: number;
  'Due'?: string;
  'Priority'?: string;
  'Parent Task'?: string;
  queue_rank?: number;
  'Projected Days to Completion'?: number;
}

interface ProcessedTask extends Task {
  queue_rank: number;
  'Projected Days to Completion': number;
  'Estimated Days Remaining': number;
}

// Constants
const EXCLUDED_STATUSES = ['Backlogged', 'Done', 'Live in Dev', 'Ready for QA', 'Live in Staging'];
const REQUIRED_COLUMNS = ['Name', 'Task Owner', 'Status (IT)', 'Estimated Days'];
const PRIORITY_MAP = { 'High': 0, 'Medium': 1, 'Low': 2, '': 3 };

// Utility functions
function parseCSV(content: string): Task[] {
  const lines = content.split('\n').filter(line => line.trim());
  if (lines.length < 2) {
    throw new Error('CSV must have at least a header and one data row');
  }

  const headers = parseCSVLine(lines[0]);
  const tasks: Task[] = [];

  // Validate required columns
  for (const required of REQUIRED_COLUMNS) {
    if (!headers.includes(required)) {
      throw new Error(`Missing required column: ${required}`);
    }
  }

  // Process data rows
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length !== headers.length) {
      console.warn(`Skipping row ${i + 1}: column count mismatch (expected ${headers.length}, got ${values.length})`);
      continue;
    }

    const task: Task = {
      Name: values[headers.indexOf('Name')] || '',
      'Task Owner': values[headers.indexOf('Task Owner')] || '',
      'Status (IT)': values[headers.indexOf('Status (IT)')] || '',
      'Estimated Days': parseFloat(values[headers.indexOf('Estimated Days')]) || 0,
    };

    // Optional columns
    const dueIndex = headers.indexOf('Due');
    if (dueIndex >= 0 && values[dueIndex]) {
      task['Due'] = values[dueIndex];
    }

    const priorityIndex = headers.indexOf('Priority');
    if (priorityIndex >= 0 && values[priorityIndex]) {
      task['Priority'] = values[priorityIndex];
    }

    const parentIndex = headers.indexOf('Parent Task');
    if (parentIndex >= 0 && values[parentIndex]) {
      task['Parent Task'] = values[parentIndex];
    }

    const remainingIndex = headers.indexOf('Estimated Days Remaining');
    if (remainingIndex >= 0 && values[remainingIndex]) {
      task['Estimated Days Remaining'] = parseFloat(values[remainingIndex]) || 0;
    }

    tasks.push(task);
  }

  return tasks;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current.trim());
  return result;
}

function isEligible(task: Task): boolean {
  return task['Task Owner'].trim() !== '' && 
         !EXCLUDED_STATUSES.includes(task['Status (IT)']);
}

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  
  // Handle "Month DD, YYYY" format
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? null : date;
}

function getPriorityValue(priority: string | undefined): number {
  if (!priority) return PRIORITY_MAP[''];
  return PRIORITY_MAP[priority as keyof typeof PRIORITY_MAP] ?? PRIORITY_MAP[''];
}

function buildTaskHierarchy(tasks: Task[]): Map<string, Task[]> {
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

function calculateQueueRank(tasks: Task[]): ProcessedTask[] {
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
        'Estimated Days Remaining': task['Estimated Days']
      };
      
      processedTasks.push(processedTask);
    }
  }
  
  return processedTasks;
}

function writeCSV(tasks: ProcessedTask[], outputPath: string): void {
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
  
  fs.writeFileSync(outputPath, csvLines.join('\n'));
}

function main(): void {
  const args = process.argv.slice(2);
  let inputPath = '';
  let outputPath = '';
  
  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--in' && i + 1 < args.length) {
      inputPath = args[i + 1];
      i++;
    } else if (args[i] === '--out' && i + 1 < args.length) {
      outputPath = args[i + 1];
      i++;
    }
  }
  
  if (!inputPath) {
    console.error('Error: --in parameter is required');
    process.exit(1);
  }
  
  if (!outputPath) {
    // Default to output/ directory with *_ranked.csv
    const ext = path.extname(inputPath);
    const base = path.basename(inputPath, ext);
    
    // Ensure output directory exists
    const outputDir = 'output';
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    outputPath = path.join(outputDir, `${base}_ranked${ext}`);
  } else {
    // If output path is specified, ensure the directory exists
    const outputDir = path.dirname(outputPath);
    if (outputDir && !fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
  }
  
  try {
    console.log(`Reading CSV from: ${inputPath}`);
    const content = fs.readFileSync(inputPath, 'utf-8');
    
    console.log('Parsing CSV...');
    const tasks = parseCSV(content);
    console.log(`Found ${tasks.length} total tasks`);
    
    console.log('Filtering eligible tasks...');
    const eligibleTasks = tasks.filter(isEligible);
    console.log(`Found ${eligibleTasks.length} eligible tasks`);
    
    console.log('Calculating queue ranks and projected days...');
    const processedTasks = calculateQueueRank(eligibleTasks);
    
    console.log(`Writing results to: ${outputPath}`);
    writeCSV(processedTasks, outputPath);
    
    console.log('Processing complete!');
    
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main();
} 