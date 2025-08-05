#!/usr/bin/env ts-node

import * as dotenv from 'dotenv';
dotenv.config();

import { Client } from '@notionhq/client';
import type { UserObjectResponse } from '@notionhq/client/build/src/api-endpoints';

const notion = new Client({ auth: process.env.NOTION_API_KEY });

/**
 * Looks up a user by name and returns their UUID
 */
export async function findUserUUID(userName: string): Promise<string | null> {
  try {
    console.log(`🔍 Looking up user: ${userName}`);
    
    const response = await notion.users.list({});
    console.log(`📊 Found ${response.results.length} users in workspace`);
    
    for (const user of response.results) {
      const notionUser = user as UserObjectResponse;
      
      if (notionUser.name && notionUser.name.toLowerCase() === userName.toLowerCase()) {
        console.log(`✅ Found user "${notionUser.name}" with UUID: ${notionUser.id}`);
        return notionUser.id;
      }
    }
    
    console.log(`❌ User "${userName}" not found in workspace`);
    console.log('Available users:');
    response.results.forEach((user: UserObjectResponse) => {
      if (user.name) {
        console.log(`  - ${user.name} (${user.id})`);
      }
    });
    
    return null;
  } catch (error) {
    console.error('❌ Error looking up user:', error);
    return null;
  }
}

/**
 * Gets all users in the workspace
 */
export async function getAllUsers(): Promise<Map<string, string>> {
  const userMap = new Map<string, string>();
  
  try {
    const response = await notion.users.list({});
    
    for (const user of response.results) {
      const notionUser = user as UserObjectResponse;
      if (notionUser.name) {
        userMap.set(notionUser.name, notionUser.id);
      }
    }
    
    console.log(`📋 Found ${userMap.size} users in workspace`);
    return userMap;
  } catch (error) {
    console.error('❌ Error getting users:', error);
    return userMap;
  }
}

// Test the functionality
async function main() {
  console.log('🧪 Testing user lookup functionality...');
  
  // Test finding Derious Vaughn
  const deriousUUID = await findUserUUID('Derious Vaughn');
  
  if (deriousUUID) {
    console.log(`🎯 Derious Vaughn's UUID: ${deriousUUID}`);
  } else {
    console.log('❌ Could not find Derious Vaughn');
  }
  
  // Show all users
  const allUsers = await getAllUsers();
  console.log('\n📋 All users in workspace:');
  allUsers.forEach((uuid, name) => {
    console.log(`  - ${name}: ${uuid}`);
  });
}

if (require.main === module) {
  main();
} 