import path from 'node:path';
import express from 'express';
import { createPagesRateLimiter } from '../../platform/http/rate-limiters.js';

function sendIndexHtml(publicDir, res, next) {
  res.sendFile(path.join(publicDir, 'index.html'), (err) => {
    if (!err) {
      return;
    }
    // No src/web/dist (only possible in development; the Docker image always ships it).
    if (err.code === 'ENOENT' && !res.headersSent) {
      res.status(503).type('text/plain').send('Frontend build not found. Run "pnpm run build".');
      return;
    }
    next(err);
  });
}

export function registerPageRoutes(app, {
  publicDir,
  pagesLimiter = createPagesRateLimiter(),
} = {}) {
  app.get('/healthz', (_req, res) => {
    res.json({ ok: true });
  });

  // The HTML is always served; the React client picks login/panel based on /api/me.
  app.get(['/', '/index.html'], pagesLimiter, (_req, res, next) => {
    sendIndexHtml(publicDir, res, next);
  });

  app.use(express.static(publicDir, { index: false }));

  // SPA catch-all: any GET outside /api/* that did not match a static file.
  app.get(/^(?!\/api(?:\/|$)).*/, pagesLimiter, (_req, res, next) => {
    sendIndexHtml(publicDir, res, next);
  });
}
