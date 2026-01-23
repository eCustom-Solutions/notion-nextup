## Repository Inventory (feat/estimated-hours)

### Overview
This repo powers Notion NextUp: a webhook + CLI system that ranks tasks per owner and computes Projected Completion. It now operates hours-first (reads hours, converts to days internally) with Owner/People DB-based routing and allowlisting.

### Top-level
- README.md: Intro and usage.
- env.template: Required envs (add PEOPLE_DB_ID, PEOPLE_USER_PROP, GROUP_BY_PROP=Owner, ESTIMATED_HOURS_*).
- app.log: Local logs (git-ignored generally; present here for convenience).
- package.json: Scripts for CLI, webhook, and migration utilities.
- tsconfig.json: TS build settings (src → dist).

### Docs
- No in-repo docs directory. Deployment and EC2 notes live in the workflow and external notes.

### CI/CD
- .github/workflows/deploy.yml: On push to main, SSH to EC2, git reset --hard origin/main, npm ci, build, pm2 reload, local health check.

### Scripts
- scripts/estimated-hours/
  - convert-days-to-hours.ts: Owner-scoped; reads a days property and writes converted hours to target property (supports in-place if source==target).
  - convert-estimate-to-hours.ts: Converts target hours property (assumes values are in days; multiplies by workday hours).
  - copy-demo-estimated-days.ts: Copies a days property to a target property without conversion (legacy helper).
- scripts/export-users-by-department.ts: Utility for reporting.
- scripts/setup-env.sh: Local setup helper.

### Source
- src/cli/notion-nextup.ts
  - CLI entry to load tasks for a user, rank, compute projections, and (optionally) write queue ranks + projected completion.
  - Args: --notion-db, --user, --dry-run.

- src/webhook/
  - http/prod-server.ts: Express production server. Receives /notion-webhook, resolves identity (Owner → People.User; Assignee fallback), allowlist via People DB or legacy, schedules per-user processing.
  - config.ts: Central configuration: hours properties, workday window, Owner/People DB knobs, allowlist mode, logging flags, NOTION_API_KEY passthrough.
  - assignee-router.ts: Identity resolution + enqueue with DEBUG_ROUTING logs.
  - scheduler/: Debounce, ready queue, worker with rich error logging.
  - people.ts: Shared helper to resolve People page id from Notion user UUID (used across adapter/scripts).
  - tests/: Harness and unit tests (mostly legacy; not part of the current flow but can be run/adapted).

- src/api/
  - client.ts: Notion client + token bucket; now reads NOTION_API_KEY via config.
  - notion-adapter.ts: Loads tasks with DB-level filters, hours-only estimates, Owner-based filtering, and writeback (surgical update + cleanup).
  - objective-fanout.ts: Finds affected owners for objective events (Owner first, legacy fallback).
  - user-lookup.ts: Resolves user name → UUID via Notion Users API.

- src/core/
  - queue-ranking.ts: Groups by GROUP_BY_PROP, computes queue_score/rank, filters statuses.
  - projection-engine.ts: Assigns Projected Completion (intraday/business-day), preserves QA inheritance and zero-estimate first-task rule.
  - types.ts: Task/ProcessedTask/RankedTask; REQUIRED_COLUMNS no longer requires Estimated Days.

- src/utils/
  - logger.ts: Pretty console logs + file logs; bridges console.* to structured logs. Use LOG_PRETTY=true to pretty-print.
  - intraday.ts: Workday-hour math helpers.

### Configuration (runtime)
- Critical envs:
  - NOTION_API_KEY (or NOTION_TOKEN)
  - NOTION_DB_ID (tasks DB)
  - PEOPLE_DB_ID (People DB) and PEOPLE_USER_PROP (people property, e.g., "User")
  - GROUP_BY_PROP=Owner
  - ESTIMATED_HOURS_PROP (current: "Estimated Hours (Staging)" or temporary override "Estimated Days")
  - ESTIMATED_HOURS_REMAINING_PROP (current: "Estimated Hours Remaining (Staging)")
  - WORKDAY_START_HOUR/WORKDAY_END_HOUR (default 8–16)
  - ALLOWLIST_MODE=people_db_has_user (optional), DEBUG_ROUTING=true

### Current behavior
- Hours-only: Tasks without hours are skipped at load; tasks with hours are converted to days (internally) for projection.
- Owner-based scoping: Router and adapter use Owner relation → People DB mapping; legacy Assignee fallback exists.
- CLI and webhook server share logic; dry-run supported.

### Tests
- src/tests and src/webhook/tests contain legacy tests and a harness. Some imports and fixtures predate Owner/hours changes and may need updates. They are not required for the current workflow.

### Known legacy/outdated areas
- docs/guides/testing-guide.md: Pre-Owner migration; update or remove.
- docs/guides/comment-logger-overview.md: Comment logger is external; keep for history or move to its own repo.
- Some test files reference Assignee; update or archive if not in use.

### Cleanup suggestions
- Archive or delete legacy tests if not maintained.
- Prune outdated docs or add a NOTE at top linking to the current hours-only/Owner flow.
- After migrating off staging names, rename properties in config/env and Notion (e.g., set ESTIMATED_HOURS_PROP="Estimated Hours").
- Remove scripts you won’t need post-migration (keep convert-days-to-hours for historical/backfill if desired).

### Quick commands
- Dry-run CLI (Owner-scoped):
  - `npm run -s start -- --dry-run --user "Derious Vaughn" --notion-db "$NOTION_DB_ID"`
- Live CLI (override hours source temporarily):
  - `ESTIMATED_HOURS_PROP="Estimated Days" ENABLE_DATABASE_UPDATES=true npm run -s start -- --user "Derious Vaughn" --notion-db "$NOTION_DB_ID"`
- Convert days → hours (staging) for one user:
  - `npm run -s estimated-hours:convert-days-to-hours -- --user "Derious Vaughn" --days-property "Estimated Days" --target-property "Estimated Hours (Staging)" --workday-hours 8`

### Status
- Branch feat/estimated-hours is hours-only, Owner-first, with successful dry-run and live validations for the demo user.






Here’s a focused walkthrough of `src/api` and how each module fits together.

### client.ts
- Purpose: Single Notion client with global rate limiting.
- How it works:
  - Auth from config (`NOTION_API_KEY`).
  - Token bucket guard (capacity 3, 3/sec) for every call.
  - Thin wrappers:
    - `databases().query|retrieve`
    - `pages().update|retrieve`
    - `users().retrieve|me`
- Why it matters: Central throttle; you don’t have to worry about 429s in callers.

### notion-adapter.ts
- Purpose: Load, filter, and write tasks to the Tasks DB (the main integration surface).
- Key functions:
  - loadTasks(databaseId, userFilter?)
    - Filters:
      - Status: excludes all `EXCLUDED_STATUSES` (e.g., Backlogged, Done, etc.).
      - User scope:
        - `GROUP_BY_PROP === 'Owner'`: resolve the People page id via People DB (`resolvePeoplePageIdForUserUuid`) and filter by `TASK_OWNER_PROP` relation contains that page id.
        - Legacy fallback: filter by `Assignee.people.contains(userUUID)`.
    - Pagination: queries in a do/while with `page_size: 100`.
    - Hours-only estimates:
      - Reads `ESTIMATED_HOURS_REMAINING_PROP` (preferred) or `ESTIMATED_HOURS_PROP`.
      - Converts hours → days using `(WORKDAY_END_HOUR - WORKDAY_START_HOUR)`.
      - If neither hours field is present, the task is skipped (hours-only mode).
    - Properties mapped on each Task:
      - Title (`Name`), Owner (Owner relation id or Assignee’s name fallback), `Status (IT)`, `Estimated Days` (derived from hours), `Estimated Days Remaining`, `Due`, `Priority`, `Parent Task`, `Importance Rollup`, `Task Started Date`, `Projected Completion`, `Labels`, `Objective`, `pageId`.
      - Transitional: sets both `Assignee` and `Owner` (string key used for grouping).
    - Logging: Detailed `[load]`, `[estimate]`, and `[resolvePeople]` logs when `DEBUG_ROUTING=true`.
  - updateQueueRanksSurgically(databaseId, userFilter, processedTasks)
    - Step 1: Write queue rank and projected completion for all processed tasks.
      - Verifies after update by retrieving page.
      - Handles `validation_error` (archived) and `conflict_error` (retry loop).
    - Step 2: Query and clear queue ranks for tasks that are no longer in the processed set (scoped by Owner when available).
    - Step 3: Calls `clearExcludedQueueRanksForUser` to clear ranks on tasks now in excluded statuses.
  - clearExcludedQueueRanksForUser(databaseId, userFilter, limit=50)
    - Filters for pages with `Queue Rank` not empty, matching excluded statuses, scoped to the same user (Owner relation if possible).
    - Sets `Queue Rank` to null, handling archived/conflict cases.
- Why it matters:
  - Centralizes all DB-level filtering and surgical writes.
  - Now enforces hours-only semantics consistently across CLI and webhook paths.

### objective-fanout.ts
- Purpose: Determine which owners are impacted by an Objective page change.
- How it works:
  - Scans candidate relations to find Tasks linked to the given Objective.
  - Prefers `TASK_OWNER_PROP` relation to collect owner ids; legacy Assignee fallback exists.
  - Returns unique list of identifiers (uid/name), currently uses page ids as stand-ins if user resolution isn’t available (not critical to core flow).

### objective-projection.ts
- Purpose: Helper(s) supporting objective-linked projection behavior.
- Typical usage: Supplement objective workflows if needed; core projections run in `src/core/projection-engine.ts`.

### user-lookup.ts
- Purpose: Resolve a person’s Notion user UUID by name.
- How it works:
  - Queries workspace users via Notion Users API; returns the UUID (used to scope DB queries and People DB lookups).
- Why it matters:
  - Bridges human-friendly names (CLI arg) to the UUID needed for DB-level filters and People DB mapping.

### index.ts
- Purpose: Barrel file re-exporting API surfaces for convenience.
- Typical exports: adapter functions and client wrappers.

### Cross-cutting behaviors
- Rate limiting: All calls go through the throttled client.
- Error handling: Logs `APIResponseError` details (name, code, status, body, stack) where updates might fail.
- Logging: Controlled by config; `[resolvePeople]`, `[load]`, `[estimate]` traces make dry-runs/debugging transparent.
- Config dependency:
  - Hours props: `ESTIMATED_HOURS_PROP`, `ESTIMATED_HOURS_REMAINING_PROP`
  - Workday window: `WORKDAY_START_HOUR`, `WORKDAY_END_HOUR`
  - Owner/People: `GROUP_BY_PROP`, `TASK_OWNER_PROP`, `PEOPLE_DB_ID`, `PEOPLE_USER_PROP`
  - `DEBUG_ROUTING` enables verbose traces

What changed recently (hours-only + Owner)
- Adapter no longer falls back to days; tasks without hours are skipped.
- Owner scoping via People DB is the default; legacy Assignee filter remains as fallback.
- Writeback remains surgical: only updates needed fields; cleans up queue ranks for stragglers/excluded statuses.