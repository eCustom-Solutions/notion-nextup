# Webhook Servers

This directory contains the webhook servers and supporting utilities.

## Structure
- `config.ts`: Central configuration (PORT, debounce, demo user, flags)
- `types.ts`: (reserved) Shared webhook payload types
- `debounce.ts`: Debounce strategies and manager
- `runtime/invoke-pipeline.ts`: Thin wrapper to call Notion pipeline with centralized options
- `http/`
  - `base-server.ts`: Shared Express setup and `/healthz`
  - `prod-server.ts`: Production webhook server
  - `demo-server.ts`: Demo-only server (Derious)

## Scripts
- `npm run start:webhook` → production server
- `npm run start:demo` → demo server

## Endpoints
- POST `/notion-webhook` → webhook handler
- GET `/healthz` → health check

## Notes
- Run as non-root `appuser` in production with Linux capabilities for port 443
- Debounce defaults are configurable via env (`WEBHOOK_DEBOUNCE_MS`)
