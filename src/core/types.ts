// Core data types for Notion NextUp processing

export interface Task {
  Name: string;
  'Assignee': string;
  'Owner'?: string;
  'Status (IT)': string;
  'Estimate (days)': number;
  'Estimate Remaining (days)'?: number;
  'Due'?: string;
  'Priority'?: string;
  'Parent Task'?: string;
  'Importance Rollup'?: number;
  'Task Started Date'?: string;
  'Projected Completion'?: string;
  queue_rank?: number;
  pageId?: string; // Added for Notion API support
  Labels?: string[]; // Multi-select labels for QA override logic
  Objective?: Array<{ id: string }>; // Relation to Objective for QA override logic
}

export interface ProcessedTask extends Task {
  queue_rank: number;
  queue_score: number;
  'Projected Completion': string;
  'Estimate Remaining (days)': number;
  pageId: string; // Required for Notion API writeback
}

export interface RankedTask extends Task {
  queue_rank: number;
  queue_score: number;
}

// Constants
export const EXCLUDED_STATUSES = ['Backlogged', 'Done', 'Live in Dev', 'Ready for QA', 'Live in Staging', 'Blocked'];
export const REQUIRED_COLUMNS = ['Name', 'Status (IT)'];
export const PRIORITY_MAP = { 'High': 0, 'Medium': 1, 'Low': 2, '': 3 }; 