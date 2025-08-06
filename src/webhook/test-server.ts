#!/usr/bin/env ts-node

import * as dotenv from 'dotenv';
dotenv.config();

import { calculateQueueRank } from '../core';
import { loadTasks, updateQueueRanksSurgically } from '../api';

// Simulate the webhook payload we received
const mockWebhookPayload = {
  source: {
    type: 'automation',
    automation_id: '2476824d-5503-8082-98f1-004d98dd9e7a',
    action_id: '2476824d-5503-805b-8110-005a63557287',
    event_id: 'test-event-id',
    attempt: 1
  },
  data: {
    object: 'page',
    id: '2476824d-5503-808a-bbb0-e2e71138187f',
    created_time: '2025-08-06T17:47:00.000Z',
    last_edited_time: '2025-08-06T20:24:00.000Z',
    created_by: { object: 'user', id: '1ded872b-594c-8161-addd-0002825994b5' },
    last_edited_by: { object: 'user', id: '1ded872b-594c-8161-addd-0002825994b5' },
    properties: {
      Name: {
        id: 'title',
        type: 'title',
        title: [{ type: 'text', text: { content: 'Test Task' }, plain_text: 'Test Task' }]
      },
      Assignee: {
        id: 'mlUP',
        type: 'people',
        people: [
          {
            object: 'user',
            id: '1ded872b-594c-8161-addd-0002825994b5',
            name: 'Derious Vaughn',
            avatar_url: null,
            type: 'person',
            person: { email: 'derious.v@ecustomsolutions.com' }
          }
        ]
      }
    }
  }
};

async function testWebhookLogic() {
  console.log('🧪 Testing webhook logic...\n');
  
  // Step 1: Extract assignee information (same logic as webhook)
  const assignee = mockWebhookPayload.data.properties.Assignee.people[0];
  const assigneeId = assignee?.id;
  const assigneeName = assignee?.name;
  
  console.log('🔍 Assignee info:', { assigneeId, assigneeName });
  console.log('🔍 Full assignee object:', assignee);
  
  if (assigneeId && assigneeName) {
    console.log(`👤  Detected assignee: ${assigneeName} (${assigneeId})`);
    
    // Step 2: Test the pipeline logic
    const db = process.env.NOTION_DB_ID;
    if (!db) {
      console.error('❌ NOTION_DB_ID missing in env');
      return;
    }
    
    console.log(`🔄  Rebuilding queue for user: ${assigneeName} (${assigneeId})`);
    
    try {
      // Test server-side filtering
      console.log('\n🔍 Loading tasks from Notion API...');
      const userTasks = await loadTasks(db, assigneeName);
      console.log(`📊 Loaded ${userTasks.length} tasks for ${assigneeName}`);
      
      // Show raw task payloads
      console.log('\n📋 Raw task payloads:');
      userTasks.forEach((task, index) => {
        console.log(`\n  Task ${index + 1}:`);
        console.log(`    Name: "${task.Name}"`);
        console.log(`    Assignee: "${task['Assignee']}"`);
        console.log(`    Status: "${task['Status (IT)']}"`);
        console.log(`    Priority: "${task['Priority']}"`);
        console.log(`    Due: "${task['Due']}"`);
        console.log(`    Estimated Days: ${task['Estimated Days']}`);
        console.log(`    Parent Task: "${task['Parent Task']}"`);
        console.log(`    Page ID: "${task.pageId}"`);
      });
      
      // Test queue ranking with verbose logging
      console.log('\n🧮 Calculating queue ranks...');
      const processed = calculateQueueRank(userTasks);
      console.log(`📈 Processed ${processed.length} tasks with queue ranks`);
      
      // Show detailed processed results
      if (processed.length > 0) {
        console.log('\n📋 Detailed processed tasks:');
        processed.forEach((task, index) => {
          console.log(`\n  ${index + 1}. "${task.Name}"`);
          console.log(`     Rank: ${task.queue_rank}`);
          console.log(`     Score: ${task.queue_score}`);
          console.log(`     Projected Days to Completion: ${task['Projected Days to Completion']}`);
          console.log(`     Estimated Days Remaining: ${task['Estimated Days Remaining']}`);
          console.log(`     Page ID: "${task.pageId}"`);
        });
      }
      
      console.log('\n✅ Webhook logic test completed successfully!');
      
      // Actually update the Notion database
      console.log('\n🚀 Updating Notion database with new queue ranks...');
      await updateQueueRanksSurgically(db, assigneeName, processed);
      console.log('✅ Notion database updated successfully!');
      
      console.log('\n📝 Summary:');
      console.log(`   - Loaded ${userTasks.length} tasks for ${assigneeName}`);
      console.log(`   - Calculated queue ranks for ${processed.length} tasks`);
      console.log(`   - Updated Notion database with new ranks and projected completion times`);
      
    } catch (error) {
      console.error('❌ Error during webhook logic test:', error);
    }
    
  } else {
    console.log('⚠️  No assignee found, skipping queue update');
  }
}

// Run the test
testWebhookLogic().catch(console.error); 