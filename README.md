# Notion NextUp

A TypeScript CLI tool that processes Notion CSV exports and creates ranked task queues with projected completion timelines.

## Features

- **CSV Processing**: Reads Notion-style CSV exports and processes them
- **Task Filtering**: Excludes ineligible tasks based on status and ownership
- **Queue Ranking**: Calculates deterministic task order per person using:
  - Parent tasks before child tasks (depth-first)
  - Earlier due dates first
  - Higher priority first (High > Medium > Low)
  - Original CSV order as tiebreaker
- **Projection Calculation**: Computes cumulative days to completion for each task
- **CSV Output**: Writes processed results with new ranking and projection columns

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

## Required CSV Columns

- `Name`: Task title
- `Task Owner`: Assignee
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

## Project Structure

```
notion-nextup/
├── src/                    # Source code
│   ├── notionNextup.ts    # Main CLI script
│   ├── core.ts            # Core business logic
│   ├── csv-parser.ts      # CSV parsing logic
│   ├── notion-api.ts      # Notion API integration (future)
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
├── package.json           # Project configuration
├── tsconfig.json          # TypeScript configuration
└── README.md             # This file
```

## Architecture

The project is designed with a modular architecture to support multiple data sources:

- **`types.ts`**: Shared type definitions and constants
- **`core.ts`**: Core business logic (queue ranking, eligibility, etc.)
- **`csv-parser.ts`**: CSV-specific parsing logic
- **`notion-api.ts`**: Future Notion API integration
- **`notionNextup.ts`**: CLI entry point that orchestrates the modules

This design allows easy swapping between CSV and Notion API data sources while keeping the core business logic unchanged.

## Notion API Setup

To use the Notion API functionality:

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
npm run dev:notion -- --notion-db your-database-id --dry-run
``` 