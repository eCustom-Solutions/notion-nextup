#!/usr/bin/env ts-node

import { loadTasks } from '../src/api/notion-adapter';
import * as fs from 'fs';
import * as path from 'path';

async function dumpTaskPayloads() {
  console.log('🔍 Dumping full Notion task payloads...');
  
  const db = process.env.NOTION_DB_ID;
  if (!db) {
    console.error('❌ NOTION_DB_ID missing in env');
    process.exit(1);
  }

  try {
    // Load all tasks (no user filter to get a sample)
    console.log('📥 Loading tasks from Notion API...');
    const tasks = await loadTasks(db);
    
    console.log(`📊 Loaded ${tasks.length} tasks`);
    
    // Create a more detailed dump by accessing the raw Notion response
    // We'll need to modify the notion-adapter to expose this, but for now
    // let's create a comprehensive dump of what we have
    
    const dumpData = {
      metadata: {
        totalTasks: tasks.length,
        dumpTime: new Date().toISOString(),
        databaseId: db,
        note: "This shows the processed task data. Raw Notion API response would show more detail."
      },
      tasks: tasks.map(task => ({
        name: task.Name,
        assignee: task['Assignee'],
        status: task['Status (IT)'],
        estimatedDays: task['Estimated Days'],
        estimatedDaysRemaining: task['Estimated Days Remaining'],
        due: task['Due'],
        priority: task['Priority'],
        parentTask: task['Parent Task'],
        importanceRollup: task['Importance Rollup'],
        taskStartedDate: task['Task Started Date'],
        projectedCompletion: task['Projected Completion'],
        labels: task.Labels,
        objective: task.Objective,
        pageId: task.pageId,
        queueRank: task.queue_rank,
        queueScore: task.queue_score
      }))
    };
    
    // Write to file
    const outputPath = path.join(__dirname, '..', 'task-payloads-dump.json');
    fs.writeFileSync(outputPath, JSON.stringify(dumpData, null, 2));
    
    console.log(`✅ Dumped ${tasks.length} tasks to: ${outputPath}`);
    console.log(`📁 File size: ${(fs.statSync(outputPath).size / 1024).toFixed(2)} KB`);
    
    // Show a sample of what we found
    console.log('\n🔍 Sample task data:');
    const sampleTask = tasks[0];
    if (sampleTask) {
      console.log(`   Name: ${sampleTask.Name}`);
      console.log(`   Labels: ${JSON.stringify(sampleTask.Labels)}`);
      console.log(`   Objective: ${JSON.stringify(sampleTask.Objective)}`);
      console.log(`   Page ID: ${sampleTask.pageId}`);
    }
    
    // Count tasks with labels
    const tasksWithLabels = tasks.filter(t => t.Labels && t.Labels.length > 0);
    console.log(`\n📊 Tasks with labels: ${tasksWithLabels.length}/${tasks.length}`);
    
    // Count tasks with objectives
    const tasksWithObjectives = tasks.filter(t => t.Objective && t.Objective.length > 0);
    console.log(`📊 Tasks with objectives: ${tasksWithObjectives.length}/${tasks.length}`);
    
    // Show unique label values
    const allLabels = new Set<string>();
    tasks.forEach(t => {
      if (t.Labels) {
        t.Labels.forEach(label => allLabels.add(label));
      }
    });
    console.log(`📊 Unique labels found: ${Array.from(allLabels).join(', ') || 'None'}`);
    
  } catch (error) {
    console.error('❌ Error dumping task payloads:', error);
    process.exit(1);
  }
}

// Run the script
dumpTaskPayloads().catch(console.error);



