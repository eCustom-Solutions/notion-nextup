import { Task, REQUIRED_COLUMNS } from './types';

/**
 * CSV-specific parsing logic
 * This module handles all CSV file reading and parsing
 * Can be easily replaced with Notion API implementation
 */

/**
 * Parses a CSV line, handling quoted values properly
 */
export function parseCSVLine(line: string): string[] {
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

/**
 * Parses CSV content into Task objects
 */
export function parseCSV(content: string): Task[] {
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

/**
 * Reads a CSV file and returns Task objects
 * This is the main entry point for CSV data loading
 */
export function loadTasksFromCSV(filePath: string): Task[] {
  const fs = require('fs');
  const content = fs.readFileSync(filePath, 'utf-8');
  return parseCSV(content);
} 