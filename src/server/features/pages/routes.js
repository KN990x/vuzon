import path from 'node:path';
import express from 'express';
import { createPagesRateLimiter } from '../../platform/http/rate-limiters.js';

function sendIndexHtml(publicDir, res, next) {
  // The shell names the hashed JS/CSS. Caching it would pin a visitor to a stale bundle
  // after a release; hashed /assets/ below are the ones that may be immutable.
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(publicDir, 'index.html'), { cacheControl: false }, (err) => {
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

  // Rate-limited like the two HTML routes around it. Left unthrottled, the asset directory
  // was the only unauthenticated endpoint with no ceiling at all.
  app.use(pagesLimiter, express.static(publicDir, {
    index: false,
    setHeaders(res, filePath) {
      const relative = path.relative(publicDir, filePath);
      if (relative.split(path.sep)[0] === 'assets') {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  }));

  // SPA catch-all: any GET outside /api/* that did not match a static file.
  app.get(/^(?!\/api(?:\/|$)).*/, pagesLimiter, (_req, res, next) => {
    sendIndexHtml(publicDir, res, next);
  });
}
