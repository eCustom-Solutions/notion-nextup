#!/usr/bin/env ts-node

import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

/**
 * Simple integration test for Notion API functionality
 * Run with: npx ts-node src/test-notion.ts
 */

import { loadTasks, writeBack } from './notionAdapter';
import { calculateQueueRank } from './core';

async function testNotionIntegration() {
  const databaseId = process.env.NOTION_DB_ID;
  const apiKey = process.env.NOTION_API_KEY;

  if (!databaseId || !apiKey) {
    console.log('❌ Missing environment variables:');
    console.log('   NOTION_DB_ID - Your Notion database ID');
    console.log('   NOTION_API_KEY - Your Notion API key');
    console.log('');
    console.log('Example:');
    console.log('   NOTION_DB_ID=your-db-id NOTION_API_KEY=your-key npx ts-node src/test-notion.ts');
    return;
  }

  try {
    console.log('🧪 Testing Notion API Integration...');
    console.log(`📊 Database ID: ${databaseId}`);
    console.log('');

    // Test 1: Load tasks
    console.log('1️⃣ Loading tasks from Notion...');
    const tasks = await loadTasks(databaseId);
    console.log(`   ✅ Loaded ${tasks.length} tasks`);
    
    if (tasks.length === 0) {
      console.log('   ⚠️  No tasks found. Make sure your database has tasks with the required properties.');
      return;
    }

    // Test 2: Process tasks
    console.log('2️⃣ Processing tasks with queue ranking...');
    const processedTasks = calculateQueueRank(tasks);
    console.log(`   ✅ Processed ${processedTasks.length} tasks`);

    // Show sample results
    console.log('3️⃣ Sample processed tasks:');
    processedTasks.slice(0, 3).forEach((task, index) => {
      console.log(`   ${index + 1}. ${task.Name} (${task['Task Owner']})`);
      console.log(`      Rank: ${task.queue_rank}, Projected Days: ${task['Projected Days to Completion']}`);
    });

    // Test 3: Dry run writeback (optional)
    const shouldTestWriteback = process.argv.includes('--test-writeback');
    if (shouldTestWriteback) {
      console.log('4️⃣ Testing writeback (dry run)...');
      await writeBack(processedTasks.slice(0, 1), databaseId); // Only test first task
      console.log('   ✅ Writeback test completed');
    } else {
      console.log('4️⃣ Skipping writeback test (use --test-writeback to enable)');
    }

    console.log('');
    console.log('🎉 All tests passed!');
    console.log('');
    console.log('Next steps:');
    console.log('   • Run with --test-writeback to test actual updates');
    console.log('   • Use the CLI: npx ts-node src/notionNextup.ts --notion-db your-db-id --dry-run');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testNotionIntegration(); 