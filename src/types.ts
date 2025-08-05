// Core data types for Notion NextUp processing

export interface Task {
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

export interface ProcessedTask extends Task {
  queue_rank: number;
  'Projected Days to Completion': number;
  'Estimated Days Remaining': number;
}

// Constants
export const EXCLUDED_STATUSES = ['Backlogged', 'Done', 'Live in Dev', 'Ready for QA', 'Live in Staging'];
export const REQUIRED_COLUMNS = ['Name', 'Task Owner', 'Status (IT)', 'Estimated Days'];
export const PRIORITY_MAP = { 'High': 0, 'Medium': 1, 'Low': 2, '': 3 }; 