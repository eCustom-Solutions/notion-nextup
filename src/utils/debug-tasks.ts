#!/usr/bin/env ts-node

import * as dotenv from 'dotenv';
dotenv.config();

import { loadTasks } from '../api/notion-adapter';
import { Task } from '../core/types';

async function debugTasks() {
  const databaseId = process.env.NOTION_DB_ID;
  
  if (!databaseId) {
    console.error('❌ NOTION_DB_ID not set in .env');
    return;
  }

  try {
    console.log('🔍 Debugging Derious Vaughn\'s tasks...');
    console.log(`📊 Database ID: ${databaseId}`);
    console.log('');

    const tasks = await loadTasks(databaseId, 'Derious Vaughn');
    
    console.log(`📋 Found ${tasks.length} tasks for Derious Vaughn:`);
    console.log('');

    // Convert to JSON with proper formatting
    const tasksJson = tasks.map(task => ({
      Name: task.Name,
      Assignee: task['Assignee'],
      'Status (IT)': task['Status (IT)'],
      'Estimated Days': task['Estimated Days'],
      'Estimated Days Remaining': task['Estimated Days Remaining'],
      'Due': task['Due'],
      'Priority': task['Priority'],
      'Parent Task': task['Parent Task'],
      pageId: task.pageId
    }));

    console.log(JSON.stringify(tasksJson, null, 2));
    console.log('');
    
    // Show tasks with due dates
    const tasksWithDueDates = tasks.filter(task => task['Due']);
    console.log(`📅 Tasks with due dates: ${tasksWithDueDates.length}`);
    tasksWithDueDates.forEach(task => {
      console.log(`   - ${task.Name}: ${task['Due']}`);
    });
    
    console.log('');
    console.log('💡 This shows exactly how Notion properties are mapped to the Task interface!');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

debugTasks(); 