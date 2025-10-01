#!/usr/bin/env ts-node

import notion from '../src/api/client';
import * as fs from 'fs';
import * as path from 'path';

async function dumpRawNotionResponse() {
  console.log('🔍 Dumping raw Notion API response...');
  
  const db = process.env.NOTION_DB_ID;
  if (!db) {
    console.error('❌ NOTION_DB_ID missing in env');
    process.exit(1);
  }

  try {
    console.log('📥 Querying Notion database directly...');
    const notionClient = await notion.databases();
    
    // Search through tasks until we find one with "IT: QA Task" label or hit a reasonable limit
    console.log('🔍 Searching for tasks with "IT: QA Task" label...');
    
    let allResults: any[] = [];
    let cursor: string | undefined = undefined;
    let pageCount = 0;
    const maxPages = 20; // Limit to prevent infinite loops
    let foundQATask = false;
    
    do {
      pageCount++;
      console.log(`📄 Searching page ${pageCount}...`);
      
      const res = await notionClient.query({
        database_id: db,
        page_size: 100, // Get more tasks per page
        start_cursor: cursor,
        sorts: [{ property: 'Name', direction: 'ascending' }]
      } as any);
      
      if (!res.results || res.results.length === 0) break;
      
      // Check each task for the QA label
      for (const page of res.results) {
        const props = (page as any).properties;
        const labels = props['Labels']?.multi_select || [];
        const taskName = props['Name']?.title?.[0]?.plain_text || 'Unknown';
        
        // Check if this task has the QA label
        const hasQALabel = labels.some((label: any) => label.name === 'IT: QA Task');
        
        if (hasQALabel) {
          console.log(`🎯 FOUND QA TASK: "${taskName}" with labels:`, labels.map((l: any) => l.name));
          foundQATask = true;
        }
        
        allResults.push(page);
      }
      
      cursor = res.has_more && res.next_cursor ? res.next_cursor : undefined;
      
      // Stop if we found a QA task or hit the page limit
      if (foundQATask || pageCount >= maxPages) {
        console.log(`🛑 Stopping search: ${foundQATask ? 'Found QA task' : 'Hit page limit'}`);
        break;
      }
      
    } while (cursor);
    
    console.log(`📊 Searched through ${pageCount} pages, found ${allResults.length} total tasks`);
    
    // Dump the raw response
    const dumpData = {
      metadata: {
        totalResults: allResults.length,
        pagesSearched: pageCount,
        foundQATask: foundQATask,
        dumpTime: new Date().toISOString(),
        databaseId: db,
        note: foundQATask ? "Found task with IT: QA Task label!" : "No IT: QA Task label found in searched pages"
      },
      rawResponse: { results: allResults, has_more: false, next_cursor: undefined },
      // Extract just the properties for easier inspection
      properties: allResults.map((page: any) => ({
        pageId: page.id,
        archived: page.archived,
        createdTime: page.created_time,
        lastEditedTime: page.last_edited_time,
        properties: page.properties,
        // Show property names
        propertyNames: Object.keys(page.properties || {}),
        // Show property types
        propertyTypes: Object.entries(page.properties || {}).reduce((acc: any, [key, value]: [string, any]) => {
          acc[key] = value?.type;
          return acc;
        }, {}),
        // Show labels specifically
        labels: (page.properties || {})['Labels']?.multi_select || []
      })) || []
    };
    
    // Write to file
    const outputPath = path.join(__dirname, '..', 'raw-notion-response-dump.json');
    fs.writeFileSync(outputPath, JSON.stringify(dumpData, null, 2));
    
    console.log(`✅ Dumped raw response to: ${outputPath}`);
    console.log(`📁 File size: ${(fs.statSync(outputPath).size / 1024).toFixed(2)} KB`);
    
    // Show what we found
    if (allResults.length > 0) {
      const firstPage = allResults[0] as any;
      console.log('\n🔍 First page properties:');
      console.log(`   Page ID: ${firstPage.id}`);
      console.log(`   Property names: ${Object.keys(firstPage.properties || {}).join(', ')}`);
      
      // Show property types
      console.log('\n📋 Property types:');
      Object.entries(firstPage.properties || {}).forEach(([key, value]: [string, any]) => {
        console.log(`   ${key}: ${value?.type || 'unknown'}`);
      });
      
      // Look for label-like properties
      const labelProps = Object.keys(firstPage.properties || {}).filter(key => 
        key.toLowerCase().includes('label') || 
        key.toLowerCase().includes('tag') ||
        key.toLowerCase().includes('category')
      );
      
      if (labelProps.length > 0) {
        console.log(`\n🎯 Found potential label properties: ${labelProps.join(', ')}`);
        
        // Show details of the first label property
        const firstLabelProp = labelProps[0];
        const labelPropValue = firstPage.properties[firstLabelProp];
        console.log(`\n🔍 Details of "${firstLabelProp}":`);
        console.log(`   Type: ${labelPropValue?.type}`);
        console.log(`   Value: ${JSON.stringify(labelPropValue, null, 2)}`);
      } else {
        console.log('\n❌ No obvious label properties found');
      }
    }
    
  } catch (error) {
    console.error('❌ Error dumping raw Notion response:', error);
    process.exit(1);
  }
}

// Run the script
dumpRawNotionResponse().catch(console.error);
