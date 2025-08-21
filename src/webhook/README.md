# Webhook Servers

This directory contains the webhook servers and supporting utilities for processing Notion webhook events and invoking the Notion NextUp pipeline.

## Directory Structure

- `config.ts`: Central configuration (PORT, debounce, demo user, logging, database update flag, globals)
- `types.ts`: Shared types for webhook payloads
- `assignee-router.ts`: Helper to route all assignees from webhook payloads to the scheduler
- `scheduler/`: Per-user debounce + global FIFO + single worker
  - `per-user-state.ts`, `debounce-router.ts`, `ready-queue.ts`, `worker.ts`, `index.ts`
- `notion-pipeline.ts`: Pure pipeline to process a single user end-to-end (unchanged)
- `http/`
  - `base-server.ts`: Shared Express app factory with JSON middleware and `/healthz`
  - `prod-server.ts`: Production webhook server (accepts all users, fans out to all assignees)
  - `demo-server.ts`: Demo server (filters to demo user only, respects multi-assignee safety)
- `runtime/`
  - `invoke-pipeline.ts`: Thin wrapper that calls the pipeline with centralized options
- `tests/`
  - `test-server.ts`: Scheduler-backed harness for local validation (reads-only if `ENABLE_DATABASE_UPDATES=false`)
  - `scheduler-sim.ts`: No-HTTP, no-Notion simulation of per-user scheduling
  - `assignee-router.test.ts`: Unit tests for multi-assignee routing logic

## Workflow Overview

1. A Notion webhook POSTs to `/notion-webhook` with a page payload.
2. The server extracts **all assignees** from the `Assignee` people array using `assignee-router.ts`.
3. **Each assignee** is routed to the Scheduler (per-user debounce → global FIFO → single worker):
   - Events for the same user within the debounce window are coalesced
   - Users are enqueued FCFS on timer fire; single worker processes users one at a time
   - If events arrive mid-run, that user is re-queued to the tail (fairness)
4. The pipeline loads that user's tasks (database-level filters), computes ranking and projected completion, and performs surgical updates back to Notion.
5. After writeback, the system clears any lingering `Queue Rank` for that user on tasks whose `Status (IT)` is now excluded (best-effort cleanup)

## Multi-Assignee Support

**New in this version**: Tasks with multiple assignees now trigger queue rebuilds for **all** assignees, not just the first one.

- **Production server**: Processes all assignees found in the webhook payload
- **Demo server**: Still enforces demo user restrictions but respects multi-assignee payloads
- **Test harness**: Supports `MULTI_ASSIGNEE_PAYLOAD="id1:name1,id2:name2"` for integration testing

## Scripts

- `npm run start:webhook` → starts `http/prod-server.ts`
- `npm run start:demo` → starts `http/demo-server.ts`
- `npx ts-node src/webhook/tests/test-server.ts` → runs the local test harness (scheduler + real pipeline)
  - Example (safe): `ENABLE_DATABASE_UPDATES=false DEMO_USER_ID=1ded872b-594c-8161-addd-0002825994b5 DEMO_USER_NAME="Derious Vaughn" npx ts-node src/webhook/tests/test-server.ts`
  - Multi-assignee test: `MULTI_ASSIGNEE_PAYLOAD="u1:Alice,u2:Bob,u3:Charlie" npx ts-node src/webhook/tests/test-server.ts`
- `npx ts-node src/webhook/tests/scheduler-sim.ts` → runs no-HTTP, no-Notion scheduling simulation
- `npx ts-node src/webhook/tests/assignee-router.test.ts` → runs unit tests for assignee routing

## Configuration

Set via environment variables (see `src/webhook/config.ts`):
- `PORT` (default 443)
- `WEBHOOK_DEBOUNCE_MS` (default 10000)
- `ENABLE_DATABASE_UPDATES` (default true)
- `LOG_LEVEL` (info|debug|silent)
- `GLOBAL_RPS` (default 3)
- `TOKEN_BUCKET_CAPACITY` (default 3)
- Demo mode only:
  - `DEMO_USER_ID`
  - `DEMO_USER_NAME`

Notes:
- `Projected Completion` is written as a Notion date; `Estimated Days Remaining` is preferred for timeline math and falls back to `Estimated Days`.
- Temporarily, queue score equals `Importance Rollup` (1–100) while weighting is evaluated.
- Writes are resilient: archived pages are skipped; conflicts (409) are retried per page with a short backoff; runs continue.

## Endpoints

- `POST /notion-webhook` → main webhook endpoint
- `GET /healthz` → health check

## Notes

- Production should run as non-root `appuser` with Linux `cap_net_bind_service` for port 443.
- The servers now delegate to the Scheduler for all-users FCFS processing (3 rps global cap). All Notion calls are throttled centrally.
