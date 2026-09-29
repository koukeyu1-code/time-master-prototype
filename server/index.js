/* ============================================================
   时间管理大师 · 后端 BFF 入口
   职责：暴露 REST API 给前端，隐藏 API Key，编排高德 + 飞书日历
   ============================================================ */
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

import placesRouter from './routes/places.js';
import settingsRouter from './routes/settings.js';
import eventsRouter from './routes/events.js';
import planRouter from './routes/plan.js';
import syncRouter from './routes/sync.js';
import tripRouter from './routes/trip.js';
import { ensureSeed } from './store/db.js';

const PORT = process.env.PORT || 8787;

const app = express();
app.use(express.json({ limit: '4mb' }));
app.use(cors());
app.use((req, _res, next) => {
  const t = new Date().toISOString();
  console.log(`[${t}] ${req.method} ${req.url}`);
  next();
});

// 路由
app.use('/api/places', placesRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/events', eventsRouter);
app.use('/api/plan', planRouter);
app.use('/api/sync', syncRouter);
app.use('/api/trip', tripRouter);

// 健康检查
app.get('/api/health', (_req, res) => {
  res.json({ code: 0, data: { ok: true, ts: Date.now() } });
});

// 全局错误兜底
app.use((err, _req, res, _next) => {
  console.error('[ERR]', err);
  res.status(500).json({ code: 500, message: err.message || 'Internal Server Error' });
});

// 启动前确保数据文件就绪（放在项目根 .run-data，避开 node --watch 对 server/ 的监视）
await ensureSeed(path.join(__dirname, '..', '.run-data'));

app.listen(PORT, () => {
  console.log(`\n  时间管理大师 BFF 启动`);
  console.log(`  ➜  Local:   http://localhost:${PORT}/`);
  console.log(`  ➜  Health:  http://localhost:${PORT}/api/health\n`);
});
