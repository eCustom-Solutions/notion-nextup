# Notion NextUp

A TypeScript CLI tool that processes Notion databases and creates ranked task queues with projected completion timelines.

## Features

- **Notion API Integration**: Direct integration with Notion databases for real-time processing
- **Task Filtering**: Excludes ineligible tasks based on status and ownership
- **Queue Ranking**: Calculates deterministic task order per person using:
  - Parent tasks before child tasks (depth-first)
  - Earlier due dates first
  - Higher priority first (High > Medium > Low)
  - Original CSV order as tiebreaker
- **Projection Calculation**: Computes cumulative days to completion for each task
- **Surgical Updates**: Updates only tasks that need changes (no unnecessary operations)
- **Database-Level Filtering**: Optimized performance with Notion's native filtering
- **User UUID Lookup**: Automatic user name to UUID mapping for precise filtering

## Installation

```bash
npm install
```

## Usage

```bash
npx ts-node src/notionNextup.ts --notion-db your-database-id
```

### Arguments

- `--notion-db`: Notion database ID (required)
- `--user`: Filter tasks by assignee (default: "Derious Vaughn")
- `--dry-run`: Skip writing back to Notion (for testing)

### Example

```bash
# Process Notion database (dry run)
npx ts-node src/notionNextup.ts \
    --notion-db your-database-id \
    --dry-run

# Process Notion database (write back)
npx ts-node src/notionNextup.ts \
    --notion-db your-database-id

# Process Notion database with user filter
npx ts-node src/notionNextup.ts \
    --notion-db your-database-id \
    --user "Alice" \
    --dry-run
```

## Performance

The pipeline is optimized for production use with significant performance improvements:

- **85% faster execution** (112s → 16s for typical workloads)
- **Database-level filtering** reduces API calls by 90%
- **Surgical updates** only modify tasks that need changes
- **Production-ready** for webhook-triggered processing

See `performance-results.md` for detailed performance analysis.

## Required Notion Database Properties

- `Name`: Task title
- `Assignee`: Assignee (people property)
- `Status (IT)`: Task status
- `Estimated Days`: Effort estimate (number property)
- `Queue Rank`: Queue ranking (number property, will be updated)
- `Projected Days to Completion`: Projected completion (number property, will be updated)

## Optional Notion Database Properties

- `Due`: Due date (date property)
- `Priority`: Priority level (status property: High/Medium/Low)
- `Parent Task`: Parent task name (text property)

## Updated Properties

The pipeline updates the following properties in your Notion database:
- `Queue Rank`: 1-based ranking order
- `Projected Days to Completion`: Cumulative days to finish

## Excluded Statuses

Tasks are excluded if status is:
- Backlogged
- Done
- Live in Dev
- Ready for QA
- Live in Staging
- Blocked

## Performance Optimizations

The pipeline includes several performance optimizations:

- **Database-Level Filtering**: Uses Notion's native filtering to process only relevant tasks
- **User UUID Lookup**: Automatically maps user names to UUIDs for precise filtering
- **Surgical Updates**: Only updates tasks that need changes, avoiding unnecessary operations
- **85% Performance Improvement**: Pipeline runs 85% faster than baseline implementation
- **Production Ready**: Optimized for webhook-triggered processing with sub-20-second execution

## Project Structure

```
notion-nextup/
├── src/                    # Source code
│   ├── notionNextup.ts    # Main CLI script
│   ├── core.ts            # Core business logic
│   ├── notionAdapter.ts   # Notion API integration
│   ├── user-lookup.ts     # User UUID lookup utilities
│   ├── debug-tasks.ts     # Debug utilities for data inspection
│   ├── performance-test.ts # Performance testing utilities
│   ├── test-notion.ts     # Notion integration tests
│   ├── services/          # Service modules
│   │   └── notion_client.ts # Throttled Notion client
│   └── types.ts           # Shared type definitions
├── docs/                   # Project documentation
│   ├── testing-guide.md   # Testing instructions
│   ├── performance-results.md # Performance optimization results
│   ├── notion-api-research.txt # Notion API research findings
│   └── README.md          # Documentation index
├── scripts/                # Utility scripts
│   └── setup-env.sh       # Environment setup script
├── package.json           # Project configuration
├── tsconfig.json          # TypeScript configuration
└── README.md             # This file
```

## Architecture

The project is designed with a modular architecture to support multiple data sources:

- **`types.ts`**: Shared type definitions and constants
- **`core.ts`**: Core business logic (queue ranking, eligibility, etc.)
- **`notionAdapter.ts`**: Notion API integration with database-level filtering
- **`user-lookup.ts`**: User UUID lookup and mapping utilities
- **`debug-tasks.ts`**: Debug utilities for data inspection
- **`performance-test.ts`**: Performance testing and benchmarking utilities
- **`notionNextup.ts`**: CLI entry point that orchestrates the modules

This design focuses on Notion API integration with advanced optimizations for production use.

## Notion API Setup

To use the Notion API functionality:

### Option 1: Using .env file (Recommended)
1. **Run the setup script**:
   ```bash
   npm run setup
   ```

2. **Edit .env with your values**:
   - Get your API key from [Notion Integrations](https://www.notion.so/my-integrations)
   - Get your database ID from your Notion database URL

3. **Test with dry run**:
   ```bash
   npm run dev:notion -- --notion-db your-database-id --dry-run
   ```

### Option 2: Environment variables
1. **Set up Notion API key**:
   ```bash
   export NOTION_API_KEY="your-notion-api-key"
   ```

2. **Get your database ID** from the Notion database URL

3. **Test with dry run**:
   ```bash
   npm run dev:notion -- --notion-db your-database-id --dry-run
   ```

## Development

```bash
# Run in development mode with file watching
npm run dev

# Build TypeScript
npm run build



# Test Notion API (dry run)
npx ts-node src/notionNextup.ts --notion-db your-database-id --dry-run

# Test with user filter
npx ts-node src/notionNextup.ts --notion-db your-database-id --user "Alice" --dry-run

# Debug task data
npm run debug

# Run performance tests
npm run perf

# Run Notion integration tests
npm run test:notion

# Run integration tests
npx ts-node src/test-notion.ts

# Run integration tests with user filter
npx ts-node src/test-notion.ts --user "Alice"

# Run unit tests
npm test 