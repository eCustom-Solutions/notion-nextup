#!/usr/bin/env ts-node

import * as dotenv from 'dotenv';
dotenv.config();

import notion from '../../src/api/client';
import { findUserUUID } from '../../src/api/user-lookup';
import { ESTIMATED_DAYS_PROP, ESTIMATED_HOURS_PROP } from '../../src/webhook/config';

interface ScriptOptions {
  userName: string;
  stagingProperty: string;
  sourceProperty: string;
  dryRun: boolean;
}

const DEFAULT_USER = 'Derious Vaughn';
const DEFAULT_SOURCE_PROPERTY = ESTIMATED_DAYS_PROP || 'Estimated Days';
const DEFAULT_STAGING_PROPERTY = ESTIMATED_HOURS_PROP || 'Estimated Hours (Staging)';

function parseArgs(argv: string[]): ScriptOptions {
  let userName = DEFAULT_USER;
  let stagingProperty = DEFAULT_STAGING_PROPERTY;
  let sourceProperty = DEFAULT_SOURCE_PROPERTY;
  let dryRun = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--user' && argv[i + 1]) {
      userName = argv[++i];
    } else if (arg === '--staging-property' && argv[i + 1]) {
      stagingProperty = argv[++i];
    } else if (arg === '--source-property' && argv[i + 1]) {
      sourceProperty = argv[++i];
    } else if (arg === '--dry-run') {
      dryRun = true;
    }
  }

  return { userName, stagingProperty, sourceProperty, dryRun };
}

async function main(): Promise<void> {
  const { userName, stagingProperty, sourceProperty, dryRun } = parseArgs(process.argv.slice(2));
  const databaseId = process.env.NOTION_DB_ID;

  if (!databaseId) {
    console.error('❌ NOTION_DB_ID is required in environment (.env).');
    process.exit(1);
  }

  const userUUID = await findUserUUID(userName);
  if (!userUUID) {
    console.error(`❌ Unable to resolve user UUID for "${userName}". Aborting.`);
    process.exit(1);
  }

  console.log(`🔍 Copying "${sourceProperty}" → "${stagingProperty}" for ${userName} (${userUUID}).`);
  console.log(`   Database: ${databaseId}`);
  console.log(`   Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);

  const db = await notion.databases();
  const pagesClient = await notion.pages();

  let cursor: string | undefined;
  let processed = 0;
  let skipped = 0;
  const updates: Array<{ pageId: string; name: string; source: number; staging?: number }> = [];

  do {
    const query: any = {
      database_id: databaseId,
      page_size: 100,
      start_cursor: cursor,
      filter: {
        property: 'Assignee',
        people: { contains: userUUID },
      },
    };

    const response = await db.query(query);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results: any[] = response.results as any[];

    for (const page of results) {
      if ((page as any).archived) {
        skipped++;
        continue;
      }

      const props = (page as any).properties ?? {};
      const titleProp = props['Name'];
      const title = Array.isArray(titleProp?.title) ? titleProp.title.map((t: any) => t.plain_text).join('') : 'Untitled';

      const sourceValue = props[sourceProperty]?.number as number | null | undefined;
      const stagingValue = props[stagingProperty]?.number as number | null | undefined;

      if (typeof sourceValue !== 'number') {
        skipped++;
        console.log(`⚠️ Skipping ${title} (${page.id}) — no numeric value in "${sourceProperty}".`);
        continue;
      }

      if (stagingValue === sourceValue) {
        skipped++;
        continue;
      }

      updates.push({ pageId: page.id, name: title, source: sourceValue, staging: stagingValue ?? undefined });
    }

    cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
  } while (cursor);

  if (updates.length === 0) {
    console.log('✅ No updates required. Staging property already matches source values.');
    console.log(`   Processed pages: ${processed}, skipped: ${skipped}`);
    return;
  }

  console.log(`📦 Prepared ${updates.length} page${updates.length === 1 ? '' : 's'} for update.`);

  for (const { pageId, name, source, staging } of updates) {
    processed++;
    if (dryRun) {
      console.log(`• (dry-run) ${name} (${pageId}) — ${staging ?? '∅'} → ${source}`);
      continue;
    }

    try {
      await pagesClient.update({
        page_id: pageId,
        properties: {
          [stagingProperty]: {
            number: source,
          },
        },
      });
      console.log(`✅ Updated ${name} (${pageId}) — ${staging ?? '∅'} → ${source}`);
    } catch (err) {
      console.error(`❌ Failed updating ${name} (${pageId}):`, err);
    }
  }

  console.log(`
Summary:`);
  console.log(`   Updated: ${dryRun ? 0 : processed}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`   Dry run entries: ${dryRun ? processed : 0}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Script error:', error);
    process.exit(1);
  });
}
