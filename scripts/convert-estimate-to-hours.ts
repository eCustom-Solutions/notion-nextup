#!/usr/bin/env ts-node

import * as dotenv from 'dotenv';
dotenv.config();

import notion from '../../src/api/client';
import { findUserUUID } from '../../src/api/user-lookup';
import {
  ESTIMATED_HOURS_PROP,
  WORKDAY_START_HOUR,
  WORKDAY_END_HOUR,
} from '../../src/webhook/config';

interface ScriptOptions {
  userName: string;
  workdayHours?: number;
  dryRun: boolean;
}

const DEFAULT_USER = 'Derious Vaughn';

function parseArgs(argv: string[]): ScriptOptions {
  let userName = DEFAULT_USER;
  let workdayHours: number | undefined;
  let dryRun = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--user' && argv[i + 1]) {
      userName = argv[++i];
    } else if (arg === '--workday-hours' && argv[i + 1]) {
      const parsed = Number(argv[++i]);
      if (!Number.isFinite(parsed) || parsed <= 0) throw new Error('--workday-hours must be a positive number');
      workdayHours = parsed;
    } else if (arg === '--dry-run') {
      dryRun = true;
    }
  }

  return { userName, workdayHours, dryRun };
}

function resolveWorkdayHours(explicit?: number): number {
  if (explicit && explicit > 0) return explicit;
  const start = WORKDAY_START_HOUR;
  const end = WORKDAY_END_HOUR;
  return end > start ? (end - start) : 8;
}

function nearlyEqual(a: number, b: number, eps = 1e-6): boolean {
  return Math.abs(a - b) <= eps;
}

async function main(): Promise<void> {
  const { userName, workdayHours: cliWorkdayHours, dryRun } = parseArgs(process.argv.slice(2));
  const databaseId = process.env.NOTION_DB_ID;

  if (!databaseId) {
    console.error('❌ NOTION_DB_ID is required in environment (.env).');
    process.exit(1);
  }

  const workdayHours = resolveWorkdayHours(cliWorkdayHours);
  const userUUID = await findUserUUID(userName);
  if (!userUUID) {
    console.error(`❌ Unable to resolve user UUID for "${userName}". Aborting.`);
    process.exit(1);
  }

  const targetProp = ESTIMATED_HOURS_PROP;
  if (!targetProp) {
    console.error('❌ ESTIMATED_HOURS_PROP is not configured.');
    process.exit(1);
  }

  console.log(`🔄 Converting estimate values from days → hours for ${userName} (${userUUID})`);
  console.log(`   Target property: "${targetProp}"`);
  console.log(`   Workday hours: ${workdayHours}`);
  console.log(`   Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);

  const db = await notion.databases();
  const pagesClient = await notion.pages();

  let cursor: string | undefined;
  let scanned = 0;
  let prepared = 0;
  let skipped = 0;
  let updated = 0;

  do {
    const query: any = {
      database_id: databaseId,
      page_size: 100,
      start_cursor: cursor,
      filter: { property: 'Assignee', people: { contains: userUUID } },
    };

    const response = await db.query(query);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results: any[] = response.results as any[];
    for (const page of results) {
      scanned++;
      if ((page as any).archived) { skipped++; continue; }
      const props = (page as any).properties ?? {};

      const titleProp = props['Name'];
      const title = Array.isArray(titleProp?.title) ? titleProp.title.map((t: any) => t.plain_text).join('') : 'Untitled';

      const currentVal = props[targetProp]?.number as number | null | undefined;
      if (typeof currentVal !== 'number') { skipped++; continue; }

      const desired = currentVal * workdayHours;
      if (nearlyEqual(currentVal, desired)) { skipped++; continue; }

      prepared++;
      if (dryRun) {
        console.log(`• (dry-run) ${title} (${page.id}) — ${currentVal}d → ${desired}h in ${targetProp}`);
        continue;
      }

      try {
        await pagesClient.update({
          page_id: page.id,
          properties: { [targetProp]: { number: desired } },
        });
        updated++;
        console.log(`✅ Updated ${title} (${page.id}) — ${currentVal}d → ${desired}h`);
      } catch (err) {
        console.error(`❌ Failed updating ${title} (${page.id}):`, err);
      }
    }

    cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
  } while (cursor);

  console.log('\nSummary:');
  console.log(`   Scanned:  ${scanned}`);
  console.log(`   Prepared: ${prepared}`);
  console.log(`   Updated:  ${dryRun ? 0 : updated}`);
  console.log(`   Skipped:  ${skipped}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Script error:', error);
    process.exit(1);
  });
}


