import { calculateQueueRankAsync } from '../core';
import { loadTasks, updateQueueRanksSurgically } from '../api';

export interface PipelineOptions {
  enableLogging?: boolean;
  enableDatabaseUpdates?: boolean;
}

/**
 * Pure Notion API pipeline logic - no debouncing
 */
export async function runNotionPipeline(userId: string, userName: string, options: PipelineOptions = {}): Promise<void> {
  const db = process.env.NOTION_DB_ID;
  if (!db) throw new Error('NOTION_DB_ID missing in env');

  if (options.enableLogging) {
    console.log(`🔄 Rebuilding queue for user: ${userName} (${userId})`);
  }

  // Load tasks with server-side filtering
  if (options.enableLogging) {
    console.log('🔍 Loading tasks from Notion API...');
  }
  const userTasks = await loadTasks(db, userName);
  
  if (options.enableLogging) {
    console.log(`📊 Loaded ${userTasks.length} tasks for ${userName}`);
  }

  // Calculate queue ranks + projections
  if (options.enableLogging) {
    console.log('🧮 Calculating queue ranks...');
  }
  const processed = await calculateQueueRankAsync(userTasks);
  
  if (options.enableLogging) {
    console.log(`📈 Processed ${processed.length} tasks with queue ranks`);
  }

  // Update Notion database if enabled
  if (options.enableDatabaseUpdates) {
    if (options.enableLogging) {
      console.log('🚀 Updating Notion database with new queue ranks...');
    }
    await updateQueueRanksSurgically(db, userName, processed);
    
    if (options.enableLogging) {
      console.log(`✅ Queue updated for ${userName} (${processed.length} tasks)`);
    }
  } else {
    if (options.enableLogging) {
      console.log('📝 Database updates disabled - queue ranks calculated but not saved');
    }
  }

  if (options.enableLogging) {
    console.log('\n📝 Summary:');
    console.log(`   - Loaded ${userTasks.length} tasks for ${userName}`);
    console.log(`   - Calculated queue ranks for ${processed.length} tasks`);
    if (options.enableDatabaseUpdates) {
      console.log(`   - Updated Notion database with new ranks and projected completion times`);
    }
  }
} 