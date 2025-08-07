# Testing Guide for Notion API Integration

## 🧪 **Testing Strategy Overview**

We have multiple testing approaches to ensure the Notion API integration works correctly:

### **1. Unit Tests (Jest)**
```bash
npm test                    # Run all tests
npm run test:watch         # Run tests in watch mode
```

### **2. Integration Tests (Manual)**
```bash
# Test Notion API integration
npx ts-node src/test-notion.ts

# Test with writeback enabled
npx ts-node src/test-notion.ts --test-writeback
```

### **3. CLI Testing**
```bash
# Dry run (safe)
npx ts-node src/cli/notion-nextup.ts --notion-db your-db-id --dry-run

# Full run (updates Notion)
npx ts-node src/cli/notion-nextup.ts --notion-db your-db-id
```

### **4. Webhook Testing**
```bash
# Test webhook logic locally (test harness)
ENABLE_DATABASE_UPDATES=false DEMO_USER_ID=1ded872b-594c-8161-addd-0002825994b5 DEMO_USER_NAME="Derious Vaughn" \
npx ts-node src/webhook/tests/test-server.ts

# Start webhook servers
npm run start:webhook   # prod
npm run start:demo      # demo
```

## 🔧 **Setup for Testing**

### **Environment Variables**
```bash
export NOTION_API_KEY="your-notion-api-key"
export NOTION_DB_ID="your-database-id"
```

### **Notion Database Requirements**
Your Notion database must have these properties:
- `Name` (Title)
- `Assignee` (People)
- `Status (IT)` (Status)
- `Estimated Days Remaining` (Number) — or `Estimated Days` as fallback
- `Queue Rank` (Number - will be updated)
- `Projected Completion` (Date - will be updated)
- `Due` (Date)
- `Priority` (Status: High/Medium/Low)
- `Parent Task` (Text)
 - `Importance Rollup` (Rollup: 1–100)
 - `Task Started Date` (Date)

## 📋 **Testing Checklist**

### **Phase 1: Environment Setup**
- [ ] Notion API key is valid
- [ ] Database ID is correct
- [ ] Database has required properties
- [ ] Database has some test tasks

### **Phase 2: Basic Functionality**
- [ ] Can load tasks from Notion
- [ ] Tasks are properly mapped to Task interface
- [ ] Excluded statuses are filtered out
- [ ] Queue ranking algorithm works
- [ ] Projected completion dates are calculated correctly (business days, using start date)

### **Phase 3: Writeback Testing**
- [ ] Dry run shows correct updates
- [ ] Actual updates work (with caution)
- [ ] Rate limiting is respected
- [ ] Error handling works

### **Phase 4: Integration Testing**
- [ ] CLI arguments work correctly
- [ ] Error messages are helpful
- [ ] Performance is acceptable
- [ ] User filtering works correctly

### **Phase 5: Webhook Testing**
- [ ] Webhook server starts correctly
- [ ] Payload parsing works
- [ ] Assignee extraction works
- [ ] Debounce strategies work correctly
- [ ] Notion API updates work via webhook

## 🚨 **Safety Measures**

### **Before Testing Writeback**
1. **Backup your data**: Export your Notion database
2. **Use dry run first**: Always test with `--dry-run`
3. **Test on small dataset**: Start with a few tasks
4. **Monitor rate limits**: Don't overwhelm the API

### **Safe Testing Commands**
```bash
# Always start with dry run
npx ts-node src/cli/notion-nextup.ts --notion-db your-db-id --dry-run

# Test with integration script
npx ts-node src/tests/notion-integration.ts

# Test webhook logic
npx ts-node src/webhook/test-server.ts

# Only after confirming everything works
npx ts-node src/cli/notion-nextup.ts --notion-db your-db-id
```

## 🔍 **Debugging Tips**

### **Common Issues**
1. **"Missing environment variables"**
   - Check that `NOTION_API_KEY` and `NOTION_DB_ID` are set

2. **"No tasks found"**
   - Verify database ID is correct
   - Check that tasks have required properties
   - Ensure tasks aren't all excluded by status

3. **"Rate limit exceeded"**
   - The client should handle this automatically
   - Check if you're making too many requests

4. **"Property mapping errors"**
   - Verify Notion property names match exactly
   - Check property types in Notion

### **Debug Commands**
```bash
# Test with verbose logging
DEBUG=* npx ts-node src/notionNextup.ts --notion-db your-db-id --dry-run

# Test individual components
npx ts-node -e "
import { loadTasks } from './src/notionAdapter';
loadTasks('your-db-id').then(tasks => console.log(tasks));
"
```

## 📊 **Expected Results**

### **Successful Test Output**
```
🧪 Testing Notion API Integration...
📊 Database ID: your-db-id

1️⃣ Loading tasks from Notion...
   ✅ Loaded 15 tasks

2️⃣ Processing tasks with queue ranking...
   ✅ Processed 15 tasks

3️⃣ Sample processed tasks:
   1. Design System Setup (Alice)
      Rank: 1, Projected Days: 5
   2. User Authentication (Alice)
      Rank: 2, Projected Days: 8
   3. Database Schema (Bob)
      Rank: 1, Projected Days: 4

🎉 All tests passed!
```

## 🎯 **Next Steps After Testing**

1. **If tests pass**: You're ready to use in production
2. **If tests fail**: Check the debugging section above
3. **For production use**: Set up proper monitoring and error handling
4. **For team use**: Document your specific database setup 