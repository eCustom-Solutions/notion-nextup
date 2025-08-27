# Documentation

This directory contains project documentation organized by purpose.

## Structure

### `guides/`
How-to guides and instructions:
- **`testing-guide.md`** - Complete testing instructions and setup guide
- **Webhook Testing**: Use `npx ts-node src/webhook/tests/test-server.ts` (scheduler-backed) or `npx ts-node src/webhook/tests/scheduler-sim.ts` (simulation)
- **Multi-Assignee Testing**: Use `MULTI_ASSIGNEE_PAYLOAD="id1:name1,id2:name2"` with test-server.ts to validate multi-assignee fan-out

### `performance/`
Performance analysis and optimization results:
- **`results.md`** - Performance optimization analysis and results
- **`results.json`** - Raw performance test data

### `research/`
Research and planning documents:
- **`notion-api-research.txt`** - Notion API capabilities research
- **`original-prompt.txt`** - Original project specification and requirements

## Recent Updates

### Multi-Assignee Support (✅ Completed)
- **New Feature**: Tasks with multiple assignees now trigger queue rebuilds for all assignees
- **Testing**: Unit tests (`assignee-router.test.ts`) and integration tests validate functionality
- **Production Ready**: Both production and demo servers handle multi-assignee scenarios

### Author Classification & Bot Filtering (✅ Completed)
- **New Feature**: Webhook server now classifies the event author (person, integration bot, automation) using Notion Users API
- **Config Flags**: `ALLOW_BOT_EVENTS`, `ALLOW_AUTOMATION_EVENTS`
- **Skip Logic**: Events triggered by the integration itself or automations are ignored by default

### One-Line EC2 Deployment (✅ Completed)
- **New Script**: `scripts/deploy-ec2.sh` automates SSH → pull → build → pm2 restart
- **Guide**: See `docs/guides/deployment-guide.md` for usage and environment variables

## Quick Links

- **Getting Started**: See `guides/testing-guide.md` for setup instructions
- **Performance**: See `performance/results.md` for optimization details
- **API Research**: See `research/notion-api-research.txt` for technical findings
- **Project History**: See `research/original-prompt.txt` for original requirements 
- **Webhook Testing**: Use `npx ts-node src/webhook/tests/test-server.ts` for webhook testing
- **Multi-Assignee Testing**: Use `MULTI_ASSIGNEE_PAYLOAD` environment variable for multi-assignee validation 