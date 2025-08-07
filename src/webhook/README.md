# Webhook Servers

This directory contains the webhook servers and supporting utilities for processing Notion webhook events and invoking the Notion NextUp pipeline.

## Directory Structure

- `config.ts`: Central configuration (PORT, debounce, demo user, logging, database update flag)
- `types.ts`: Shared types for webhook payloads
- `debounce.ts`: Debounce strategies and DebounceManager
- `notion-pipeline.ts`: Pure pipeline to process a single user end-to-end (unchanged)
- `http/`
  - `base-server.ts`: Shared Express app factory with JSON middleware and `/healthz`
  - `prod-server.ts`: Production webhook server (accepts all users)
  - `demo-server.ts`: Demo server (filters to demo user only)
- `runtime/`
  - `invoke-pipeline.ts`: Thin wrapper that calls the pipeline with centralized options
- `tests/`
  - `test-server.ts`: Test harness for local validation

## Workflow Overview

1. A Notion webhook POSTs to `/notion-webhook` with a page payload.
2. The server extracts the `Assignee` (first person) from the payload.
3. The request is routed through a debounce manager (delayed execution strategy):
   - Events for the same user within the debounce window are coalesced
   - After the quiet period, the server invokes the pipeline for that user
4. The pipeline loads that user’s tasks (database-level filters), computes ranking and projected completion, and performs surgical updates back to Notion.

## Scripts

- `npm run start:webhook` → starts `http/prod-server.ts`
- `npm run start:demo` → starts `http/demo-server.ts`
- `npx ts-node src/webhook/tests/test-server.ts` → runs the local test harness
  - Example (safe): `ENABLE_DATABASE_UPDATES=false DEMO_USER_ID=1ded872b-594c-8161-addd-0002825994b5 DEMO_USER_NAME="Derious Vaughn" npx ts-node src/webhook/tests/test-server.ts`

## Configuration

Set via environment variables (see `src/webhook/config.ts`):
- `PORT` (default 443)
- `WEBHOOK_DEBOUNCE_MS` (default 10000)
- `ENABLE_DATABASE_UPDATES` (default true)
- `LOG_LEVEL` (info|debug|silent)
- Demo mode only:
  - `DEMO_USER_ID`
  - `DEMO_USER_NAME`

Notes:
- `Projected Completion` is written as a Notion date; `Estimated Days Remaining` is preferred for timeline math and falls back to `Estimated Days`.
- Temporarily, queue score equals `Importance Rollup` (1–100) while weighting is evaluated.

## Endpoints

- `POST /notion-webhook` → main webhook endpoint
- `GET /healthz` → health check

## Notes

- Production should run as non-root `appuser` with Linux `cap_net_bind_service` for port 443.
- The scheduler for all-users FCFS processing (3 rps global cap) will attach here later; servers will delegate to a scheduler route instead of directly invoking the pipeline.
