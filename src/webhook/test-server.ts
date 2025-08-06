#!/usr/bin/env ts-node

import * as dotenv from 'dotenv';
dotenv.config();

import { runNotionPipeline, PipelineOptions } from './notion-pipeline';
import { DebounceManager, simpleDebounce, queueDebounce, delayedExecution, DebounceOptions } from './debounce';

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
    
    // Pipeline options for Notion API logic
    const pipelineOptions: PipelineOptions = {
      enableLogging: true,
      enableDatabaseUpdates: true
    };
    
    // Test with simple debounce strategy
    console.log('\n🧪 Testing with simple debounce strategy...');
    const simpleDebounceManager = new DebounceManager({ enableLogging: true }, simpleDebounce);
    await simpleDebounceManager.processEvent(assigneeId, assigneeName, (userId, userName) => 
      runNotionPipeline(userId, userName, pipelineOptions)
    );
    
    // Test with queue debounce strategy
    console.log('\n🧪 Testing with queue debounce strategy...');
    const queueDebounceManager = new DebounceManager({ enableLogging: true }, queueDebounce);
    await queueDebounceManager.processEvent(assigneeId, assigneeName, (userId, userName) => 
      runNotionPipeline(userId, userName, pipelineOptions)
    );
    
    // Test with delayed execution strategy
    console.log('\n🧪 Testing with delayed execution strategy...');
    const delayedDebounceManager = new DebounceManager({ 
      debounceMs: 5000, 
      enableLogging: true 
    }, delayedExecution);
    await delayedDebounceManager.processEvent(assigneeId, assigneeName, (userId, userName) => 
      runNotionPipeline(userId, userName, pipelineOptions)
    );
    
    console.log('\n✅ Webhook logic test completed successfully!');
    
  } else {
    console.log('⚠️  No assignee found, skipping queue update');
  }
}

// Run the test
testWebhookLogic().catch(console.error); 