import express from 'express';

export function createBaseApp() {
  const app = express();
  // Avoid consuming raw body for the comment-logger sub-app, which does its own JSON parsing
  app.use((req, res, next) => {
    if (req.path.startsWith('/notion-comments')) {
      return next();
    }
    return (express.json({ limit: '1mb' }) as any)(req, res, next);
  });

  // Health endpoint
  app.get('/healthz', (_, res) => res.send('ok'));
  return app;
}
