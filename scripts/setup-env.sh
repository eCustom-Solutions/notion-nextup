#!/bin/bash

# Setup script for Notion API environment variables

echo "🔧 Setting up environment variables for Notion API integration..."
echo ""

# Check if .env already exists
if [ -f ".env" ]; then
    echo "⚠️  .env file already exists!"
    echo "   Current contents:"
    cat .env
    echo ""
    read -p "Do you want to overwrite it? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Setup cancelled."
        exit 1
    fi
fi

# Copy template
cp env.template .env

echo "✅ Created .env file from template"
echo ""
echo "📝 Please edit .env with your actual values:"
echo "   1. NOTION_API_KEY - Get from https://www.notion.so/my-integrations"
echo "   2. NOTION_DB_ID - Found in your Notion database URL"
echo ""
echo "💡 Example:"
echo "   NOTION_API_KEY=secret_abc123..."
echo "   NOTION_DB_ID=abc123def456..."
echo ""
echo "🔒 .env file is already in .gitignore (won't be committed)"
echo ""
echo "🧪 After editing, test with:"
echo "   npx ts-node src/test-notion.ts" 