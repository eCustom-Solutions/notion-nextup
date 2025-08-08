import { Client } from '@notionhq/client';
import { TokenBucket } from '../utils/token-bucket';

// Create the base Notion client
const notion = new Client({
  auth: process.env.NOTION_API_KEY,
});

// Throttled wrapper to enforce rate limits
class ThrottledNotionClient {
  private client: Client;
  private readonly bucket = new TokenBucket(3, 3); // capacity 3, refill 3/sec

  constructor(client: Client) {
    this.client = client;
  }

  private async throttle(): Promise<void> {
    await this.bucket.acquire();
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