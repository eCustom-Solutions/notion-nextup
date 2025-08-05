import { Client } from '@notionhq/client';

// Create the base Notion client
const notion = new Client({
  auth: process.env.NOTION_API_KEY,
});

// Throttled wrapper to enforce rate limits
class ThrottledNotionClient {
  private client: Client;
  private lastRequestTime = 0;
  private requestCount = 0;
  private readonly maxRequestsPerSecond = 3;
  private readonly maxConcurrent = 1;

  constructor(client: Client) {
    this.client = client;
  }

  private async throttle(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    const minInterval = 1000 / this.maxRequestsPerSecond; // 333ms between requests

    if (timeSinceLastRequest < minInterval) {
      await new Promise(resolve => setTimeout(resolve, minInterval - timeSinceLastRequest));
    }

    this.lastRequestTime = Date.now();
    this.requestCount++;
  }

  async databases() {
    return {
      query: async (params: any) => {
        await this.throttle();
        return this.client.databases.query(params);
      }
    };
  }

  async pages() {
    return {
      update: async (params: any) => {
        await this.throttle();
        return this.client.pages.update(params);
      }
    };
  }
}

// Export the throttled client
export default new ThrottledNotionClient(notion); 