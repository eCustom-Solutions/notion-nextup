# Notion NextUp

A TypeScript CLI tool that processes Notion databases and creates ranked task queues with projected completion timelines.

## Features

- **Notion API Integration**: Direct integration with Notion databases for real-time processing
- **Webhook Server**: Express.js webhook server for real-time Notion updates
- **Smart Debouncing**: Configurable debounce strategies (simple, queue, delayed execution)
- **Task Filtering**: Excludes ineligible tasks based on status and ownership
- **Queue Ranking**: Calculates deterministic task order per person using:
  - Parent tasks before child tasks (depth-first)
  - Earlier due dates first
  - Higher priority first (High > Medium > Low)
  - Higher importance values first (1-100 scale)
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

### CLI Mode

```bash
npx ts-node src/cli/notion-nextup.ts --notion-db your-database-id
```

### Webhook Server Mode

```bash
npm run start:webhook
```

### Arguments (CLI Mode)

- `--notion-db`: Notion database ID (required)
- `--user`: Filter tasks by assignee (default: "Derious Vaughn")
- `--dry-run`: Skip writing back to Notion (for testing)

### Examples

```bash
# Process Notion database (dry run)
npx ts-node src/cli/notion-nextup.ts \
    --notion-db your-database-id \
    --dry-run

# Process Notion database (write back)
npx ts-node src/cli/notion-nextup.ts \
    --notion-db your-database-id

# Process Notion database with user filter
npx ts-node src/cli/notion-nextup.ts \
    --notion-db your-database-id \
    --user "Alice" \
    --dry-run

# Start webhook server
npm run start:webhook
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
- `Projected Completion`: Projected completion date (date property, will be updated)

## Optional Notion Database Properties

- `Due`: Due date (date property)
- `Priority`: Priority level (status property: High/Medium/Low)
- `Parent Task`: Parent task name (text property)
- `Importance Rollup`: Importance value (rollup property: 1-100)
- `Task Started Date`: Task start date (date property, used for completion calculation)

## Updated Properties

The pipeline updates the following properties in your Notion database:
- `Queue Rank`: 1-based ranking order
- `Projected Completion`: Calculated completion date (business days from start date)

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
│   ├── core/               # Core business logic
│   │   ├── index.ts        # Core exports
│   │   ├── queue-ranking.ts # Queue ranking algorithms
│   │   └── types.ts        # Type definitions
│   ├── api/                # Notion API integration
│   │   ├── index.ts        # API exports
│   │   ├── notion-adapter.ts # Database operations
│   │   ├── user-lookup.ts  # User UUID utilities
│   │   └── client.ts       # Throttled Notion client
│   ├── webhook/            # Webhook server & debouncing
│   │   ├── server.ts       # Express.js webhook server
│   │   ├── notion-pipeline.ts # Pure Notion API logic
│   │   ├── debounce.ts     # Generic debounce strategies
│   │   └── test-server.ts  # Webhook testing utilities
│   ├── utils/              # Utilities & debugging
│   │   ├── index.ts        # Utility exports
│   │   ├── debug-tasks.ts  # Debug utilities
│   │   └── performance-test.ts # Performance testing
│   ├── tests/              # Integration tests
│   │   ├── index.ts        # Test exports
│   │   └── notion-integration.ts # Notion API tests
│   └── cli/                # CLI entry point
│       └── notion-nextup.ts # Main CLI script
├── docs/                   # Project documentation
│   ├── guides/             # How-to guides
│   │   └── testing-guide.md # Testing instructions
│   ├── performance/        # Performance analysis
│   │   ├── results.md      # Performance results
│   │   └── results.json    # Raw performance data
│   ├── research/           # Research & planning
│   │   ├── notion-api-research.txt # API research
│   │   └── original-prompt.txt # Original requirements
│   └── README.md          # Documentation index
├── scripts/                # Utility scripts
│   └── setup-env.sh       # Environment setup script
├── package.json           # Project configuration
├── tsconfig.json          # TypeScript configuration
└── README.md             # This file
```

## Architecture

The project is designed with a clean, modular architecture:

### Core Components
- **`core/`**: Core business logic (queue ranking, types)
- **`api/`**: Notion API integration (database operations, user lookup)
- **`webhook/`**: Webhook server and debouncing logic
  - `notion-pipeline.ts`: Pure Notion API logic
  - `debounce.ts`: Generic debounce strategies
  - `server.ts`: Express.js webhook server
  - `test-server.ts`: Testing utilities
- **`utils/`**: Utilities and debugging tools
- **`tests/`**: Integration tests
- **`cli/`**: Command-line interface

### Webhook Architecture
The webhook system uses a clean separation of concerns:
- **Debounce Logic**: Generic debounce strategies in `debounce.ts`
- **Notion Logic**: Pure API operations in `notion-pipeline.ts`
- **Server Logic**: HTTP handling in `server.ts`

This design focuses on Notion API integration with advanced optimizations for production use and real-time webhook processing.

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
npx ts-node src/cli/notion-nextup.ts --notion-db your-database-id --dry-run

# Test with user filter
npx ts-node src/cli/notion-nextup.ts --notion-db your-database-id --user "Alice" --dry-run

# Test webhook logic
npx ts-node src/webhook/test-server.ts

# Start webhook server
npm run start:webhook

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