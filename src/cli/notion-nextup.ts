#!/usr/bin/env ts-node

// Load env first, then initialize structured logging
import * as dotenv from 'dotenv';
// Load environment variables from .env file
dotenv.config();
import '../utils/logger';
import { calculateQueueRankAsync } from '../core/queue-ranking';
import { loadTasks, updateQueueRanksSurgically } from '../api/notion-adapter';

/**
 * CLI entry point for Notion NextUp
 * This script handles command line arguments and orchestrates the processing
 */

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let notionDbId = '';
  let dryRun = false;
  let userFilter = 'Derious Vaughn'; // Default user

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--notion-db' && i + 1 < args.length) {
      notionDbId = args[i + 1];
      i++;
    } else if (args[i] === '--user' && i + 1 < args.length) {
      userFilter = args[i + 1];
      i++;
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    }
  }
  
  if (!notionDbId) {
    console.error('Error: --notion-db parameter is required');
    process.exit(1);
  }
  
  try {
    // Notion API mode
    console.log(`Loading tasks from Notion database: ${notionDbId}`);
    if (userFilter) {
      console.log(`Filtering for user: ${userFilter}`);
    }
    
    const tasks = await loadTasks(notionDbId, userFilter);
    console.log(`Found ${tasks.length} total tasks`);

    console.log('Calculating queue ranks and projected days...');
    const processedTasks = await calculateQueueRankAsync(tasks);
    
    if (!dryRun) {
      console.log('Writing results back to Notion...');
      await updateQueueRanksSurgically(notionDbId, userFilter, processedTasks);
      console.log('Processing complete!');
    } else {
      console.log('Dry run mode - skipping writeback');
      console.log(`Would update ${processedTasks.length} tasks`);
      // Print a concise preview of projected completion based on hours-staging if enabled
      const preview = processedTasks.slice(0, Math.min(10, processedTasks.length)).map(t => ({
        name: t.Name,
        rank: t.queue_rank,
        projected: t['Projected Completion'],
      }));
      console.table(preview);
    }
    
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main();
} 