import path from 'node:path';
import express from 'express';
import { createPagesRateLimiter } from '../../platform/http/rate-limiters.js';

function sendIndexHtml(publicDir, res, next) {
  res.sendFile(path.join(publicDir, 'index.html'), (err) => {
    if (!err) {
      return;
    }
    // Sin src/web/dist (solo posible en desarrollo; la imagen Docker siempre lo trae).
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

  // El HTML se sirve siempre; el cliente React decide login/panel según /api/me.
  app.get(['/', '/index.html'], pagesLimiter, (_req, res, next) => {
    sendIndexHtml(publicDir, res, next);
  });

  app.use(express.static(publicDir, { index: false }));

  // Catch-all SPA: cualquier GET fuera de /api/* que no haya coincidido con un estático.
  app.get(/^(?!\/api(?:\/|$)).*/, pagesLimiter, (_req, res, next) => {
    sendIndexHtml(publicDir, res, next);
  });
}
