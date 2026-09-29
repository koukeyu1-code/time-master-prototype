/* GET /api/events?status=pending —— 待补全地点的事件队列
   POST /api/events/:id/location —— 补全事件地点
   GET /api/events —— 全部事件（默认从缓存读，可选 ?refresh=1 拉飞书） */
import { Router } from 'express';
import { db } from '../store/db.js';
import { ok, fail, genId } from '../lib/utils.js';
import { syncAgenda, healthCheck } from '../services/feishu.js';
import { poiSearch } from '../services/amap.js';

const router = Router();

router.get('/', async (req, res) => {
  let events = await db.getEvents();
  if (req.query.refresh === '1') {
    try {
      events = await syncAgenda();
    } catch (e) {
      return res.status(502).json(fail(502, `同步飞书日历失败: ${e.message}`));
    }
  }
  res.json(ok(events));
});

router.get('/pending', async (_req, res) => {
  const events = await db.getEvents();
  const pending = events.filter((e) => e.status === 'pending' && !e.placeId);
  // 为每个 pending 事件附高德 POI 候选
  const withCandidates = await Promise.all(pending.map(async (e) => {
    let candidates = [];
    if (e.locationRaw) {
      try {
        candidates = (await poiSearch(e.locationRaw)) || [];
      } catch { /* 静默 */ }
    }
    return {
      eventId: e.id,
      title: e.title,
      time: `${e.start}–${e.end}`,
      guess: candidates[0] ? { ...candidates[0], confidence: 50 } : null,
      candidates: candidates.slice(0, 5),
    };
  }));
  res.json(ok(withCandidates));
});

router.post('/:id/location', async (req, res) => {
  const eventId = req.params.id;
  const place = req.body || {};
  if (!place.alias && !place.id) return res.status(400).json(fail(400, 'place.alias 或 place.id 必填'));

  // 取或创建 place
  let placeRow = null;
  if (place.id) placeRow = await db.getPlaceById(place.id);
  if (!placeRow && place.alias) placeRow = await db.findPlaceByAlias(place.alias);
  if (!placeRow) {
    // 新建一个 place
    placeRow = {
      id: genId('p'),
      alias: place.alias,
      address: place.address || '',
      location: place.location || null,
      mapX: 100, mapY: 100, hits: 0,
    };
    await db.upsertPlace(placeRow);
  }

  // 更新事件
  const events = await db.getEvents();
  const ev = events.find((e) => e.id === eventId);
  if (!ev) return res.status(404).json(fail(404, '事件不存在'));
  ev.placeId = placeRow.id;
  ev.locationRaw = placeRow.alias;
  ev.status = 'ok';
  await db.saveEvents(events);

  res.json(ok({ eventId, place: placeRow }));
});

router.get('/health', async (_req, res) => {
  const r = await healthCheck();
  res.json(ok(r));
});

export default router;
