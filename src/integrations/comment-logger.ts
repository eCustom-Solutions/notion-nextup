/* Adapter to mount notion-comment-logger under /notion-comments */
import fs from 'fs';
import path from 'path';

function resolveModule(relPathParts: string[], preferDist: boolean = true): any {
  const candidates: string[] = [];
  // Nested repo candidates (within this project)
  if (preferDist) candidates.push(path.resolve(process.cwd(), 'notion-comment-logger', 'dist', ...relPathParts));
  candidates.push(path.resolve(process.cwd(), 'notion-comment-logger', 'src', ...relPathParts));
  // External absolute repo candidates (EC2 layout)
  if (preferDist) candidates.push(path.resolve('/opt/myapp/notion-comment-logger', 'dist', ...relPathParts));
  candidates.push(path.resolve('/opt/myapp/notion-comment-logger', 'src', ...relPathParts));

  for (const base of candidates) {
    try {
      // Try as-is, then with .js extension
      if (fs.existsSync(base) || fs.existsSync(base + '.js') || fs.existsSync(base + '.cjs')) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require(fs.existsSync(base) ? base : (fs.existsSync(base + '.js') ? base + '.js' : base + '.cjs'));
      }
    } catch {}
  }
  // Last-ditch: attempt require of the first candidate (will throw a helpful error)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require(candidates[0]);
}

const { createIngress } = resolveModule(['ingress', 'server']);
const { InMemoryFifoQueue } = resolveModule(['core', 'queue']);
const { IdempotencyStore } = resolveModule(['core', 'idempotency']);
const { FileCommentLogger } = resolveModule(['adapters', 'fileCommentLogger']);
const { NotionCommentPublisher } = resolveModule(['publishers', 'notionCommentPublisher']);
const { ExecutorWorker } = resolveModule(['executor', 'worker']);

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


