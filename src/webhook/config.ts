import * as dotenv from 'dotenv';
dotenv.config();

export const PORT: number = Number(process.env.PORT ?? 443);
export const DEBOUNCE_MS: number = Number(process.env.WEBHOOK_DEBOUNCE_MS ?? 10_000);
export const ENABLE_DATABASE_UPDATES: boolean = String(process.env.ENABLE_DATABASE_UPDATES ?? 'true') === 'true';
export const LOG_LEVEL: 'debug' | 'info' | 'silent' = (process.env.LOG_LEVEL as any) ?? 'info';

// Demo-mode (optional)
export const DEMO_USER_ID: string | undefined = process.env.DEMO_USER_ID ?? '1ded872b-594c-8161-addd-0002825994b5';
export const DEMO_USER_NAME: string | undefined = process.env.DEMO_USER_NAME ?? 'Derious Vaughn';
