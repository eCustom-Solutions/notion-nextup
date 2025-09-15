/* Adapter to mount notion-comment-logger under /notion-comments */
import fs from 'fs';
import path from 'path';

// Prefer TS sources; ts-node will transpile them at runtime
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createIngress } = require('../../notion-comment-logger/src/ingress/server');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { InMemoryFifoQueue } = require('../../notion-comment-logger/src/core/queue');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { IdempotencyStore } = require('../../notion-comment-logger/src/core/idempotency');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { FileCommentLogger } = require('../../notion-comment-logger/src/adapters/fileCommentLogger');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { NotionCommentPublisher } = require('../../notion-comment-logger/src/publishers/notionCommentPublisher');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ExecutorWorker } = require('../../notion-comment-logger/src/executor/worker');

// Ensure var directory exists for runtime artifacts
const varDir = path.join(process.cwd(), 'var');
if (!fs.existsSync(varDir)) fs.mkdirSync(varDir, { recursive: true });

const queue = new InMemoryFifoQueue();
const idempotency = new IdempotencyStore(path.join('var', '.idem.sqlite'));

const sink = process.env.COMMENT_SINK ?? 'file'; // file | notion | both
const fileSink = new FileCommentLogger();
const notionSink = new NotionCommentPublisher();

const notion = {
  async createComment(req: { pageId: string; text: string }) {
    if (sink === 'file' || sink === 'both') await fileSink.createComment(req);
    if (sink === 'notion' || sink === 'both') return notionSink.createComment(req);
    return { ok: true as const };
  },
};

const worker = new ExecutorWorker({ queue, idempotency, notion });

async function runWorkerLoop(): Promise<void> {
  // non-blocking background loop
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await worker.tickOnce();
    await new Promise(r => setTimeout(r, 200));
  }
}

runWorkerLoop().catch(() => {});

export const commentLoggerApp = createIngress(queue);


