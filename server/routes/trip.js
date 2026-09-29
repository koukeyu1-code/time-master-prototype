/* 行程规划 REST：青甘大环线摩托自驾 */
import { Router } from 'express';
import { buildTrip, getTrip as loadTrip, recalcDay, getNearbyAttractions, updateDayStops } from '../services/tripBuilder.js';
import { TEMPLATES } from '../data/qingganPois.mjs';

const router = Router();
const ok = (res, data) => res.json({ code: 0, data });
const fail = (res, msg, code = 500) => res.status(code).json({ code, error: msg });

router.get('/', async (_req, res) => {
  try {
    const trip = await loadTrip();
    if (!trip) return fail(res, '行程尚未生成，先 POST /api/trip 创建', 404);
    ok(res, trip);
  } catch (e) { fail(res, e.message); }
});

router.post('/', async (req, res) => {
  try {
    const { startDate, preset, bikeProfile } = req.body || {};
    const trip = await buildTrip({ startDate, preset, bikeProfile });
    ok(res, trip);
  } catch (e) { fail(res, e.message); }
});

router.get('/days/:day', async (req, res) => {
  try {
    const trip = await loadTrip();
    if (!trip) return fail(res, '行程尚未生成', 404);
    const n = Number(req.params.day);
    const day = trip.days.find(d => d.day === n);
    if (!day) return fail(res, `第 ${n} 天不存在`, 404);
    ok(res, day);
  } catch (e) { fail(res, e.message); }
});

router.post('/days/:day/recalc', async (req, res) => {
  try {
    const trip = await recalcDay(req.params.day);
    if (!trip) return fail(res, '行程或日期未找到', 404);
    ok(res, trip);
  } catch (e) { fail(res, e.message); }
});

/* 返回某日 50km 半径内的景点候选（高德 POI + 内置），附「是否已在 stops」标记 */
router.get('/days/:day/pois', async (req, res) => {
  try {
    const radius = Number(req.query.radius) || 50000;
    const list = await getNearbyAttractions(req.params.day, radius);
    ok(res, { radius, count: list.length, items: list });
  } catch (e) { fail(res, e.message); }
});

/* 覆盖某日 stops → 重算 driving/weather/风险 → 返回新 trip。body: { stops: [keyStr|{key,name,lng,lat,...}] } */
router.put('/days/:day/stops', async (req, res) => {
  try {
    const { stops } = req.body || {};
    if (!Array.isArray(stops)) return fail(res, 'body.stops 需要数组', 400);
    const trip = await updateDayStops(req.params.day, stops);
    ok(res, trip);
  } catch (e) { fail(res, e.message, 400); }
});

/* 返回可用模板列表（从 qingganPois.TEMPLATES 统一读，新增模板无需改此处） */
router.get('/templates', (_req, res) => {
  ok(res, TEMPLATES);
});

export default router;
