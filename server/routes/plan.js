/* GET /api/plan/today —— 今日出行方案（不存在则实时生成）
   GET /api/plan/legs/:legId —— 取单段通勤详情
   POST /api/plan/recalc —— 实时路况重算（body: {legId}）
   GET /api/plan/trip —— 差旅多日规划（占位，MVP 暂未接） */
import { Router } from 'express';
import { db } from '../store/db.js';
import { ok, fail } from '../lib/utils.js';
import { buildTodayPlan } from '../services/planner.js';
import { getWeather, planAllModes } from '../services/amap.js';
import { syncAgenda } from '../services/feishu.js';
import { genId } from '../lib/utils.js';

const router = Router();

router.get('/today', async (req, res) => {
  try {
    // 拉飞书日程（默认从缓存读，refresh=1 强制刷新）
    let events = await db.getEvents();
    if (req.query.refresh === '1' || events.length === 0) {
      try { events = await syncAgenda(); } catch (e) { console.warn('[plan/today] sync agenda failed:', e.message); }
    }

    const places = await db.getPlaces();
    const settings = await db.getSettings();

    // 拉天气
    let weather = null;
    try { weather = await getWeather(); } catch (e) { console.warn('[plan/today] weather failed:', e.message); }

    // 规划
    const plan = await buildTodayPlan(events, places, weather, settings);

    res.json(ok({ plan, weather, events }));
  } catch (e) {
    console.error('[plan/today]', e);
    res.status(502).json(fail(502, e.message));
  }
});

/* 单段详情：重新规划一遍，按 id 切片 */
router.get('/legs/:legId', async (req, res) => {
  // 简化实现：重算今日 plan，找到对应 leg
  try {
    const events = await db.getEvents();
    const places = await db.getPlaces();
    const settings = await db.getSettings();
    let weather = null;
    try { weather = await getWeather(); } catch {}
    const plan = await buildTodayPlan(events, places, weather, settings);
    const leg = plan.legs.find((l) => l.id === req.params.legId);
    if (!leg) return res.status(404).json(fail(404, 'leg 不存在，可能需要重新生成'));
    res.json(ok(leg));
  } catch (e) {
    res.status(502).json(fail(502, e.message));
  }
});

/* 实时路况重算 */
router.post('/recalc', async (req, res) => {
  const { legId } = req.body || {};
  if (!legId) return res.status(400).json(fail(400, 'legId 必填'));

  try {
    const events = await db.getEvents();
    const places = await db.getPlaces();
    const settings = await db.getSettings();
    let weather = null;
    try { weather = await getWeather(); } catch {}
    const plan = await buildTodayPlan(events, places, weather, settings);
    const leg = plan.legs.find((l) => l.id === legId);
    if (!leg) return res.status(404).json(fail(404, 'leg 不存在'));

    // 找到该 leg 的 from/to 重新调一次高德（绕过缓存的方式：可加 ?nocache=1）
    const from = places.find((p) => p.id === leg.from);
    const to = places.find((p) => p.id === leg.to);
    let delta = 0;
    let note = '实时路况重算完成：通勤时长未变';
    if (from?.location && to?.location) {
      const routes = await planAllModes(from.location, to.location);
      const r = routes[leg.mode];
      if (r) {
        delta = (r.durationMin || 0) - (leg.durationMin || 0);
        if (delta !== 0) {
          note = `实时路况重算完成：${delta > 0 ? '延迟 +' : '提前 -'}${Math.abs(delta)} 分钟${delta > 0 ? '（建议提前出发）' : ''}`;
        }
      }
    }

    res.json(ok({ legId, trafficDeltaMin: delta, note, recalculatedAt: new Date().toISOString() }));
  } catch (e) {
    res.status(502).json(fail(502, e.message));
  }
});

/* 差旅多日：MVP 占位，前端可继续用现有展示结构 */
router.get('/trip', async (_req, res) => {
  // 真实实现需要多日日程，飞书日历一次拉多日即可
  // 这里返回空骨架，前端提示用户先在 settings 中配置差旅日期范围
  res.json(ok({
    id: genId('trip'),
    title: '差旅规划（待配置）',
    range: null,
    days: [],
    note: '请在 settings 中配置差旅日期范围（tripDateRange），后端按日聚合飞书日程',
  }));
});

export default router;
