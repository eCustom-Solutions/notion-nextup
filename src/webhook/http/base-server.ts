import express from 'express';

export function createBaseApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // Health endpoint
  app.get('/healthz', (_, res) => res.send('ok'));
  return app;
}
