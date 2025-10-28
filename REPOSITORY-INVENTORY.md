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
- docs/guides/
  - deployment-guide.md: CI/CD and manual steps (review to align with current inline SSH workflow and hours-only behavior).
  - testing-guide.md: Largely legacy; tests are not in active use.
  - comment-logger-overview.md: Historical; comment-logger now external.
- docs/reports/
  - 2025-10-24-status.md: Migration status and next steps.
  - intraday-completion-report.md: Behavior notes.
- ec2-instance-docs/: Host-level guides (nginx, PM2, directory layout). Still accurate for server topology; augment with GitHub Actions workflow.

### CI/CD
- .github/workflows/deploy.yml: On push to main, SSH to EC2, git reset --hard origin/main, npm ci, build, pm2 reload, local health check.
- scripts/deploy.sh: Equivalent deploy steps; not used by workflow now, but useful manually.

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


