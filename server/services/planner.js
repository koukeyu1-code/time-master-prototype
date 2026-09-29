/* ============================================================
   规划器：核心算法
   输入：events + places + weather + settings
   输出：legs（每个相邻物理事件之间的通勤段）
   职责：
   - 解析事件地点（别名库命中 → 否则地理编码 → 否则 pending）
   - 调用高德规划公交/驾车/步行/骑行四模式路线
   - 四因子评分（time/cost/park/scene），按 settings.weights 加权
   - 应用天气降权（雨雪天 bike/moto * 0.5）
   - 应用封车季（moto 在 11-3 月移除）
   - 生成 departAt/arriveAt/reminder
   - 检测时间冲突（间隙 < 通勤+缓冲）
   ============================================================ */
import { db } from '../store/db.js';
import { planAllModes, geocode, poiSearch } from './amap.js';
import { genId, hmToMin, minToHm, addMin, diffMin, todayISODate } from '../lib/utils.js';

const SCENE_WEIGHT = 50; // 场景因子权重（设计 §5.3）
const CAR_COST_PER_KM = 0.8; // 油费 + 折旧 元/km
const CAR_PARK_PER_HR = 15; // 停车费 元/小时

/* ---------- 主入口 ---------- */
export async function buildTodayPlan(events, places, weather, settings) {
  const date = todayISODate();
  const home = settings?.profile?.home || 'p-home';
  const homePlace = places.find((p) => p.id === home);

  // 仅保留当天有起止时间的物理事件（排除 online 仅开会，但保留无 location 的 pending 事件）
  const todayEvents = (events || [])
    .filter((e) => e.start && e.end)
    .sort((a, b) => hmToMin(a.start) - hmToMin(b.start));

  // 解析每个事件的地点：尝试别名库命中 → 否则用 locationRaw 触发地理编码
  const resolved = await Promise.all(todayEvents.map((e) => resolveEventLocation(e, places)));
  const withLoc = resolved.filter((e) => e.placeId); // 仅物理事件参与配对
  const pendingEvents = resolved.filter((e) => !e.placeId && e.status !== 'online');

  // 配对生成 legs
  const legs = [];
  for (let i = 0; i < withLoc.length; i++) {
    const cur = withLoc[i];
    const prev = i === 0 ? null : withLoc[i - 1];
    const fromPlace = prev ? places.find((p) => p.id === prev.placeId) : homePlace;
    const toPlace = places.find((p) => p.id === cur.placeId);
    if (!fromPlace || !toPlace) continue;
    legs.push(await buildLeg({ from: fromPlace, to: toPlace, event: cur, prevEvent: prev, settings, weather, date }));
  }

  // 收尾：最后事件 → 家
  if (withLoc.length > 0 && homePlace) {
    const last = withLoc[withLoc.length - 1];
    const fromPlace = places.find((p) => p.id === last.placeId);
    if (fromPlace && fromPlace.id !== homePlace.id) {
      legs.push(await buildLeg({
        from: fromPlace,
        to: homePlace,
        event: null, // 回家段无对应事件
        prevEvent: last,
        settings,
        weather,
        date,
        isReturn: true,
      }));
    }
  }

  return {
    date,
    generatedAt: new Date().toTimeString().slice(0, 5),
    legs,
    pendingEvents,
  };
}

/* ---------- 解析事件地点 ---------- */
async function resolveEventLocation(event, places) {
  // 已绑定 placeId
  if (event.placeId) {
    const p = places.find((x) => x.id === event.placeId);
    if (p) return { ...event, placeId: p.id, status: 'ok' };
  }
  // online 事件
  if (event.status === 'online' || event.meetingUrl) {
    return { ...event, placeId: null, status: 'online' };
  }
  // 别名库命中
  const raw = (event.locationRaw || '').trim();
  if (!raw) return { ...event, placeId: null, status: 'pending' };
  const hit = places.find((p) => p.alias === raw || p.address?.includes(raw) || raw.includes(p.alias));
  if (hit) {
    return { ...event, placeId: hit.id, locationRaw: hit.alias, status: 'ok' };
  }
  // 未命中 → 留 pending（不做实时地理编码，等用户在 places 页确认后绑定）
  return { ...event, placeId: null, status: 'pending' };
}

/* ---------- 单段 leg 构建 ---------- */
async function buildLeg({ from, to, event, prevEvent, settings, weather, date, isReturn = false }) {
  const legId = genId('leg');

  // 调高德规划
  let routes = null;
  let routeError = null;
  try {
    routes = await planAllModes(from.location, to.location);
  } catch (e) {
    routeError = e.message;
  }

  if (!routes || routeError) {
    return {
      id: legId,
      eventId: event?.id || null,
      from: from.id,
      to: to.id,
      departAt: null,
      arriveAt: null,
      durationMin: null,
      mode: null,
      modeLabel: '路线获取失败',
      summary: routeError || '高德路线规划失败',
      pending: true,
      transitSteps: [],
      scores: {},
      alternatives: [],
      reminder: null,
      error: routeError,
    };
  }

  // 计算每模式评分
  const isRainy = weather && /雨|雪/.test(weather.cond || '');
  const inMotoStorage = isInMotoStorageSeason(settings);
  const scores = {};
  for (const mode of ['transit', 'car', 'moto', 'bike', 'walk']) {
    if (mode === 'moto' && inMotoStorage) continue; // 封车季移除
    const r = routes[mode];
    if (!r) continue;
    scores[mode] = scoreMode({ mode, route: r, toPlace: to, fromPlace: from, isRainy, weather, settings });
  }

  // 选最优模式
  const ranked = Object.entries(scores).sort((a, b) => (b[1].total || 0) - (a[1].total || 0));
  const bestMode = ranked[0]?.[0] || 'transit';
  const bestRoute = routes[bestMode] || routes.transit || Object.values(routes).find(Boolean);
  const bestScore = scores[bestMode] || {};

  // 计算出发/到达时间
  const arriveAt = event ? event.start : (prevEvent ? addMin(prevEvent.end, 5) : null);
  const durationMin = bestRoute?.durationMin || 30;
  const departAt = arriveAt ? addMin(arriveAt, -durationMin - (bestScore.bufferMin || 0)) : null;

  // 提醒
  const reminderLead = settings?.reminderLeadMin || 15;
  const reminder = departAt
    ? {
        triggerAt: addMin(departAt, -reminderLead),
        channel: pickReminderChannel({ event, settings, isReturn }),
        channelLabel: 'Bot 卡片',
        status: 'scheduled',
        statusLabel: '待触发',
      }
    : null;

  // 冲突检测
  let alert = null;
  if (prevEvent && event && !isReturn) {
    const gapMin = diffMin(prevEvent.end, event.start);
    const needMin = durationMin + (bestScore.bufferMin || 0);
    if (needMin > gapMin) {
      const lateMin = needMin - gapMin;
      alert = {
        kind: 'conflict',
        level: lateMin > 20 ? 'danger' : 'warning',
        title: '通勤时间不足',
        message: `上一场 ${prevEvent.end} 结束，下一场 ${event.start} 开始，间隙仅 ${gapMin} 分钟；${bestScore.modeLabel || bestMode}需 ${durationMin} 分钟${bestScore.bufferMin ? ` + 缓冲 ${bestScore.bufferMin} 分钟` : ''}，按当前安排将迟到约 ${lateMin} 分钟。`,
        suggestions: buildConflictSuggestions({ lateMin, routes, gapMin, settings }),
        resolved: false,
      };
    }
  }

  return {
    id: legId,
    eventId: event?.id || null,
    from: from.id,
    to: to.id,
    departAt,
    arriveAt,
    durationMin,
    mode: bestMode,
    modeLabel: modeLabel(bestMode),
    summary: summarize(bestMode, bestRoute),
    transitSteps: bestRoute?.steps || [],
    scores,
    alternatives: ranked.slice(1, 3).map(([m]) => m),
    reminder,
    alert,
  };
}

/* ---------- 评分 ---------- */
function scoreMode({ mode, route, toPlace, fromPlace, isRainy, weather, settings }) {
  const durationMin = route.durationMin || 60;
  const costYuan = estimateCost(mode, route, toPlace);
  const needsParking = mode === 'car' || mode === 'moto';

  // time 因子：越快越高，capped 5-100
  const timeScore = Math.max(5, Math.round(100 - durationMin));

  // cost 因子：越便宜越高
  const costScore = Math.max(5, Math.round(100 - costYuan * 4));

  // park 因子：步行/公交 100；摩托/骑行 88；汽车看地点类型
  let parkScore = 100;
  if (mode === 'bike') parkScore = 90;
  else if (mode === 'moto') parkScore = 88;
  else if (mode === 'car') parkScore = estimateParking(toPlace);

  // scene 因子：天气影响
  let sceneScore = 80;
  if (isRainy) {
    if (mode === 'walk') sceneScore = 20;
    else if (mode === 'bike') sceneScore = 35;
    else if (mode === 'moto') sceneScore = 50;
    else if (mode === 'car') sceneScore = 60;
    else if (mode === 'transit') sceneScore = 85;
  } else {
    if (mode === 'walk') sceneScore = 25;
    else if (mode === 'bike') sceneScore = 60;
    else if (mode === 'moto') sceneScore = 75;
    else if (mode === 'car') sceneScore = 70;
    else if (mode === 'transit') sceneScore = 80;
  }

  // 缓冲时间：医院/机场类加缓冲
  let bufferMin = settings?.buffer?.defaultMin || 10;
  const byType = settings?.buffer?.byPlaceType || [];
  for (const bt of byType) {
    const t = bt.type || '';
    if (t.includes('医') && /医|齿科|诊所|医院/.test(toPlace.alias || '')) bufferMin = Math.max(bufferMin, bt.min);
    if (t.includes('机场') && /机场|车站|航站/.test(toPlace.alias || '')) bufferMin = Math.max(bufferMin, bt.min);
  }

  // 加权
  const w = settings?.weights || { time: 70, cost: 40, parking: 60 };
  const totalWeight = (w.time || 0) + (w.cost || 0) + (w.parking || 0) + SCENE_WEIGHT;
  let total = Math.round(
    (timeScore * (w.time || 0) + costScore * (w.cost || 0) + parkScore * (w.parking || 0) + sceneScore * SCENE_WEIGHT) / totalWeight
  );

  // 天气降权：bike/moto 雨雪天 *0.5
  let penalty = null;
  if (isRainy && (mode === 'bike' || mode === 'moto')) {
    total = Math.round(total * 0.5);
    penalty = `${weather.cond} · 权重 −50%`;
  }

  // 汽车停车难 penalty
  if (mode === 'car' && parkScore < 50) {
    penalty = penalty ? `${penalty} · 停车不便` : '停车不便';
  }

  return {
    time: timeScore,
    cost: costScore,
    park: parkScore,
    scene: sceneScore,
    total,
    bufferMin,
    penalty,
    modeLabel: modeLabel(mode),
    costYuan,
    durationMin,
  };
}

function estimateCost(mode, route, toPlace) {
  if (mode === 'walk') return 0;
  if (mode === 'bike') return 0;
  if (mode === 'transit') return Number(route.costYuan) || 5;
  if (mode === 'moto') return Math.round((route.distanceKm || 5) * 0.3 * 10) / 10;
  if (mode === 'car') {
    const drive = (route.distanceKm || 10) * CAR_COST_PER_KM;
    const park = (CAR_PARK_PER_HR) * Math.max(1, Math.ceil((route.durationMin || 30) / 60));
    return Math.round((drive + park) * 10) / 10;
  }
  return 0;
}

function estimateParking(toPlace) {
  const a = (toPlace?.alias || '') + (toPlace?.address || '');
  if (/医院|齿科|诊所/.test(a)) return 35;
  if (/机场|车站|航站/.test(a)) return 30;
  if (/国贸|CBD|望京|陆家嘴|金融街/.test(a)) return 25;
  if (/商场|购物中心|百货/.test(a)) return 45;
  if (/家|住宅|小区/.test(a)) return 90;
  return 60;
}

function isInMotoStorageSeason(settings) {
  const s = settings?.vehicles?.moto?.storageSeason;
  if (!s?.enabled) return false;
  const m = new Date().getMonth() + 1;
  return m >= s.from || m <= s.to;
}

function modeLabel(mode) {
  return ({
    car: '私家车',
    moto: '摩托车',
    transit: '公交地铁',
    bike: '骑行',
    walk: '步行',
    rail: '城际高铁',
  })[mode] || mode;
}

function summarize(mode, route) {
  if (!route) return '';
  if (mode === 'transit') return `${route.steps?.filter((s) => s.kind === 'subway').map((s) => s.line).filter(Boolean).join(' → ') || '公交'} · ${route.costYuan || 0} 元`;
  if (mode === 'car') return `驾车 ${route.distanceKm} 公里 · 约 ${route.durationMin} 分钟`;
  if (mode === 'moto') return `摩托 ${route.distanceKm} 公里 · 约 ${route.durationMin} 分钟`;
  if (mode === 'bike') return `骑行 ${route.distanceKm} 公里 · 约 ${route.durationMin} 分钟`;
  if (mode === 'walk') return `步行 ${route.distanceKm} 公里 · 约 ${route.durationMin} 分钟`;
  return '';
}

function pickReminderChannel({ event, settings, isReturn }) {
  if (isReturn) return 'bot';
  const t = event?.type || 'meeting';
  if (t === 'visit' || t === 'personal') {
    if (settings?.notify?.smsUrgent) return 'sms';
  }
  return 'bot';
}

function buildConflictSuggestions({ lateMin, routes, gapMin, settings }) {
  const sugg = [];
  // 1. 找比当前最快的备选模式
  const ranked = Object.entries(routes)
    .filter(([_, r]) => r)
    .sort((a, b) => (a[1].durationMin || 999) - (b[1].durationMin || 999));
  if (ranked.length > 0) {
    const [m, r] = ranked[0];
    sugg.push({
      id: genId('s'),
      text: `改用 ${modeLabel(m)}：约 ${r.durationMin} 分钟，可省 ${Math.max(0, lateMin)} 分钟`,
    });
  }
  // 2. 提前出发
  sugg.push({
    id: genId('s'),
    text: `提前 ${Math.ceil(lateMin / 5) * 5 + 5} 分钟出发以避免迟到`,
  });
  // 3. 协商改约
  sugg.push({
    id: genId('s'),
    text: '与对方协商改约时间，或申请线上会议',
  });
  return sugg;
}

/* ---------- 差旅多日：复用单日规划，按天聚合 ---------- */
export async function buildTripPlan(days, places, settings) {
  const out = [];
  for (const day of days) {
    // day 应提供 events 数组
    const weather = null; // 差旅天气暂不接（需要异地 adcode）
    const plan = await buildTodayPlan(day.events || [], places, weather, settings);
    out.push({
      date: day.date,
      weekday: day.weekday,
      city: day.city,
      legs: plan.legs,
      pendingEvents: plan.pendingEvents,
    });
  }
  return { days: out };
}
