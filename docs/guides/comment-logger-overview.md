### Notion Comment Logger – Architecture and Integration Guide

This document catches up a fresh repo (or a new Cursor instance) on the "Notion Comment Logger" feature that was developed alongside Notion NextUp and then separated. It explains the purpose, runtime architecture, integration points, configuration, and deployment considerations so you can stand it up quickly in its own repository or mount it into an existing Express server.

---

### Purpose

- Ingest comment creation requests and reliably publish them as comments to Notion pages.
- Provide a pluggable “sink” so comments can be logged to a file during development, to Notion in production, or both.
- Ensure at-least-once delivery with idempotency so retries don’t duplicate comments.

---

### High-Level Architecture

- **Ingress (Express sub-app)**: Receives HTTP requests and enqueues comment jobs.
- **Queue**: In-memory FIFO queue that buffers comment jobs.
- **Idempotency store**: Prevents duplicate execution on retries; stored on disk under `var/.idem.sqlite`.
- **Worker**: Background loop that pops jobs and calls the configured sink(s).
- **Sinks**: File sink for development, Notion sink for production (or both).

Key integration module (mounted as a sub-app):

```1:33:/Users/k2duser/WebstormProjects/notion-comment-logger-wt/src/integrations/comment-logger.ts
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
```

This adapter dynamically resolves modules from a separate `notion-comment-logger` repo installed either as a nested folder or at an absolute path (see Deployment).

The queue/sinks/worker wiring and exported app:

```35:68:/Users/k2duser/WebstormProjects/notion-comment-logger-wt/src/integrations/comment-logger.ts
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
```

---

### Integration into an Existing Server (Mounting)

The comment logger is designed as a mountable sub-app. In the Notion NextUp server it’s mounted at `/notion-comments`:

```15:21:/Users/k2duser/WebstormProjects/notion-comment-logger-wt/src/webhook/http/prod-server.ts
import { commentLoggerApp } from '../../integrations/comment-logger';

const app = createBaseApp();

// Mount Notion Comment Logger sub-application under /notion-comments
app.use('/notion-comments', commentLoggerApp);
```

Important: the base server bypasses its default JSON body parser for this path so the sub-app can handle its own body parsing (useful for signature verification or raw-body needs):

```5:11:/Users/k2duser/WebstormProjects/notion-comment-logger-wt/src/webhook/http/base-server.ts
// Avoid consuming raw body for the comment-logger sub-app, which does its own JSON parsing
app.use((req, res, next) => {
  if (req.path.startsWith('/notion-comments')) {
    return next();
  }
  return (express.json({ limit: '1mb' }) as any)(req, res, next);
});
```

---

### Canonical Job Payload

Jobs pushed into the system resolve to a simple Notion comment creation call:

```46:52:/Users/k2duser/WebstormProjects/notion-comment-logger-wt/src/integrations/comment-logger.ts
const notion = {
  async createComment(req: { pageId: string; text: string }) {
    if (sink === 'file' || sink === 'both') await fileSink.createComment(req);
    if (sink === 'notion' || sink === 'both') return notionSink.createComment(req);
    return { ok: true as const };
  },
};
```

The ingress HTTP API (exposed by `createIngress`) is expected to accept a JSON payload with at least:

- `pageId` (string): The Notion page ID to comment on (no dashes OK).
- `text` (string): The comment content.

Idempotency and batching can be layered at the ingress level; the worker enforces idempotency via the `.idem.sqlite` store.

---

### Configuration

- `COMMENT_SINK`: `file` | `notion` | `both` (default: `file`).
- `NOTION_API_KEY`: Required when using the Notion sink.
- `LOG_LEVEL`: Optional, inherited from host app if mounted.
- `VAR` directory: Created automatically at runtime (`./var`), used for idempotency DB and other artifacts.

When embedded in Notion NextUp, the sub-app is mounted under `/notion-comments`. When split into its own repo, expose the same Express app returned by `createIngress(queue)` and mount it at `/` or any path you prefer.

---

### Deployment Patterns

1) **Embedded (monorepo-style)**
- Keep `notion-comment-logger` as a sibling directory.
- The adapter will resolve modules from `./notion-comment-logger/dist` first, then `./notion-comment-logger/src`.

2) **Side-by-side on EC2**
- Place the comment logger at `/opt/myapp/notion-comment-logger`.
- The adapter also probes the absolute paths: `.../dist` then `.../src`.

3) **Standalone Repo**
- Create a dedicated repo containing modules expected by the adapter:
  - `ingress/server` (exports `createIngress(queue)` Express app)
  - `core/queue` (exports `InMemoryFifoQueue`)
  - `core/idempotency` (exports `IdempotencyStore`)
  - `adapters/fileCommentLogger` (file sink)
  - `publishers/notionCommentPublisher` (Notion sink)
  - `executor/worker` (exports `ExecutorWorker` with `.tickOnce()`)
- Export TypeScript/JS outputs under `dist/` for production (or rely on `src/` in dev).

---

### Local Development

- Set `COMMENT_SINK=file` and run the host server. Calls will be logged to the file sink instead of Notion.
- Switch to `COMMENT_SINK=both` or `COMMENT_SINK=notion` with `NOTION_API_KEY` configured to test end-to-end publishing.
- The base server excludes body parsing for `/notion-comments`, so ensure the ingress app applies its own JSON parsing and any signature verification.

---

### Observability & Reliability

- **Idempotency**: Prevents duplicate comment creation on retries; backed by SQLite file under `./var`.
- **Backpressure**: The in-memory FIFO queue buffers spikes; adjust worker tick rate in `ExecutorWorker` as needed.
- **File sink**: Useful for auditioning payloads and replaying later.

---

### Security Considerations

- Protect the ingress endpoints with authentication (HMAC signature, shared secret, or network ACLs).
- Keep the `NOTION_API_KEY` in a secrets manager or `.env` not committed to source.
- Validate payload shape (`pageId`, `text`) at the ingress boundary.

---

### Migration Notes from Notion NextUp

- The main webhook server mounts the comment logger at `/notion-comments` and intentionally skips JSON parsing for that path.
- A temporary EC2 hotfix removed the mount in compiled `dist` to avoid runtime errors when the comment-logger repo was absent; ensure the new standalone repo is deployed and reachable before re-enabling the mount in production.

---

### Minimal Checklist for New Repo

- [ ] Implement modules: `ingress/server`, `core/queue`, `core/idempotency`, `adapters/fileCommentLogger`, `publishers/notionCommentPublisher`, `executor/worker`.
- [ ] Provide `createIngress(queue)` that returns an Express app with JSON parsing and any required auth.
- [ ] Support `COMMENT_SINK`, `NOTION_API_KEY` env vars.
- [ ] Include `build` script to produce `dist/` outputs.
- [ ] Document the canonical payload: `{ pageId: string, text: string }`.







