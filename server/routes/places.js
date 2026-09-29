/* GET /api/places —— 常去地点列表
   POST /api/places —— 新增地点（body: {alias, address, location?}）
   PUT /api/places/:id —— 更新地点
   DELETE /api/places/:id —— 删除地点
   GET /api/places/search?keywords=xxx&city=北京 —— 高德 POI 搜索 */
import { Router } from 'express';
import { db } from '../store/db.js';
import { ok, fail, genId } from '../lib/utils.js';
import { geocode, poiSearch } from '../services/amap.js';

const router = Router();

router.get('/', async (_req, res) => {
  const list = await db.getPlaces();
  res.json(ok(list));
});

router.post('/', async (req, res) => {
  const { alias, address, location, mapX, mapY } = req.body || {};
  if (!alias) return res.status(400).json(fail(400, 'alias 必填'));

  let loc = location;
  if (!loc && address) {
    try {
      const g = await geocode(address);
      if (g) loc = { lng: g.lng, lat: g.lat };
    } catch (e) {
      // 地理编码失败不阻塞，留空
    }
  }
  const place = {
    id: genId('p'),
    alias,
    address: address || '',
    location: loc || null,
    mapX: mapX || 100,
    mapY: mapY || 100,
    hits: 0,
  };
  await db.upsertPlace(place);
  res.status(201).json(ok(place));
});

router.put('/:id', async (req, res) => {
  const place = { ...req.body, id: req.params.id };
  await db.upsertPlace(place);
  res.json(ok(place));
});

router.delete('/:id', async (req, res) => {
  const list = await db.getPlaces();
  const next = list.filter((p) => p.id !== req.params.id);
  await db.savePlaces(next);
  res.json(ok({ deleted: req.params.id }));
});

router.get('/search', async (req, res) => {
  const { keywords, city } = req.query;
  if (!keywords) return res.status(400).json(fail(400, 'keywords 必填'));
  try {
    const list = await poiSearch(keywords, city || '北京');
    res.json(ok(list));
  } catch (e) {
    res.status(502).json(fail(502, e.message));
  }
});

export default router;
