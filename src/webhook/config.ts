import * as dotenv from 'dotenv';
import path from 'path';
// Load environment variables once at startup from repo root .env explicitly
dotenv.config({ path: path.resolve(__dirname, '../../..', '.env') });

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

// Author classification toggles (for Automation webhook payloads)
export const ALLOW_BOT_EVENTS: boolean = String(process.env.ALLOW_BOT_EVENTS ?? 'false') === 'true';
export const ALLOW_AUTOMATION_EVENTS: boolean = String(process.env.ALLOW_AUTOMATION_EVENTS ?? 'false') === 'true';

if (Number.isNaN(WORKDAY_START_HOUR) || Number.isNaN(WORKDAY_END_HOUR) || WORKDAY_END_HOUR <= WORKDAY_START_HOUR || WORKDAY_START_HOUR < 0 || WORKDAY_END_HOUR > 24) {
  console.warn('[config] Invalid workday hours; falling back to 08:00–16:00');
  (global as any).__WORKDAY_START_HOUR = 8;
  (global as any).__WORKDAY_END_HOUR = 16;
}
