## All-Users Webhook Processing: Per-User FCFS Under Global 3 RPS

Audience: Engineers/LLMs implementing the next iteration of Notion NextUp webhook processing

### 1) Context and Current State
- Project: Notion NextUp (TypeScript). Current pipeline:
  - Loads tasks from Notion database using database-level filters
  - Ranks tasks (currently a temporary patch using Importance-only) and computes Projected Completion (business-day aware)
  - Writes back Queue Rank and Projected Completion
  - Webhook servers: production and demo (Express, delayed-execution debounce)
- Today’s behavior: We trigger processing for a specific user (demo mode) or for a user derived from webhook event. We now want to support "all users" in a scalable, fair way.

### 2) Objective
Process webhook-driven updates for every user independently with:
- Per-user first-come-first-serve (FCFS) execution order (by readiness time after debounce)
- Per-user debounce (to coalesce multiple edits per user)
- Global request-rate cap of 3 Notion API calls per second (irrespective of concurrency)
- Fairness across users; avoid starvation; robustness to bursts

### 3) Non-Goals
- Horizontal scaling across multiple instances (supported later as an extension)
- Changing ranking logic (still supports current Importance-only or future weighted modes)
- Changing database schema beyond what is already implemented (Projected Completion, etc.)

### 4) Constraints and Assumptions
- Notion API limit: 3 requests/second globally
- Webhook event payloads include an affected `Assignee` (user). If missing, skip handling
- We treat each user independently; do not overlap processing for the same user
- Concurrency beyond 1 does not increase throughput under a hard 3 rps cap and adds complexity

### 5) High-Level Design Overview
Components:
- Event Ingestor (Express webhook handler)
- Per-User Debounce Manager (one state per userId)
- Global Ready Queue (FIFO of userIds ready to run)
- Single Worker Loop (pops from FIFO and runs the user pipeline)
- Global Token Bucket (3 tokens/second; each Notion API call consumes 1)
- Observability (metrics, logs) and Backoff (429/Retry-After)

Flow:
1. Webhook arrives → extract `assigneeId` and `assigneeName` → send to Debounce Manager
2. Debounce Manager resets a per-user timer (e.g., 5–15s). When the timer fires, it enqueues the userId into the global FIFO (set semantics: no duplicates)
3. Worker pops next userId (FCFS by ready-time), then runs the user pipeline end-to-end. Per-user concurrency is 1
4. If additional events for that user arrive while processing, set `rerunRequested=true` for that user; after finishing, requeue that user to the tail to preserve fairness
5. All API calls pass through the Token Bucket (3 rps)

### 6) Per-User Debounce Manager (State Machine)
Per-user state:
- lastEventTs: number
- debounceTimer: NodeJS.Timeout | null
- inQueue: boolean (currently queued in the global FIFO)
- isProcessing: boolean (currently in the worker)
- rerunRequested: boolean (set if events arrive while processing)

Events:
- onWebhookEvent(userId): update lastEventTs; reset debounceTimer to now + debounceMs
- onDebounceFire(userId): if not inQueue and not isProcessing, enqueue userId and set inQueue=true
- onWorkerDequeue(userId): set inQueue=false, isProcessing=true
- onWorkerFinish(userId): set isProcessing=false; if rerunRequested, push to queue and set rerunRequested=false
- onEventWhileProcessing(userId): set rerunRequested=true

Debounce parameters:
- debounceMs default: 5000–15000 ms (configurable)
- Adaptive option: temporarily increase debounceMs if 429 rate rises or queue depth grows

### 7) Global Ready Queue
- Data structure: FIFO queue of userId strings; external Set to avoid duplicates
- Operations: enqueue(userId), dequeue(): userId | undefined
- Fairness: FCFS ordering; re-queue user if rerunRequested after processing

### 8) Token Bucket (3 RPS)
- Capacity: 3 tokens; refill 3 tokens/second on interval (or fractional refill by time delta)
- Acquire(): await until token available; on 429 with Retry-After, sleep for that period and optionally reduce effective rate briefly
- All Notion API reads/writes must call Acquire() before making the request

### 9) User Processing Pipeline (per userId)
- Query database with database-level filters for that user (to minimize reads)
- Compute ranking for the user’s tasks (current temporary Importance-only or future weighted logic)
- Compute Projected Completion (business-day aware), using Task Started Date if present or today as fallback
- Surgical updates: only write tasks whose values changed (Queue Rank, Projected Completion)
- Metrics: count tasks loaded, processed, updated, token wait time, API calls made

### 10) Alternating User Case (U1 → U2 → U1)
- U1 event arrives; U1 debounce starts. U2 event arrives; U2 debounce starts. Another U1 event arrives; U1 timer resets
- When U2’s timer fires first, U2 is enqueued. Then U1’s timer fires, U1 enqueued
- Worker processes U2; during U2, another U1 event may arrive → rerunRequested(U1)=true
- Worker processes U1; if more U1 events arrived during processing, rerunRequested(U1)=true → after finishing, U1 requeued at tail
- Ensures per-user FCFS fairness and no starvation

### 11) Error Handling & Backoff
- 429/Retry-After: Respect header; sleep + optionally increase debounceMs briefly
- Transient errors: retry with capped exponential backoff (e.g., 250ms → 1s → 2s; max 3 tries)
- Permanent errors: log and drop; do not poison the queue
- If processing crashes mid-user, ensure user’s `isProcessing=false` on recovery and optionally requeue

### 12) Observability
- Metrics to log/emit:
  - per-user: queue depth, time-to-ready, processing duration, rerun count
  - global: FIFO depth, token bucket waits, RPS, 429 count, update count, failure count
- Log key lifecycle events per user: enqueued, dequeued, started, finished, requeued, skipped (no changes)

### 13) Configuration
- debounceMs: number (default 5000–15000ms)
- maxRps: number (default 3)
- tokenBucketCapacity: number (default 3)
- backoff policy: initial delay, max delay, retries
- enableLogging: boolean

### 14) Horizontal Scaling (Future Extension)
- Replace in-memory FIFO + per-user state with Redis/SQS
- Use a distributed lock per userId to prevent overlapping processing across instances
- Token bucket centralized (Redis-based rate limiter) to maintain global 3 rps across replicas

### 15) Security
- Continue running as non-root `appuser` with `cap_net_bind_service` for 443
- Webhook endpoint secret (optional) to verify origin
- Rate limit inputs to webhook endpoint if necessary

### 16) Test Plan
Unit Tests:
- Debounce state machine transitions for single user
- FIFO enqueue/dequeue semantics and duplicate suppression
- Rerun behavior when events arrive mid-processing
- Token bucket enforcement at 3 rps

Integration Tests:
- Burst of events for one user → single processing after debounce
- Alternating events for two users → FCFS order preserved
- 429 responses → backoff and continued progress
- No-assignee events → skipped safely

End-to-End Tests:
- Spin webhook server; post mock payloads for multiple users; observe PM2 logs and Notion updates (dry-run option)

### 17) Rollout Plan
- Stage 1: Implement in-memory per-user debounce + global FIFO + single worker + token bucket (3 rps)
- Stage 2: Enable verbose metrics and run on demo server; verify fairness and rate-limiting behavior
- Stage 3: Enable in production; monitor 429 rate and queue depth; tune debounceMs as needed

### 18) Implementation Notes (Pseudocode)

Per-user debounce manager skeleton:
```typescript
interface UserState {
  lastEventTs: number;
  debounceTimer: NodeJS.Timeout | null;
  inQueue: boolean;
  isProcessing: boolean;
  rerunRequested: boolean;
}

const userIdToState = new Map<string, UserState>();
const readyQueue: string[] = []; // FIFO
const enqueued = new Set<string>();

function onWebhookEvent(userId: string) {
  const s = userIdToState.get(userId) ?? { lastEventTs: 0, debounceTimer: null, inQueue: false, isProcessing: false, rerunRequested: false };
  s.lastEventTs = Date.now();
  if (s.debounceTimer) clearTimeout(s.debounceTimer);
  s.debounceTimer = setTimeout(() => {
    if (!s.inQueue && !s.isProcessing) {
      readyQueue.push(userId);
      enqueued.add(userId);
      s.inQueue = true;
    }
  }, debounceMs);
  userIdToState.set(userId, s);
}
```

Worker loop + rerun behavior:
```typescript
async function workerLoop() {
  while (true) {
    const userId = readyQueue.shift();
    if (!userId) { await sleep(50); continue; }
    enqueued.delete(userId);

    const s = userIdToState.get(userId)!;
    s.inQueue = false;
    s.isProcessing = true;
    s.rerunRequested = false;

    try {
      await processUser(userId); // token-bucket wrapped Notion calls inside
    } finally {
      s.isProcessing = false;
      if (s.rerunRequested && !s.inQueue) {
        readyQueue.push(userId);
        enqueued.add(userId);
        s.inQueue = true;
        s.rerunRequested = false;
      }
    }
  }
}
```

Within `processUser(userId)`:
- Acquire tokens before each Notion API call (query + updates)
- Load tasks filtered by userId
- Rank and compute Projected Completion
- Surgical update only changed tasks

On event during processing:
```typescript
function onEventWhileProcessing(userId: string) {
  const s = userIdToState.get(userId);
  if (!s) return;
  s.rerunRequested = true;
}
```

Token bucket wrapper example:
```typescript
class TokenBucket {
  constructor(capacity: number, refillPerSec: number) { /* ... */ }
  async acquire() { /* wait until token available */ }
}

async function notionCall<T>(fn: () => Promise<T>): Promise<T> {
  await bucket.acquire();
  try { return await fn(); }
  catch (e: any) {
    if (e.code === 'rate_limited' && e.retryAfterMs) { await sleep(e.retryAfterMs); }
    else if (e.response?.headers?.['retry-after']) { await sleep(Number(e.response.headers['retry-after']) * 1000); }
    else throw e;
    return await fn();
  }
}
```

### 19) Open Questions
- Adaptive debounce policy specifics (how much to increase on 429? decay back?)
- Persisting per-user state across restarts (in-memory vs. external store)
- Long-running users with very large task counts: should we chunk updates?

### 20) Deliverables Checklist
- [x] Per-user debounce state + global FIFO
  - Implemented under `src/webhook/scheduler/` (`per-user-state.ts`, `ready-queue.ts`, `debounce-router.ts`)
- [x] Single worker loop + rerun mechanics
  - Implemented in `src/webhook/scheduler/worker.ts` and wired via `src/webhook/scheduler/index.ts`
- [x] Global token bucket at 3 rps (all Notion calls use it)
  - Implemented `src/utils/token-bucket.ts`; integrated in `src/api/client.ts` so all Notion calls acquire tokens
- [x] Updated webhook handler to extract user and route to per-user debounce
  - `src/webhook/http/prod-server.ts` and `src/webhook/http/demo-server.ts` now delegate to `startScheduler(...).routeEvent(...)`
- [ ] Observability: queue depth, processing time, token waits, 429s
- [x] Config knobs and sane defaults
  - Added `GLOBAL_RPS` and `TOKEN_BUCKET_CAPACITY` to `src/webhook/config.ts` (client currently uses defaults; see next steps)
- [x] Demo + production server wired to new scheduler
  - Both servers initialize the scheduler once and route events to it
- [x] Remove legacy debounce manager code
  - `src/webhook/debounce.ts` deleted; servers and tests use scheduler exclusively

### 21) Code Organization & Integration Points

This change can be added with minimal churn by keeping existing boundaries and introducing a small scheduler layer under `src/webhook/`.

- Keep existing modules
  - `src/core/`: Ranking, types, business-day projection logic (unchanged)
  - `src/api/`: Notion adapter + user lookup; add global rate limit enforcement centrally
  - `src/webhook/notion-pipeline.ts`: Continues to be the “process one user end-to-end” function
  - `src/webhook/server.ts` and `src/webhook/demo-server.ts`: Thin HTTP adapters

- New orchestration layer (scheduler)
  - Directory: `src/webhook/scheduler/`
    - `per-user-state.ts`: Defines per-user state (lastEventTs, debounceTimer, inQueue, isProcessing, rerunRequested) and helpers
    - `debounce-router.ts`: Per-user debounce facade; API: `onWebhookEvent(userId: string, userName: string)`
    - `ready-queue.ts`: FIFO queue + Set for duplicate suppression; API: `enqueue(userId)`, `dequeue()`
    - `worker.ts`: Single-worker loop; pops users FCFS, runs pipeline, handles `rerunRequested` requeue; respects token bucket
    - `index.ts`: Wires debounce → queue → worker; exports `startScheduler(config)` and `routeEvent(userId, userName)`
    - `metrics.ts` (optional): counters for queue depth, 429s, processing durations

- Rate limiting (global, 3 rps)
  - Centralize in `src/api/client.ts` so all Notion calls are throttled transparently
    - Add `src/utils/token-bucket.ts` (or embed a class in `client.ts`) and wrap all Notion API calls
    - Ensure reads and writes acquire tokens; honor Retry-After with sleep/backoff

- Config
  - `src/webhook/config.ts` with:
    - `DEBOUNCE_MS` (default 5–15s)
    - `GLOBAL_RPS = 3`
    - `TOKEN_BUCKET_CAPACITY = 3`
    - optional backoff tuning flags and logging switches

- Server integration
  - In `server.ts` and `demo-server.ts`:
    - Initialize once: `startScheduler(config)`
    - Replace direct pipeline calls with: `routeEvent(assigneeId, assigneeName)`
    - Skip events with no assignee

- Tests and tools
  - Extend `src/webhook/test-server.ts` to produce multi-user bursts and alternating users (U1→U2→U1)
  - Optional: `src/webhook/stress-test.ts` to simulate N users and measure queue fairness/token waits

- What stays where (separation of concerns)
  - “How to process one user” → `notion-pipeline.ts`
  - “When to run which user” → `src/webhook/scheduler/*`
  - “How fast we can call Notion” → enforced in `src/api/client.ts` via token bucket

- Minimal change summary
  - Add scheduler directory and utilities; do not modify ranking logic
  - Centralize rate limiting in API client (no call-site changes needed)
  - Servers delegate to scheduler instead of pipeline directly

### 22) Current Implementation Snapshot (Aug 2025)
- Scheduler (new):
  - `src/webhook/scheduler/per-user-state.ts`
  - `src/webhook/scheduler/ready-queue.ts`
  - `src/webhook/scheduler/debounce-router.ts`
  - `src/webhook/scheduler/worker.ts`
  - `src/webhook/scheduler/index.ts`
- Rate limiting (new):
  - `src/utils/token-bucket.ts`
  - Integrated in `src/api/client.ts`
- Server wiring (updated):
  - `src/webhook/http/prod-server.ts`
  - `src/webhook/http/demo-server.ts`
- Config (updated):
  - `src/webhook/config.ts` adds `GLOBAL_RPS`, `TOKEN_BUCKET_CAPACITY`

Optional next steps (proposed):
- Wire `GLOBAL_RPS` and `TOKEN_BUCKET_CAPACITY` into `src/api/client.ts` instead of fixed defaults
- Add `src/webhook/scheduler/metrics.ts` to emit queue depth, processing durations, token waits, and 429 counts
- Enhance rate-limit handling to respect Notion `Retry-After` headers and temporarily reduce effective rate
- Extend `src/webhook/tests/test-server.ts` with multi-user burst/alternation scenarios; optional `stress-test.ts`
