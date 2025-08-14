# Objectives → Tasks Webhook Fanout (Design + Next Steps)

## Context
- Current server processes task-page webhooks only when `Assignee` is present; events without an assignee are accepted but ignored.
- Notion automations cannot trigger directly on a Rollup change (e.g., `Importance Rollup`) in Tasks.
- Desired behavior: when an Objective's source property (feeding the rollup) changes, trigger recomputation for all related Tasks’ assignees.

## Problem
- Objective updates land as webhooks for Objective pages (different database).
- Our handler ignores those because there is no `Assignee` on the Objective payload.

## Path Forward (no server deploy until verified)
1. Add env for the Objectives DB
   - `OBJECTIVES_DB_ID=<id>`
   - Extract from the Objectives DB URL (TODO once link is provided).

2. Objective event handling (server-side logic)
   - Detect Objective-page events by `req.body.data.parent.database_id === OBJECTIVES_DB_ID`.
   - Query the Tasks database for pages whose relation to the Objective contains the Objective `page_id`.
   - For each related Task page:
     - Read `Assignee` → collect unique user UUIDs
   - Enqueue those users via the scheduler (`routeEvent(assigneeId, assigneeName)`) with the existing allowlist gating.

3. Test harness (first)
   - Extend `src/webhook/tests/test-server.ts` to accept an Objective `page_id` (or URL):
     - Resolve related Tasks via the relation (Objectives property: `Tasks` per user note; Tasks likely has `Objective` relation back)
     - Collect assignees and route them to the scheduler
     - Dry run by default; optional live mode guarded as today

4. Validation plan
   - Dry run: pass a known Objective page id and confirm the harness logs selected users and per-user processing
   - Live run (guarded): enable writes; verify Queue Rank and Projected Completion updates on related Tasks
   - Confirm allowlist still applies in prod

5. Rollout
   - After harness validation, add the Objective branch to `prod-server.ts`
   - Keep existing task handling intact; objective fanout is an additive path
   - Deploy; monitor logs for fanout counts and per-user writes

## Open Questions
- Provide the Objectives DB URL (to extract `OBJECTIVES_DB_ID`)
- Confirm Tasks←→Objectives relation field on Tasks (user stated Objectives has `Tasks`; likely Tasks has `Objective`)
- Provide a sample Objective page for harness testing

## Logging & Metrics
- Log when an Objective event is handled: objectiveId, relatedTaskCount, uniqueAssigneeCount
- Keep per-user logs as-is (loaded/processed/updated counts)

## Risks & Mitigations
- Large Objectives with many tasks → longer fanout: token bucket (3 rps) protects API; scheduler serializes per-user
- Objective updates without related tasks → no-ops; log and return
- Tasks without `Assignee` → skipped (consistent with current eligibility)

## Status
- Pending: `OBJECTIVES_DB_ID` and sample Objective payload/URL to implement and test harness
- No changes deployed yet; this doc tracks the plan
