/* POST /api/sync —— 手动触发全量同步（飞书日历 + 天气缓存刷新） */
import { Router } from 'express';
import { db } from '../store/db.js';
import { ok, fail } from '../lib/utils.js';
import { syncAgenda } from '../services/feishu.js';
import { getWeather } from '../services/amap.js';

const router = Router();

router.post('/', async (_req, res) => {
  try {
    const events = await syncAgenda();
    let weather = null;
    try { weather = await getWeather(); } catch (e) { console.warn('[sync] weather failed:', e.message); }

    const settings = await db.getSettings();
    res.json(ok({
      synced: events.length,
      at: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      eventsCount: events.length,
      weatherCity: weather?.city || null,
      lastSyncAt: settings?.sync?.lastSyncAt || null,
    }));
  } catch (e) {
    res.status(502).json(fail(502, e.message));
  }
});

export default router;
