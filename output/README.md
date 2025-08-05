# Output Directory

This directory is the default location for generated output files when running the Notion NextUp CLI tool.

## Usage

When you run the CLI without specifying an `--out` parameter, files will be automatically saved here with the naming pattern:

```
output/{input_filename}_ranked.csv
```

## Examples

```bash
# This will create output/my_data_ranked.csv
npx ts-node src/notionNextup.ts --in my_data.csv

# This will create output/notion_export_ranked.csv  
npx ts-node src/notionNextup.ts --in notion_export.csv
```

## File Tracking

- The `output/` directory is tracked in git
- Generated `.csv` files are ignored by git (see .gitignore)
- This allows the directory to exist for new users while keeping generated files out of version control

## Manual Output Location

You can still specify a custom output location:

```bash
# Save to a custom location
npx ts-node src/notionNextup.ts --in my_data.csv --out /path/to/custom/location/result.csv
``` 