import * as dotenv from 'dotenv';
import path from 'path';
// Load environment variables once at startup from repo root .env explicitly
dotenv.config({ path: path.resolve(__dirname, '../../..', '.env') });

// Notion API
export const NOTION_API_KEY: string | undefined = process.env.NOTION_API_KEY ?? process.env.NOTION_TOKEN;
export const NOTION_TOKEN: string | undefined = process.env.NOTION_TOKEN;

// Server / Webhook
export const PORT: number = Number(process.env.PORT ?? 443);
export const DEBOUNCE_MS: number = Number(process.env.WEBHOOK_DEBOUNCE_MS ?? 10_000);
export const LOG_LEVEL: 'debug' | 'info' | 'silent' = (process.env.LOG_LEVEL as any) ?? 'info';

// Safety / Write mode
// - ENABLE_DATABASE_UPDATES=false → DRY-RUN (no writes)
// - ENABLE_DATABASE_UPDATES=true  → Live writes (guard with CONFIRM_LIVE in harness)
export const ENABLE_DATABASE_UPDATES: boolean = String(process.env.ENABLE_DATABASE_UPDATES ?? 'true') === 'true';

// Global rate limiting for Notion API
export const GLOBAL_RPS: number = Number(process.env.GLOBAL_RPS ?? 3);
export const TOKEN_BUCKET_CAPACITY: number = Number(process.env.TOKEN_BUCKET_CAPACITY ?? 3);

// Demo-mode (optional)
export const DEMO_USER_ID: string | undefined = process.env.DEMO_USER_ID ?? '1ded872b-594c-8161-addd-0002825994b5';
export const DEMO_USER_NAME: string | undefined = process.env.DEMO_USER_NAME ?? 'Derious Vaughn';

// Objectives database (optional) for objective→tasks fanout
export const OBJECTIVES_DB_ID: string | undefined = process.env.OBJECTIVES_DB_ID;

// Intraday projection knobs
export const USE_INTRADAY: boolean = String(process.env.USE_INTRADAY ?? 'true') === 'true';
export const WORKDAY_START_HOUR: number = Number(process.env.WORKDAY_START_HOUR ?? 8);
export const WORKDAY_END_HOUR: number = Number(process.env.WORKDAY_END_HOUR ?? 16);
export const TIMEZONE: string = process.env.TIMEZONE ?? 'America/Los_Angeles';

// Hours-first migration toggles and property names (configurable via .env)
export const PREFER_ESTIMATED_HOURS_STAGING: boolean = String(process.env.PREFER_ESTIMATED_HOURS_STAGING ?? 'false') === 'true';
export const ESTIMATED_HOURS_PROP: string = process.env.ESTIMATED_HOURS_PROP ?? 'Estimated Hours (Staging)';
export const ESTIMATED_HOURS_REMAINING_PROP: string = process.env.ESTIMATED_HOURS_REMAINING_PROP ?? 'Estimated Hours Remaining (Staging)';
export const ESTIMATED_DAYS_PROP: string = process.env.ESTIMATED_DAYS_PROP ?? 'Estimated Days';
export const ESTIMATED_DAYS_REMAINING_PROP: string = process.env.ESTIMATED_DAYS_REMAINING_PROP ?? 'Estimated Days Remaining';

// Author classification toggles (for Automation webhook payloads)
export const ALLOW_BOT_EVENTS: boolean = String(process.env.ALLOW_BOT_EVENTS ?? 'false') === 'true';
export const ALLOW_AUTOMATION_EVENTS: boolean = String(process.env.ALLOW_AUTOMATION_EVENTS ?? 'false') === 'true';
export const DEBUG_ROUTING: boolean = String(process.env.DEBUG_ROUTING ?? 'true') === 'true';

if (Number.isNaN(WORKDAY_START_HOUR) || Number.isNaN(WORKDAY_END_HOUR) || WORKDAY_END_HOUR <= WORKDAY_START_HOUR || WORKDAY_START_HOUR < 0 || WORKDAY_END_HOUR > 24) {
  console.warn('[config] Invalid workday hours; falling back to 08:00–16:00');
  (global as any).__WORKDAY_START_HOUR = 8;
  (global as any).__WORKDAY_END_HOUR = 16;
}

// People/Owner migration configuration
// - TASK_OWNER_PROP: relation on Tasks DB that points to People DB (default: 'Owner')
// - TASK_WATCHER_PROP: optional additional people property (default: 'Watcher')
// - PEOPLE_DB_ID: the Notion database id of the People DB
// - PEOPLE_USER_PROP: people property on the People DB that holds the actual Notion user (default: 'User')
// - GROUP_BY_PROP: which task string field we group by in ranking/projection (default: 'Assignee' for legacy, can be 'Owner')
// - ALLOWLIST_MODE: 'people_db_has_user' to allow all People pages with a User set; otherwise legacy env/file allowlist
export const TASK_OWNER_PROP: string = process.env.TASK_OWNER_PROP ?? 'Owner';
export const TASK_WATCHER_PROP: string = process.env.TASK_WATCHER_PROP ?? 'Watcher';
export const PEOPLE_DB_ID: string | undefined = process.env.PEOPLE_DB_ID ?? "1906824d550381adb0f0e38edd947e17";
export const PEOPLE_USER_PROP: string = process.env.PEOPLE_USER_PROP ?? 'User';
export const GROUP_BY_PROP: string = process.env.GROUP_BY_PROP ?? 'Owner';
export const ALLOWLIST_MODE: 'people_db_has_user' | 'legacy' = (process.env.ALLOWLIST_MODE as any) === 'people_db_has_user' ? 'people_db_has_user' : 'legacy';
