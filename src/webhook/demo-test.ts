#!/usr/bin/env ts-node

import * as dotenv from 'dotenv';
dotenv.config();

// Test payloads
const deriousPayload = {
  source: {
    type: 'automation',
    automation_id: 'demo-automation-id',
    action_id: 'demo-action-id',
    event_id: 'demo-event-id',
    attempt: 1
  },
  data: {
    object: 'page',
    id: 'demo-page-id',
    created_time: '2025-08-06T17:47:00.000Z',
    last_edited_time: '2025-08-06T20:24:00.000Z',
    created_by: { object: 'user', id: '1ded872b-594c-8161-addd-0002825994b5' },
    last_edited_by: { object: 'user', id: '1ded872b-594c-8161-addd-0002825994b5' },
    properties: {
      Name: {
        id: 'title',
        type: 'title',
        title: [{ type: 'text', text: { content: 'Demo Task for Derious' }, plain_text: 'Demo Task for Derious' }]
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

const otherUserPayload = {
  source: {
    type: 'automation',
    automation_id: 'demo-automation-id',
    action_id: 'demo-action-id',
    event_id: 'demo-event-id',
    attempt: 1
  },
  data: {
    object: 'page',
    id: 'demo-page-id-2',
    created_time: '2025-08-06T17:47:00.000Z',
    last_edited_time: '2025-08-06T20:24:00.000Z',
    created_by: { object: 'user', id: 'other-user-id' },
    last_edited_by: { object: 'user', id: 'other-user-id' },
    properties: {
      Name: {
        id: 'title',
        type: 'title',
        title: [{ type: 'text', text: { content: 'Demo Task for Other User' }, plain_text: 'Demo Task for Other User' }]
      },
      Assignee: {
        id: 'mlUP',
        type: 'people',
        people: [
          {
            object: 'user',
            id: 'other-user-id',
            name: 'Other User',
            avatar_url: null,
            type: 'person',
            person: { email: 'other@example.com' }
          }
        ]
      }
    }
  }
};

async function testDemoServer() {
  console.log('🧪 Testing DEMO webhook server...\n');
  
  const baseUrl = 'http://localhost:8080'; // Local testing
  
  // Test 1: Health check
  console.log('📋 Test 1: Health Check');
  console.log('========================');
  try {
    const healthResponse = await fetch(`${baseUrl}/healthz`);
    const healthData = await healthResponse.json();
    console.log('✅ Health check response:', healthData);
  } catch (error) {
    console.log('❌ Health check failed:', error);
    return;
  }
  
  // Test 2: Derious payload (should be processed)
  console.log('\n📋 Test 2: Derious Payload (Should Process)');
  console.log('============================================');
  try {
    const deriousResponse = await fetch(`${baseUrl}/notion-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(deriousPayload)
    });
    const deriousResult = await deriousResponse.text();
    console.log('✅ Derious response:', deriousResult);
    console.log('✅ Status:', deriousResponse.status);
  } catch (error) {
    console.log('❌ Derious test failed:', error);
  }
  
  // Test 3: Other user payload (should be skipped)
  console.log('\n📋 Test 3: Other User Payload (Should Skip)');
  console.log('=============================================');
  try {
    const otherResponse = await fetch(`${baseUrl}/notion-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(otherUserPayload)
    });
    const otherResult = await otherResponse.text();
    console.log('✅ Other user response:', otherResult);
    console.log('✅ Status:', otherResponse.status);
  } catch (error) {
    console.log('❌ Other user test failed:', error);
  }
  
  console.log('\n🎭 Demo server test completed!');
  console.log('💡 Start the demo server with: npm run start:demo');
}

// Run the test
testDemoServer().catch(console.error); 