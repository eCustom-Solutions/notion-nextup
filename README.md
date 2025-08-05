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

- `--in`: Input CSV file path (required)
- `--out`: Output CSV file path (optional, defaults to `*_ranked.csv`)

### Example

```bash
npx ts-node src/notionNextup.ts \
    --in notion-nextup_filtered_derious_populated.csv \
    --out notion-nextup_ranked.csv
```

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

## Development

```bash
# Run in development mode with file watching
npm run dev

# Build TypeScript
npm run build
``` 