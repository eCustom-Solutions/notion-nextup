import { loadTasks, writeBack } from '../notionAdapter';
import { Task, ProcessedTask } from '../types';

// Mock the notion client
jest.mock('../services/notion_client', () => ({
  __esModule: true,
  default: {
    databases: jest.fn(() => ({
      query: jest.fn()
    })),
    pages: jest.fn(() => ({
      update: jest.fn()
    }))
  }
}));

describe('notionAdapter', () => {
  describe('loadTasks', () => {
    it('should load tasks from Notion database', async () => {
      const mockNotionResponse = {
        results: [
          {
            id: 'page-1',
            properties: {
              'Name': { title: [{ plain_text: 'Test Task' }] },
              'Task Owner': { people: [{ name: 'Alice' }] },
              'Status (IT)': { status: { name: 'In Progress' } },
              'Estimated Days': { number: 5 },
              'Estimated Days Remaining': { number: 3 },
              'Due': { date: { start: '2024-12-15' } },
              'Priority': { select: { name: 'High' } },
              'Parent Task': { relation: [] }
            }
          }
        ],
        has_more: false,
        next_cursor: null
      };

      const notionClient = require('../services/notion_client').default;
      notionClient.databases().query.mockResolvedValue(mockNotionResponse);

      const tasks = await loadTasks('test-db-id');

      expect(tasks).toHaveLength(1);
      expect(tasks[0]).toEqual({
        pageId: 'page-1',
        Name: 'Test Task',
        'Task Owner': 'Alice',
        'Status (IT)': 'In Progress',
        'Estimated Days': 5,
        'Estimated Days Remaining': 3,
        'Due': 'December 15, 2024',
        'Priority': 'High',
        'Parent Task': undefined
      });
    });

    it('should skip tasks with excluded statuses', async () => {
      const mockNotionResponse = {
        results: [
          {
            id: 'page-1',
            properties: {
              'Name': { title: [{ plain_text: 'Done Task' }] },
              'Task Owner': { people: [{ name: 'Alice' }] },
              'Status (IT)': { status: { name: 'Done' } },
              'Estimated Days': { number: 5 },
              'Estimated Days Remaining': { number: 3 },
              'Due': { date: { start: '2024-12-15' } },
              'Priority': { select: { name: 'High' } },
              'Parent Task': { relation: [] }
            }
          }
        ],
        has_more: false,
        next_cursor: null
      };

      const notionClient = require('../services/notion_client').default;
      notionClient.databases().query.mockResolvedValue(mockNotionResponse);

      const tasks = await loadTasks('test-db-id');

      expect(tasks).toHaveLength(0);
    });
  });

  describe('writeBack', () => {
    it('should update tasks in Notion database', async () => {
      const processedTasks: ProcessedTask[] = [
        {
          pageId: 'page-1',
          Name: 'Test Task',
          'Task Owner': 'Alice',
          'Status (IT)': 'In Progress',
          'Estimated Days': 5,
          'Estimated Days Remaining': 5,
          'Due': 'December 15, 2024',
          'Priority': 'High',
          'Parent Task': undefined,
          queue_rank: 1,
          'Projected Days to Completion': 5
        }
      ];

      const notionClient = require('../services/notion_client').default;
      notionClient.pages().update.mockResolvedValue({});

      await writeBack(processedTasks, 'test-db-id');

      expect(notionClient.pages().update).toHaveBeenCalledWith({
        page_id: 'page-1',
        properties: {
          'queue_rank': { number: 1 },
          'Projected Days to Completion': { number: 5 },
          'Estimated Days Remaining': { number: 5 }
        }
      });
    });

    it('should skip tasks without pageId', async () => {
      const processedTasks: ProcessedTask[] = [
        {
          pageId: undefined,
          Name: 'Test Task',
          'Task Owner': 'Alice',
          'Status (IT)': 'In Progress',
          'Estimated Days': 5,
          'Estimated Days Remaining': 5,
          'Due': 'December 15, 2024',
          'Priority': 'High',
          'Parent Task': undefined,
          queue_rank: 1,
          'Projected Days to Completion': 5
        }
      ];

      const notionClient = require('../services/notion_client').default;
      notionClient.pages().update.mockResolvedValue({});

      await writeBack(processedTasks, 'test-db-id');

      expect(notionClient.pages().update).not.toHaveBeenCalled();
    });
  });
}); 