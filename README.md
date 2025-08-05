# Notion NextUp

A TypeScript CLI tool that processes Notion CSV exports and creates ranked task queues with projected completion timelines.

## Features

- **CSV Processing**: Reads Notion-style CSV exports and processes them
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
npx ts-node src/notionNextup.ts --in input.csv --out output.csv
```

### Arguments

- `--in`: Input CSV file path (required for CSV mode)
- `--out`: Output CSV file path (optional, defaults to `*_ranked.csv`)
- `--notion-db`: Notion database ID (required for Notion API mode)
- `--user`: Filter tasks by assignee (default: "Derious Vaughn")
- `--dry-run`: Skip writing back to Notion (for testing)

### Example

```bash
# Process sample data (outputs to examples/output/)
npx ts-node src/notionNextup.ts \
    --in examples/sample-data/sample_input.csv \
    --out examples/output/ranked_output.csv

# Process your own data (outputs to output/ by default)
npx ts-node src/notionNextup.ts \
    --in my_notion_export.csv

# Process with custom output location
npx ts-node src/notionNextup.ts \
    --in my_notion_export.csv \
    --out /path/to/custom/location/result.csv

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

## Performance

The pipeline is optimized for production use with significant performance improvements:

- **85% faster execution** (112s → 16s for typical workloads)
- **Database-level filtering** reduces API calls by 90%
- **Surgical updates** only modify tasks that need changes
- **Production-ready** for webhook-triggered processing

See `performance-results.md` for detailed performance analysis.

## Required CSV Columns

- `Name`: Task title
- `Assignee`: Assignee
- `Status (IT)`: Task status
- `Estimated Days`: Effort estimate

## Optional CSV Columns

- `Estimated Days Remaining`: Remaining effort
- `Due`: Due date (Month DD, YYYY format)
- `Priority`: Priority level (High/Medium/Low)
- `Parent Task`: Parent task name

## Output Columns

All original columns plus:
- `queue_rank`: 1-based ranking order
- `Projected Days to Completion`: Cumulative days to finish
- `Estimated Days Remaining`: Updated to match Estimated Days

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
│   ├── csv-parser.ts      # CSV parsing logic
│   ├── notionAdapter.ts   # Notion API integration
│   ├── user-lookup.ts     # User UUID lookup utilities
│   ├── debug-tasks.ts     # Debug utilities for data inspection
│   ├── performance-test.ts # Performance testing utilities
│   └── types.ts           # Shared type definitions
├── examples/               # Sample data and outputs
│   ├── sample-data/        # Input CSV files
│   ├── output/            # Generated output files
│   └── README.md          # Examples documentation
├── output/                 # Default output directory
│   └── README.md          # Output directory documentation
├── docs/                   # Project documentation
│   ├── init_prompt.txt    # Original project specification
│   └── README.md          # Documentation index
├── performance-results.md  # Performance optimization results
├── notion-api-research.txt # Notion API research findings
├── package.json           # Project configuration
├── tsconfig.json          # TypeScript configuration
└── README.md             # This file
```

## Architecture

The project is designed with a modular architecture to support multiple data sources:

- **`types.ts`**: Shared type definitions and constants
- **`core.ts`**: Core business logic (queue ranking, eligibility, etc.)
- **`csv-parser.ts`**: CSV-specific parsing logic
- **`notionAdapter.ts`**: Notion API integration with database-level filtering
- **`user-lookup.ts`**: User UUID lookup and mapping utilities
- **`debug-tasks.ts`**: Debug utilities for data inspection
- **`performance-test.ts`**: Performance testing and benchmarking utilities
- **`notionNextup.ts`**: CLI entry point that orchestrates the modules

This design allows easy swapping between CSV and Notion API data sources while keeping the core business logic unchanged. The Notion API integration includes advanced optimizations for production use.

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

# Test with sample data
npx ts-node src/notionNextup.ts --in examples/sample-data/sample_input.csv

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