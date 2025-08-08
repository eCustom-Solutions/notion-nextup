#!/usr/bin/env ts-node

import * as dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import notion from '../src/api/client';
import { getAllUsers } from '../src/api/user-lookup';

async function* iterateDatabase(databaseId: string) {
  let cursor: string | undefined = undefined;
  do {
    const databasesClient = await (await notion.databases());
    const res = await databasesClient.query({
      database_id: databaseId,
      page_size: 100,
      start_cursor: cursor,
    });
    for (const page of (res as any).results) yield page as any;
    cursor = (res as any).has_more && (res as any).next_cursor ? (res as any).next_cursor : undefined;
  } while (cursor);
}

function csvEscape(value: string): string {
  const v = value.replace(/"/g, '""');
  return /[",\n]/.test(v) ? `"${v}"` : v;
}

async function main() {
  const dbId = process.env.NOTION_DB_ID;
  if (!dbId) throw new Error('NOTION_DB_ID missing');

  const techUserUUIDs = new Set<string>();
  const dbUserUUIDs = new Set<string>();

  // Build a quick name lookup map
  const workspaceUsers = await getAllUsers(); // Map<name, uuid>
  const uuidToName = new Map<string, string>();
  for (const [name, uuid] of workspaceUsers.entries()) uuidToName.set(uuid, name);

  // Cache for department page titles by related page id
  const deptTitleCache = new Map<string, string>();

  // Helper to resolve a relation page id to a readable title
  async function getRelationTitle(pageId: string): Promise<string | undefined> {
    if (deptTitleCache.has(pageId)) return deptTitleCache.get(pageId);
    try {
      const pagesClient = await (await notion.pages());
      const page = await pagesClient.retrieve({ page_id: pageId });
      const props: any = (page as any).properties ?? {};
      // Find a title-type property and read its plain text
      for (const key of Object.keys(props)) {
        const prop = props[key];
        if (prop?.type === 'title' && Array.isArray(prop.title) && prop.title[0]?.plain_text) {
          const title = String(prop.title[0].plain_text);
          deptTitleCache.set(pageId, title);
          return title;
        }
      }
      // Fallbacks
      const titleProp = props['Name']?.title?.[0]?.plain_text;
      if (titleProp) {
        const t = String(titleProp);
        deptTitleCache.set(pageId, t);
        return t;
      }
    } catch (e) {
      // Ignore failures; treat as unknown
    }
    deptTitleCache.set(pageId, '');
    return '';
  }

  // Iterate tasks, collect assignee names and whether Department includes Technology
  for await (const page of iterateDatabase(dbId)) {
    const props = (page as any).properties ?? {};

    // Extract assignee UUID
    const people = props['Assignee']?.people ?? [];
    const assigneeUuid = people[0]?.id as string | undefined;
    if (!assigneeUuid) continue;
    dbUserUUIDs.add(assigneeUuid);

    // Department relation check: attempt to match name containing "Technology"
    const deptRelations: Array<{ id: string }> = props['Department']?.relation ?? [];
    let isTechnology = false;
    for (const rel of deptRelations) {
      const title = rel?.id ? await getRelationTitle(rel.id) : undefined;
      if (title && title.toLowerCase().includes('technology')) { isTechnology = true; break; }
    }

    if (isTechnology) techUserUUIDs.add(assigneeUuid);
  }

  // Compute other users as all workspace users minus tech users
  const allWorkspaceUUIDs = new Set<string>(Array.from(uuidToName.keys()));
  const otherUserUUIDs = new Set<string>();
  for (const uuid of allWorkspaceUUIDs) {
    if (!techUserUUIDs.has(uuid)) otherUserUUIDs.add(uuid);
  }

  const outDir = path.resolve(process.cwd(), 'reports');
  fs.mkdirSync(outDir, { recursive: true });

  // Build CSV rows with name,uuid
  const techRows = [['name','uuid']].concat(
    Array.from(techUserUUIDs)
      .map((uuid) => [uuidToName.get(uuid) ?? uuid, uuid])
      .sort((a,b) => a[0].localeCompare(b[0]))
  );
  const otherRows = [['name','uuid']].concat(
    Array.from(otherUserUUIDs)
      .map((uuid) => [uuidToName.get(uuid) ?? uuid, uuid])
      .sort((a,b) => a[0].localeCompare(b[0]))
  );

  const techCsv = techRows.map((r) => r.map(csvEscape).join(',')).join('\n') + '\n';
  const otherCsv = otherRows.map((r) => r.map(csvEscape).join(',')).join('\n') + '\n';

  fs.writeFileSync(path.join(outDir, 'users_technology.csv'), techCsv);
  fs.writeFileSync(path.join(outDir, 'users_other.csv'), otherCsv);

  console.log(`✅ Wrote ${techUserUUIDs.size} Technology users to reports/users_technology.csv`);
  console.log(`✅ Wrote ${otherUserUUIDs.size} other users to reports/users_other.csv`);
}

main().catch((e) => {
  console.error('❌ Export error:', e);
  process.exit(1);
});


