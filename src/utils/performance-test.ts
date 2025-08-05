#!/usr/bin/env ts-node

import * as dotenv from 'dotenv';
dotenv.config();

import { loadTasks, updateQueueRanksSurgically } from '../api/notion-adapter';
import { calculateQueueRank } from '../core/queue-ranking';

/**
 * Performance test utility for measuring pipeline timing
 */

interface PerformanceMetrics {
  clearTime: number;
  loadTime: number;
  processTime: number;
  writeTime: number;
  totalTime: number;
  taskCount: number;
}

async function timeOperation<T>(operation: () => Promise<T>): Promise<{ result: T; time: number }> {
  const startTime = Date.now();
  const result = await operation();
  const time = Date.now() - startTime;
  return { result, time };
}

async function runPerformanceTest(userFilter: string = 'Derious Vaughn'): Promise<PerformanceMetrics> {
  const databaseId = process.env.NOTION_DB_ID;
  if (!databaseId) {
    throw new Error('NOTION_DB_ID not set');
  }

  console.log(`🧪 Running performance test for user: ${userFilter}`);
  console.log(`📊 Database ID: ${databaseId}`);
  console.log('');

  const startTime = Date.now();

  // Test 1: Load tasks
  console.log('1️⃣ Testing task loading...');
  const { result: tasks, time: loadTime } = await timeOperation(() => 
    loadTasks(databaseId, userFilter)
  );
  console.log(`   ✅ Load time: ${loadTime}ms (${tasks.length} tasks)`);

  // Test 2: Process tasks
  console.log('2️⃣ Testing task processing...');
  const { result: processedTasks, time: processTime } = await timeOperation(() => 
    Promise.resolve(calculateQueueRank(tasks))
  );
  console.log(`   ✅ Process time: ${processTime}ms`);

  // Test 3: Surgical update (dry run)
  console.log('3️⃣ Testing surgical update (dry run)...');
  const { time: writeTime } = await timeOperation(async () => {
    // Simulate surgical update without actually writing
    for (const task of processedTasks) {
      await new Promise(resolve => setTimeout(resolve, 10)); // Simulate API call
    }
  });
  console.log(`   ✅ Surgical update time: ${writeTime}ms`);

  const totalTime = Date.now() - startTime;

  console.log('');
  console.log('📊 Performance Summary:');
  console.log(`   Load: ${loadTime}ms`);
  console.log(`   Process: ${processTime}ms`);
  console.log(`   Surgical Update: ${writeTime}ms`);
  console.log(`   Total: ${totalTime}ms`);
  console.log(`   Tasks: ${tasks.length}`);

  return {
    clearTime: 0, // No separate clear step with surgical updates
    loadTime,
    processTime,
    writeTime,
    totalTime,
    taskCount: tasks.length
  };
}

async function main() {
  try {
    console.log('🚀 Starting Performance Test');
    console.log('='.repeat(50));
    
    const metrics = await runPerformanceTest();
    
    console.log('');
    console.log('✅ Performance test completed successfully!');
    
    // Save results to file
    const fs = require('fs');
    const results = {
      timestamp: new Date().toISOString(),
      user: 'Derious Vaughn',
      metrics,
      version: 'optimized' // Updated to reflect optimized version
    };
    
    fs.writeFileSync('performance-results.json', JSON.stringify(results, null, 2));
    console.log('📄 Results saved to performance-results.json');
    
  } catch (error) {
    console.error('❌ Performance test failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { runPerformanceTest, PerformanceMetrics }; 