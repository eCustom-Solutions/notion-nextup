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

## Quick Links

- **Getting Started**: See `guides/testing-guide.md` for setup instructions
- **Performance**: See `performance/results.md` for optimization details
- **API Research**: See `research/notion-api-research.txt` for technical findings
- **Project History**: See `research/original-prompt.txt` for original requirements 
- **Webhook Testing**: Use `npx ts-node src/webhook/tests/test-server.ts` for webhook testing
- **Multi-Assignee Testing**: Use `MULTI_ASSIGNEE_PAYLOAD` environment variable for multi-assignee validation 