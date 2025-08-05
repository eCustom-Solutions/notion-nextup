# Examples

This directory contains sample data and output files for testing the Notion NextUp CLI tool.

## Directory Structure

```
examples/
├── sample-data/     # Input CSV files for testing
├── output/          # Generated output files
└── README.md        # This file
```

## Sample Data

### `sample-data/sample_input.csv`
A comprehensive test dataset with:
- Tasks assigned to multiple people (Alice, Bob, Charlie)
- Parent-child task relationships
- Various priority levels (High, Medium, Low)
- Due dates with proper CSV quoting
- Different status values

### `sample-data/test_input.csv`
A simplified test dataset without dates for basic functionality testing.

## Output Files

### `output/sample_output.csv`
Generated output from processing `sample_input.csv` with:
- Queue rankings for each person
- Projected days to completion
- Updated estimated days remaining

### `output/test_output.csv`
Generated output from processing `test_input.csv`.

### `output/test_input_ranked.csv`
Generated output from processing `test_input.csv` (alternative run).

## Usage Examples

```bash
# Process the sample data
npx ts-node src/notionNextup.ts --in examples/sample-data/sample_input.csv --out examples/output/my_output.csv

# Process the test data
npx ts-node src/notionNextup.ts --in examples/sample-data/test_input.csv --out examples/output/test_result.csv
```

## Expected Results

The sample data demonstrates:
- **Parent-child prioritization**: Parent tasks appear before child tasks
- **Due date sorting**: Earlier due dates get higher priority
- **Priority handling**: High > Medium > Low priority
- **Cascade calculation**: Cumulative days to completion
- **Multi-person queues**: Separate rankings per task owner 