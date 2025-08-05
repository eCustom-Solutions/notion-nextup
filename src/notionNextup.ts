#!/usr/bin/env ts-node

import * as fs from 'fs';
import * as path from 'path';
import { loadTasksFromCSV } from './csv-parser';
import { calculateQueueRank, tasksToCSV } from './core';
import { ProcessedTask } from './types';

/**
 * CLI entry point for Notion NextUp
 * This script handles command line arguments and orchestrates the processing
 */

function main(): void {
  const args = process.argv.slice(2);
  let inputPath = '';
  let outputPath = '';
  
  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--in' && i + 1 < args.length) {
      inputPath = args[i + 1];
      i++;
    } else if (args[i] === '--out' && i + 1 < args.length) {
      outputPath = args[i + 1];
      i++;
    }
  }
  
  if (!inputPath) {
    console.error('Error: --in parameter is required');
    process.exit(1);
  }
  
  if (!outputPath) {
    // Default to output/ directory with *_ranked.csv
    const ext = path.extname(inputPath);
    const base = path.basename(inputPath, ext);
    
    // Ensure output directory exists
    const outputDir = 'output';
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    outputPath = path.join(outputDir, `${base}_ranked${ext}`);
  } else {
    // If output path is specified, ensure the directory exists
    const outputDir = path.dirname(outputPath);
    if (outputDir && !fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
  }
  
  try {
    console.log(`Reading CSV from: ${inputPath}`);
    
    // Load tasks using the CSV parser module
    const tasks = loadTasksFromCSV(inputPath);
    console.log(`Found ${tasks.length} total tasks`);
    
    console.log('Calculating queue ranks and projected days...');
    const processedTasks = calculateQueueRank(tasks);
    
    console.log(`Writing results to: ${outputPath}`);
    const csvContent = tasksToCSV(processedTasks);
    fs.writeFileSync(outputPath, csvContent);
    
    console.log('Processing complete!');
    
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main();
} 