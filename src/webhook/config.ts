import * as dotenv from 'dotenv';
// Load environment variables once at startup. This module is the single source of truth
// for runtime configuration. Prefer adding new knobs here with safe defaults.
dotenv.config();

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
