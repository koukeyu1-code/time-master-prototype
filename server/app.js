import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPersonalAuth, readAuthConfig } from './lib/auth.js';
import placesRouter from './routes/places.js';
import settingsRouter from './routes/settings.js';
import eventsRouter from './routes/events.js';
import planRouter from './routes/plan.js';
import syncRouter from './routes/sync.js';
import tripRouter from './routes/trip.js';

export function createApp({ authConfig = readAuthConfig(), authOptions, staticDir = fileURLToPath(new URL('../dist/', import.meta.url)) } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(createPersonalAuth(authConfig, authOptions));
  app.use(express.json({ limit: '4mb' }));
  app.use('/api/places', placesRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/events', eventsRouter);
  app.use('/api/plan', planRouter);
  app.use('/api/sync', syncRouter);
  app.use('/api/trip', tripRouter);
  app.get('/api/health', (_req, res) => res.json({ code: 0, data: { ok: true, ts: Date.now() } }));
  app.use('/api', (_req, res) => res.status(404).json({ code: 404, message: '接口不存在' }));
  app.use(express.static(staticDir, { dotfiles: 'deny', index: false, etag: false, cacheControl: false }));
  app.get('*', (req, res, next) => {
    // Only SPA routes receive index.html; missing assets must never return HTML.
    if (!['/', '/places', '/trips', '/settings'].includes(req.path) && !/^\/route\/[^/]+$/.test(req.path)) return res.sendStatus(404);
    res.sendFile(path.join(staticDir, 'index.html'), err => { if (err) next(err); });
  });
  app.use((err, _req, res, _next) => {
    console.error('[ERR]', err.message);
    const status = err.type === 'entity.too.large' ? 413 : err instanceof SyntaxError && err.status === 400 ? 400 : 500;
    res.status(status).json({ code: status, message: status === 500 ? '保存或读取失败，原有数据不会被自动重置；请检查服务端日志' : '请求格式无效或过大' });
  });
  return app;
}
