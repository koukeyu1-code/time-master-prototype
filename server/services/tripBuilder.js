/* ============================================================
   青甘大环线 摩托自驾行程生成器
   ============================================================ */
import { db } from '../store/db.js';
import { planDriving } from './amap.js';
import { getWeather, poiSearch } from './amap.js';
import { CLASSIC_7DAY, RELAXED_10DAY, XN2DH_5DAY, POIS, getPoi, registerDynamicPoi } from '../data/qingganPois.mjs';
import { placeAround } from './amap.js';
import { searchCtripNearby } from '../data/ctripProvider.mjs';

/* 根据 preset key 返回模板；默认宽松 10 日（摩托推荐节奏） */
const PRESET_MAP = { classic7: CLASSIC_7DAY, relaxed10: RELAXED_10DAY, xining2dunhuang: XN2DH_5DAY };
export function resolveTemplate(preset) {
  return PRESET_MAP[preset] || RELAXED_10DAY;
}
/* 宽松版预设：疲劳阈值稍微提高（允许单日 500km 再告警） */
const THRESHOLDS_FOR = (preset) => {
  if (preset === 'relaxed10') {
    return {
      MAX_DAILY_KM: 500,
      FATIGUE_EVERY_HOURS: 3.5,
      FUEL_RANGE_KM: 260,
      ALTITUDE_MILD: 3000,
      ALTITUDE_SEVERE: 3800,
      RAIN_WIND_RISK_BIKE: 50,
    };
  }
  return THRESHOLDS;
};

/* 摩托车安全阈值 */
const THRESHOLDS = {
  MAX_DAILY_KM: 420,         // 单日里程上限（超过触发疲劳警告）
  FATIGUE_EVERY_HOURS: 3,    // 每 3 小时连续驾驶 → 强制休息 30 分钟
  FUEL_RANGE_KM: 240,        // 摩托车油箱续航（半箱油安全阈值）
  ALTITUDE_MILD: 3000,       // 轻度高反海拔
  ALTITUDE_SEVERE: 3800,     // 严重高反海拔
  RAIN_WIND_RISK_BIKE: 50,   // 雨天/风力 ≥4 级 → 摩托车安全系数扣分
};

/* API 节流 + 错误兜底 */
const sleep = ms => new Promise(r => setTimeout(r, ms));
const AMAP_CALL_INTERVAL = 550; // 每次高德调用间隔 ≥ 550ms，避开免费版 3QPS 限制
let _lastCallAt = 0;
async function throttle() {
  const now = Date.now();
  const wait = AMAP_CALL_INTERVAL - (now - _lastCallAt);
  if (wait > 0) await sleep(wait);
  _lastCallAt = Date.now();
}

/* 用 Haversine 公式估算直线距离（当 API 失败或限流时的兜底），系数 1.25 模拟山路曲折 */
function estimateDriving(from, to) {
  const R = 6371;
  const lat1 = from.lat * Math.PI / 180, lat2 = to.lat * Math.PI / 180;
  const dlng = (to.lng - from.lng) * Math.PI / 180;
  const dlat = (to.lat - from.lat) * Math.PI / 180;
  const a = Math.sin(dlat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dlng/2)**2;
  const c = 2 * Math.asin(Math.min(1, Math.sqrt(a)));
  const straightKm = R * c;
  const roadKm = straightKm * 1.25;
  const avgKmh = roadKm < 50 ? 55 : (roadKm < 200 ? 65 : 75); // 国道/高速混合平均速度
  return {
    distanceKm: Math.round(roadKm * 10) / 10,
    durationMin: Math.max(10, Math.round(roadKm / avgKmh * 60)),
    steps: [{ kind: 'car', text: `根据经纬度估算 · 约 ${Math.round(roadKm * 10) / 10} km`, min: Math.round(roadKm / avgKmh * 60) }],
    estimated: true,
  };
}

/* 带节流 + 重试 + 兜底的 planDriving */
async function safePlanDriving(from, to) {
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await throttle();
      const plan = await planDriving(from, to);
      if (plan?.distanceKm) return plan;
    } catch (e) {
      lastErr = e;
      // QPS 超限 → 多等 1.5 秒后重试
      if (/CUQPS|QPS|LIMIT|over quota|BUSY/i.test(e.message || '')) {
        await sleep(1500 + attempt * 500);
        continue;
      }
      break; // 非限流错误直接 fallback
    }
  }
  console.warn(`[trip][warn] planDriving fallback (${from.name}→${to.name}): ${lastErr?.message || 'empty result'}`);
  return estimateDriving(from, to);
}

async function safeGetWeather(adcode) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await throttle();
      const w = await getWeather(adcode);
      if (w) return w;
    } catch (e) {
      if (/CUQPS|QPS|LIMIT/i.test(e.message || '')) { await sleep(1200); continue; }
      return null;
    }
  }
  return null;
}

/* ============== 工具函数 ============== */
/* 注意：一律用本地时区格式化，避免 toISOString() 把中国时区 00:00 推到 UTC 的昨天 */
function pad(n) { return n < 10 ? '0' + n : '' + n; }
function ymd(date) { const d = new Date(date); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }

function altitudeRisk(altM) {
  if (altM >= THRESHOLDS.ALTITUDE_SEVERE) return { level: 'severe', label: '严重高反风险', text: `海拔 ${altM}m：建议停车停留至少 2 小时逐步适应，禁止剧烈运动` };
  if (altM >= THRESHOLDS.ALTITUDE_MILD) return { level: 'mild', label: '轻度高反风险', text: `海拔 ${altM}m：注意补水和慢行` };
  return null;
}

/* ============== 核心生成器 ============== */
/**
 * 生成/重算行程
 * @param {object} opts
 * @param {string} opts.startDate - 'YYYY-MM-DD' 第一天日期
 * @param {string} [opts.preset='classic7'] - 模板名称（目前仅 classic7）
 * @param {object} [opts.bikeProfile] - 自定义摩托车参数（油耗L/100km、油箱L、etc）
 */
/* 按 trip 解析某 day 的 stops key 列表：customStops 覆盖 > template 原始 stops */
function resolveStopsForDay(trip, dayNumber) {
  const preset = trip.preset || 'relaxed10';
  const template = resolveTemplate(preset);
  const tpl = template[Number(dayNumber) - 1];
  const custom = trip.customStops && trip.customStops[String(dayNumber)];
  if (Array.isArray(custom) && custom.length >= 2) return custom;
  return tpl ? [...tpl.stops] : [];
}

/* 按 stopsKey 数组（如 ['xining','kumbum','qinghaihu_erlangjian'] 或 动态 amap:xxx）重新计算某 day；
   stops 也支持对象 {key,name,lng,lat,...}，这样新 POI 可以直接从前端传过来自动注册。 */
export async function buildOneDay(stopsArr, { preset, dayNumber, date }) {
  const TH = THRESHOLDS_FOR(preset);
  /* 先把传入 stops 规范化：如果是对象则动态登记，最后剩下 key 数组 */
  const keys = stopsArr.map((s) => {
    if (typeof s === 'string') return s;
    if (s && typeof s === 'object') {
      if (!s.key) return null;
      if (!getPoi(s.key)) registerDynamicPoi({ ...s });
      return s.key;
    }
    return null;
  }).filter(Boolean);

  const today = new Date(date + 'T00:00:00');
  const startCity = getPoi(keys[0]);
  const endCity = getPoi(keys[keys.length - 1]);
  const tpl = resolveTemplate(preset)[Number(dayNumber) - 1] || {};
  const dayObj = {
    day: Number(dayNumber),
    title: tpl.title || `Day ${dayNumber} · 自定义`,
    theme: tpl.theme || '动态调整',
    date: ymd(today),
    startCity, endCity,
    legs: [],
    stops: [],
    alerts: [],
    totalKm: 0,
    totalDriveMin: 0,
    totalStayMin: 0,
    altitudePeak: 0,
    weather: null,
  };

  for (let j = 0; j < keys.length - 1; j++) {
    const from = getPoi(keys[j]);
    const to = getPoi(keys[j + 1]);
    if (!from || !to) continue;
    if (from.type === 'scenic') {
      const stay = from.stayMin || 120;
      dayObj.stops.push({ type: 'scenic', poi: from, stayMin: stay, note: from.note || '' });
      dayObj.totalStayMin += stay;
    } else if ((from.type === 'town' || from.type === 'city') && j === 0) {
      dayObj.stops.push({ type: 'anchor', poi: from, label: '住宿出发' });
    }
    const plan = await safePlanDriving(
      { lng: from.lng, lat: from.lat, name: from.name },
      { lng: to.lng, lat: to.lat, name: to.name },
    );
    const leg = { from, to, distanceKm: plan?.distanceKm || 0, durationMin: plan?.durationMin || 60, steps: plan?.steps || [], estimated: !!plan?.estimated };
    dayObj.legs.push(leg);
    dayObj.totalKm += leg.distanceKm;
    dayObj.totalDriveMin += leg.durationMin;
    dayObj.altitudePeak = Math.max(dayObj.altitudePeak, from.altitude || 0, to.altitude || 0);
    if (leg.distanceKm >= TH.FUEL_RANGE_KM) {
      dayObj.stops.push({ type: 'fuel', afterLeg: j, label: `建议加油（距前站 ${Math.round(leg.distanceKm)}km）`, note: '请在途经城镇搜索中石化/中石油加油站，勿等油表黄灯。' });
    }
  }
  const lastStop = getPoi(keys[keys.length - 1]);
  if (lastStop?.type === 'scenic') {
    dayObj.stops.push({ type: 'scenic', poi: lastStop, stayMin: lastStop.stayMin || 120, note: lastStop.note || '' });
    dayObj.totalStayMin += lastStop.stayMin || 120;
  } else if (lastStop) {
    dayObj.stops.push({ type: 'anchor', poi: lastStop, label: '抵达住宿' });
  }
  if (lastStop?.adcode) dayObj.weather = await safeGetWeather(lastStop.adcode);

  if (dayObj.totalKm > TH.MAX_DAILY_KM) dayObj.alerts.push({ level: 'warn', kind: 'fatigue', title: '单日里程过大', text: `全天 ${Math.round(dayObj.totalKm)}km 超过 ${TH.MAX_DAILY_KM}km 阈值，建议拆成两天或删减中途景点。` });
  if (dayObj.totalDriveMin / 60 > TH.FATIGUE_EVERY_HOURS) {
    if (!dayObj.stops.some(s => s.type === 'fuel')) dayObj.alerts.push({ level: 'info', kind: 'rest', title: '驾驶休息提醒', text: `全天驾驶约 ${Math.round(dayObj.totalDriveMin / 60)} 小时，建议每 ${TH.FATIGUE_EVERY_HOURS} 小时停车休息一次。` });
  }
  const altR = altitudeRisk(dayObj.altitudePeak);
  if (altR) dayObj.alerts.push({ level: altR.level, kind: 'altitude', title: altR.label, text: altR.text });
  if (dayObj.weather) {
    const rainy = /雨|雪|沙尘/.test(dayObj.weather.cond || '');
    const strongWind = /[5-6]级|≥4级/.test(dayObj.weather.wind || '');
    if (rainy || strongWind) dayObj.alerts.push({ level: 'severe', kind: 'weather', title: '骑行安全警告', text: `目的地天气预报：${dayObj.weather.cond}，${dayObj.weather.wind}。摩托车稳定性受较大影响，建议降低车速或改为室内景点。` });
  }
  return dayObj;
}

/* 根据最新 days 重算 summary */
function recalcTripSummary(trip) {
  const s = trip.days.reduce((acc, d) => {
    acc.totalKm += d.totalKm;
    acc.totalDriveMin += d.totalDriveMin;
    acc.totalStayMin += d.totalStayMin;
    acc.highestAlt = Math.max(acc.highestAlt, d.altitudePeak);
    return acc;
  }, { totalKm: 0, totalDriveMin: 0, totalStayMin: 0, highestAlt: 0 });
  trip.summary = {
    totalKm: Math.round(s.totalKm),
    drivingHours: Math.round(s.totalDriveMin / 60 * 10) / 10,
    stayHours: Math.round(s.totalStayMin / 60 * 10) / 10,
    highestAlt: s.highestAlt,
    averageDailyKm: Math.round(s.totalKm / Math.max(1, trip.days.length)),
  };
  trip.updatedAt = new Date().toISOString();
  return trip;
}

/* 覆盖某个 day 的 stops → 重算该 day → 写回 trip.summary → saveTrip → 返回 trip */
export async function updateDayStops(dayNumber, stopsArr) {
  const trip = await db.getTrip();
  if (!trip) throw new Error('行程尚未生成，先 POST /api/trip 创建');
  const n = Number(dayNumber);
  if (n < 1 || n > trip.totalDays) throw new Error(`day 越界（1..${trip.totalDays}）`);
  if (!Array.isArray(stopsArr) || stopsArr.length < 2) throw new Error('stops 需要至少 2 个节点（住宿+目的）');
  // 先登记 stops 里的动态 POI（对象项）
  stopsArr.forEach((s) => { if (s && typeof s === 'object' && s.key && !getPoi(s.key)) registerDynamicPoi({ ...s }); });
  const idx = trip.days.findIndex(d => d.day === n);
  trip.customStops = { ...(trip.customStops || {}), [String(n)]: stopsArr.map(s => typeof s === 'string' ? s : s.key) };
  const dateStr = (trip.days[idx] || { date: trip.startDate }).date;
  trip.days[idx] = await buildOneDay(stopsArr, { preset: trip.preset, dayNumber: n, date: dateStr });
  recalcTripSummary(trip);
  await db.saveTrip(trip);
  return trip;
}

/* 返回某日附近的推荐景点：(1) 内置 POIS 同 adcode 区域的景区 (2) 高德 placeAround */
export async function getNearbyAttractions(dayNumber, radius = 50000) {
  const trip = await db.getTrip();
  if (!trip) throw new Error('行程尚未生成');
  const n = Number(dayNumber);
  const keys = resolveStopsForDay(trip, n);
  const pois = keys.map(getPoi).filter(Boolean);
  if (!pois.length) return [];

  // 计算所有 stops 的中心点（加权：起点终点各 x2）
  const pts = [];
  pois.forEach((p, i) => {
    const w = (i === 0 || i === pois.length - 1) ? 2 : 1;
    for (let k = 0; k < w; k++) pts.push(p);
  });
  const avgLng = pts.reduce((s, p) => s + p.lng, 0) / pts.length;
  const avgLat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;

  // (2) 高德 placeAround，做 3 次节流避免 QPS
  const around = [];
  try { around.push(...await placeAround({ lng: avgLng, lat: avgLat, radius, offset: 20 })); }
  catch (e) { /* 忽略限流或失败，只返回内置 POIS */ }
  try { around.push(...await placeAround({ lng: pois[0].lng, lat: pois[0].lat, radius: Math.round(radius / 2), offset: 10 })); }
  catch (e) { /* ignore */ }
  try { around.push(...await placeAround({ lng: pois[pois.length - 1].lng, lat: pois[pois.length - 1].lat, radius: Math.round(radius / 2), offset: 10 })); }
  catch (e) { /* ignore */ }

  // (3) 携程门票：中心点 + 起点/终点 并行（无 Key 时走 mock，数据带 ctrip_mock 标识）
  const ctrip = [];
  try {
    const c1 = searchCtripNearby({ lng: avgLng, lat: avgLat, radius, limit: 12 });
    const c2 = searchCtripNearby({ lng: pois[0].lng, lat: pois[0].lat, radius: Math.round(radius / 2), limit: 8 });
    const c3 = searchCtripNearby({ lng: pois[pois.length - 1].lng, lat: pois[pois.length - 1].lat, radius: Math.round(radius / 2), limit: 8 });
    const allC = await Promise.all([c1, c2, c3]);
    ctrip.push(...allC.flat());
  } catch (e) { /* ignore */ }

  // 动态登记高德/携程结果，前端勾选时 key 可直接用
  around.forEach((a) => { if (!getPoi(a.key)) registerDynamicPoi({ ...a, note: a.address, altitude: 0 }); });
  ctrip.forEach((a) => {
    if (!getPoi(a.key)) registerDynamicPoi({
      key: a.key, name: a.name, lng: a.lng, lat: a.lat, altitude: 0,
      stayMin: 120, note: a.note || a.address, type: 'scenic',
      address: a.address, rating: a.rating, photos: a.photos, source: a.source,
    });
  });

  // (1) 内置 POIS：所有 type=scenic 且到中心距离 < radius*1.2 的项
  const kmPerLng = Math.cos(avgLat * Math.PI / 180) * 111;
  const kmPerLat = 111;
  const within = Object.values(POIS).filter(p => p.type === 'scenic');
  const builtin = within.map((p) => {
    const dx = (p.lng - avgLng) * kmPerLng, dy = (p.lat - avgLat) * kmPerLat;
    const distanceKm = Math.sqrt(dx * dx + dy * dy);
    return { ...p, distanceKm: Number(distanceKm.toFixed(1)), source: 'built-in' };
  }).filter(p => p.distanceKm <= radius / 1000 * 1.3).sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 12);

  // 合并 + 去重（按 name 模糊 + 经纬度 2 位）
  const merged = new Map();
  const pushItem = (p) => {
    if (!p?.name) return;
    const normName = p.name.replace(/[（(].*?[）)]/g, '').trim();
    const k = `${normName.slice(0, 6)}:${(p.lat || 0).toFixed(2)}:${(p.lng || 0).toFixed(2)}`;
    if (merged.has(k)) {
      const ex = merged.get(k);
      // 合并：保留更高评分、有照片、有价格、真实来源优先于 mock
      if (!ex.rating && p.rating) ex.rating = p.rating;
      if ((ex.rating || 0) < (p.rating || 0)) ex.rating = p.rating;
      if ((!ex.photos || !ex.photos.length) && p.photos?.length) ex.photos = p.photos;
      if ((ex.distanceKm || 0) > (p.distanceKm || 0)) ex.distanceKm = p.distanceKm;
      if (!ex.price && p.price) { ex.price = p.price; ex.ticketType = p.ticketType || ''; }
      if (p.source === 'ctrip' && ex.source !== 'ctrip') ex.source = 'ctrip';
      if (!ex.note && p.note) ex.note = p.note;
    } else {
      merged.set(k, { ...p, inStops: false });
    }
  };
  builtin.forEach(pushItem);
  around.forEach((a) => pushItem({
    key: a.key, name: a.name, lng: a.lng, lat: a.lat, rating: a.rating,
    distanceKm: a.distanceKm, note: a.note || a.address, address: a.address,
    photos: a.photos || [], source: a.source || 'amap', type: 'scenic',
  }));
  ctrip.forEach((c) => pushItem({
    key: c.key, name: c.name, lng: c.lng, lat: c.lat, rating: c.rating,
    distanceKm: c.distanceKm, price: c.price, ticketType: c.ticketType || '',
    note: c.note || c.address, address: c.address, photos: c.photos || [], source: c.source, type: 'scenic',
  }));

  // 标记是否已经在 stops 里
  const currentSet = new Set(keys);
  merged.forEach(v => { if (currentSet.has(v.key)) v.inStops = true; });
  const list = [...merged.values()].sort((a, b) => {
    // 排序：已选优先 → 评分高优先 → 距离近优先 → 价格存在优先
    if (!!a.inStops !== !!b.inStops) return a.inStops ? -1 : 1;
    if ((a.rating || 0) !== (b.rating || 0)) return (b.rating || 0) - (a.rating || 0);
    if ((a.distanceKm || 0) !== (b.distanceKm || 0)) return (a.distanceKm || 0) - (b.distanceKm || 0);
    if (!!a.price !== !!b.price) return a.price ? -1 : 1;
    return 0;
  });
  return list.slice(0, 30);
}

export async function buildTrip(opts = {}) {
  const preset = opts.preset || 'relaxed10';
  const startDate = opts.startDate || '2026-09-26'; /* 宽松版默认按用户请求：9月26日 */
  const template = resolveTemplate(preset);
  const startD = new Date(startDate + 'T00:00:00');

  /* 1. 按 template.length 逐天调用 buildOneDay */
  const days = [];
  for (let i = 0; i < template.length; i++) {
    const stopsKeys = [...template[i].stops];
    const dateStr = ymd(addDays(startD, i));
    const dayObj = await buildOneDay(stopsKeys, { preset, dayNumber: i + 1, date: dateStr });
    days.push(dayObj);
  }

  /* 3. 汇总统计 */
  const summary = days.reduce((acc, d) => {
    acc.totalKm += d.totalKm;
    acc.totalDriveMin += d.totalDriveMin;
    acc.totalStayMin += d.totalStayMin;
    acc.highestAlt = Math.max(acc.highestAlt, d.altitudePeak);
    return acc;
  }, { totalKm: 0, totalDriveMin: 0, totalStayMin: 0, highestAlt: 0 });

  const tripNameByPreset = {
    classic7: '青甘大环线 · 摩托自驾 7 日',
    relaxed10: '青甘大环线 · 摩托宽松 10 日（嘉峪关前慢节奏）',
    xining2dunhuang: '西宁→敦煌 · 摩托单向 5 日（单程）',
  };
  const trip = {
    id: `qinggan_${preset}_${startDate}`,
    name: tripNameByPreset[preset] || `青甘大环线 · 摩托 ${template.length} 日`,
    preset,
    startDate,
    endDate: ymd(addDays(startD, template.length - 1)),
    totalDays: template.length,
    oneway: preset === 'xining2dunhuang',
    customStops: {}, /* 前端 PUT stops/:day 覆盖会写到这里 */
    summary: {
      totalKm: Math.round(summary.totalKm),
      drivingHours: Math.round(summary.totalDriveMin / 60 * 10) / 10,
      stayHours: Math.round(summary.totalStayMin / 60 * 10) / 10,
      highestAlt: summary.highestAlt,
      averageDailyKm: Math.round(summary.totalKm / template.length),
    },
    days,
    mode: 'motorcycle',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await db.saveTrip(trip);
  return trip;
}

/** 取存储中的行程（若无返回 null）*/
export async function getTrip() {
  return db.getTrip();
}

/** 重算某一天：按当前 stops 覆盖 + weather + 风险。若用户未自定义 stops 则用 template 原值 */
export async function recalcDay(dayNumber) {
  const trip = await db.getTrip();
  if (!trip) return null;
  const n = Number(dayNumber);
  const idx = trip.days.findIndex(d => d.day === n);
  if (idx < 0) return null;

  const stopsArr = resolveStopsForDay(trip, n);
  if (stopsArr.length < 2) return null;
  const today = new Date(trip.startDate + 'T00:00:00');
  today.setDate(today.getDate() + idx);
  trip.days[idx] = await buildOneDay(stopsArr, { preset: trip.preset, dayNumber: n, date: ymd(today) });
  recalcTripSummary(trip);
  await db.saveTrip(trip);
  return trip;
}

/* 沿某条 driving 路线查加油站（仅当有需要时单独调用，当前用阈值规则简化） */
export async function findGasNear(poi, radiusKm = 20) {
  if (!poi?.lng || !poi?.lat) return [];
  // 高德没有「按点查加油站」的 POI radius 参数，简单用 city 搜索筛选。
  const hits = await poiSearch('中石化 中石油', String(poi.name).slice(0, 2));
  return hits.slice(0, 5);
}
