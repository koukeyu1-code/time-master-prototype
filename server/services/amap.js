/* ============================================================
   高德开放平台 API 封装
   - 地理编码 address → lng,lat
   - POI 搜索（地点补全候选）
   - 路线规划：公交 / 驾车 / 步行 / 骑行（电动车）
   - 天气查询（实况 + 分小时）
   全部走 GET，返回统一规范化对象。
   ============================================================ */
import { db } from '../store/db.js';

/* 注意：不要在模块顶部缓存 process.env —— ESM import 提升会先于 dotenv.config() 执行 */
function getEnv() {
  return {
    KEY: process.env.AMAP_KEY || '',
    BASE_V3: process.env.AMAP_BASE || 'https://restapi.amap.com/v3',
    BASE_V4: 'https://restapi.amap.com/v4',
    DEFAULT_CITY: process.env.DEFAULT_CITY_ADCODE || '110000',
    WEATHER_TTL: Number(process.env.WEATHER_CACHE_MIN || 60),
    ROUTE_TTL: Number(process.env.ROUTE_CACHE_MIN || 15),
  };
}

function assertKey() {
  const { KEY } = getEnv();
  if (!KEY || KEY === 'your_amap_key_here') {
    throw new Error('AMAP_KEY 未配置：请在 server/.env 填入高德 Web 服务 Key');
  }
}

/* 成功判定：v3 接口有 status/info 字段，v4 接口无 status，有 data 即视为 OK；
   且 v4 错误时会走 errcode/errmsg。统一兼容。 */
async function getJson(url, { apiVersion = 'v3' } = {}) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`高德请求失败 ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (apiVersion === 'v4') {
    if (json.errcode && json.errcode !== 0) {
      throw new Error(`高德(v4)业务错误: ${json.errmsg || JSON.stringify(json)}`);
    }
    return json;
  }
  // v3: status=1 成功, 其余失败
  if (json.status !== '1') {
    throw new Error(`高德(v3)业务错误: ${json.info || JSON.stringify(json)}`);
  }
  return json;
}

/* ---------- 地理编码 ---------- */
export async function geocode(address, city = '') {
  assertKey();
  const { KEY, BASE_V3 } = getEnv();
  const q = new URLSearchParams({ key: KEY, address, city });
  const j = await getJson(`${BASE_V3}/geocode/geo?${q}`);
  const g = j.geocodes?.[0];
  if (!g) return null;
  const [lng, lat] = (g.location || '').split(',').map(Number);
  return { lng, lat, formatted: g.formatted_address, level: g.level };
}

/* ---------- POI 关键字搜索（地点补全候选） ---------- */
export async function poiSearch(keywords, city = '北京') {
  assertKey();
  const { KEY, BASE_V3 } = getEnv();
  const q = new URLSearchParams({ key: KEY, keywords, city, citylimit: 'true', offset: '10', page: '1', extensions: 'all' });
  const j = await getJson(`${BASE_V3}/place/text?${q}`);
  return (j.pois || []).map((p) => {
    const [lng, lat] = (p.location || '').split(',').map(Number);
    return {
      alias: p.name,
      address: p.address || '',
      distance: p.distance ? `距当前位置 ${p.distance}m` : '',
      location: { lng, lat },
      tel: p.tel || '',
    };
  });
}

/* ---------- 周边景点搜索（名胜古迹 / 公园 / 博物馆） ---------- */
/* types: 11 风景名胜 = 110100 公园广场 | 110200 风景名胜 | 110300 国家公园 | 1412 文物古迹 | 110400 动植物园 | 110500 水族馆 | 110600 动物园 | 1401 博物馆 */
const ATTRACTION_TYPES = '110100|110200|110300|110400|110500|110600|140100|141200';
export async function placeAround({ lng, lat, radius = 50000, types = ATTRACTION_TYPES, offset = 25, page = 1 }) {
  assertKey();
  if (!lng || !lat) return [];
  const { KEY, BASE_V3 } = getEnv();
  const cacheKey = `around:${lng.toFixed(4)},${lat.toFixed(4)},${radius},${types},${offset},${page}`;
  const CACHE_TTL = 7 * 24 * 3600 * 1000;
  const cached = await db.getCached('pois', cacheKey, CACHE_TTL);
  if (cached) return cached;
  const q = new URLSearchParams({
    key: KEY,
    location: `${lng},${lat}`,
    radius: String(radius),
    types,
    offset: String(offset),
    page: String(page),
    extensions: 'all',
    sortrule: 'weight',
  });
  const j = await getJson(`${BASE_V3}/place/around?${q}`);
  const list = (j.pois || []).map((p) => {
    const [lng2, lat2] = (p.location || '').split(',').map(Number);
    const biz = p.biz_ext || {};
    const rating = Number(biz.rating || 0) || 0;
    const cost = Number(biz.cost || 0) || 0;
    const photos = (p.photos || []).slice(0, 2).map(ph => ph.url);
    return {
      key: `amap:${p.id}`,
      name: p.name,
      address: p.address || '',
      lng: lng2, lat: lat2,
      distanceM: Number(p.distance || 0) || 0,
      type: 'scenic',
      subtype: p.type || '',
      rating,
      ticketCost: cost,
      tel: p.tel || '',
      photos,
      source: 'amap',
      stayMin: rating >= 4.8 ? 240 : rating >= 4.5 ? 180 : 120,
      adcode: p.adcode || '',
    };
  });
  await db.setCached('pois', cacheKey, list);
  return list;
}

/* ---------- 天气（按 adcode） ---------- */
export async function getWeather(cityAdcode = null) {
  assertKey();
  const { DEFAULT_CITY, WEATHER_TTL, KEY, BASE_V3 } = getEnv();
  const code = cityAdcode || DEFAULT_CITY;
  const cached = await db.getCached('weather', code, WEATHER_TTL);
  if (cached) return cached;

  const q = new URLSearchParams({ key: KEY, city: code, extensions: 'all' });
  const j = await getJson(`${BASE_V3}/weather/weatherInfo?${q}`);
  const w = j.forecasts?.[0];
  if (!w) return null;

  const now = w.casts?.[0];
  if (!now) return null;

  const out = {
    city: w.city,
    date: now.date,
    weekday: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date(now.date).getDay()],
    cond: now.dayweather || now.nightweather,
    tempNow: Number(now.daytemp),
    tempRange: `${Math.min(now.daytemp, now.nighttemp)}~${Math.max(now.daytemp, now.nighttemp)}°`,
    rainProb: Number(now.daypower.replace(/\D/g, '')) || 0,
    wind: `${now.daywind || '无风向'} ${now.daypower || ''}级`,
    aqi: null, // 实况扩展需要 air API，留空
    updatedAt: new Date().toTimeString().slice(0, 5),
    impact: weatherImpactText(now.dayweather),
    hours: [], // 高德 v3 不提供分小时；可后续接 v5.0
  };
  await db.setCached('weather', cityAdcode, out);
  return out;
}

function weatherImpactText(cond) {
  if (!cond) return '';
  if (/雨|雪/.test(cond)) return '天气因子生效：骑行、摩托车评分权重 −50%';
  return '';
}

/* ---------- 路线规划 ---------- */
/*
  注意：高德不同版本的接口端点不同
  - v3：geocode / place / weather / driving / walking / transit/integrated
  - v4：bicycling（骑行）
*/
async function planRouteV3(mode, origin, destination, extra = {}) {
  assertKey();
  const { KEY, BASE_V3, ROUTE_TTL } = getEnv();
  const o = `${origin.lng},${origin.lat}`;
  const d = `${destination.lng},${destination.lat}`;
  const cacheKey = `${o}|${d}|${mode}`;
  const cached = await db.getCached('routes', cacheKey, ROUTE_TTL);
  if (cached) return cached;

  const q = new URLSearchParams({ key: KEY, origin: o, destination: d, ...extra });
  const url = `${BASE_V3}/direction/${mode}?${q}`;
  const j = await getJson(url, { apiVersion: 'v3' });

  const out = parseRouteV3(mode, j);
  await db.setCached('routes', cacheKey, out);
  return out;
}

async function planBicyclingV4(origin, destination) {
  assertKey();
  const { KEY, BASE_V4, ROUTE_TTL } = getEnv();
  const o = `${origin.lng},${origin.lat}`;
  const d = `${destination.lng},${destination.lat}`;
  const cacheKey = `${o}|${d}|bicycling`;
  const cached = await db.getCached('routes', cacheKey, ROUTE_TTL);
  if (cached) return cached;

  const q = new URLSearchParams({ key: KEY, origin: o, destination: d });
  const url = `${BASE_V4}/direction/bicycling?${q}`;
  const j = await getJson(url, { apiVersion: 'v4' });

  const p = j.data?.paths?.[0];
  if (!p) return null;
  const out = {
    durationMin: Math.round(Number(p.duration) / 60),
    distanceKm: Math.round(Number(p.distance) / 1000 * 10) / 10,
    costYuan: 0,
    steps: (p.steps || []).map((s) => ({
      kind: 'bike',
      text: s.instruction || `骑行 ${s.distance} 米`,
      min: Math.round(Number(s.duration) / 60),
    })),
  };
  await db.setCached('routes', cacheKey, out);
  return out;
}

/* 解析 v3 路线返回 → 规范化对象 */
function parseRouteV3(mode, j) {
  // mode: driving | walking | transit/integrated
  if (mode.startsWith('transit')) {
    const t = j.route?.transits?.[0];
    if (!t) return null;
    const steps = [];
    for (const seg of t.segments || []) {
      // 步行段
      if (seg.walking) {
        const walkDist = Number(seg.walking.distance || 0);
        if (walkDist > 0) {
          steps.push({ kind: 'walk', text: `步行约 ${Math.round(walkDist)} 米`, min: Math.round(walkDist / 80) });
        }
      }
      // 公交段：bus 子对象里有 buslines
      if (seg.bus?.buslines?.length) {
        for (const b of seg.bus.buslines) {
          steps.push({
            kind: 'subway',
            line: (b.name || '').split('(')[0],
            text: `${b.departure_stop?.name || ''} → ${b.arrival_stop?.name || ''}（${b.via_stops?.length || 0} 站）`,
            min: Math.round(Number(b.duration) / 60) || 0,
          });
        }
      }
      // 地铁段：高德 transit/integrated 里地铁也在 bus.buslines，这里无需单独处理
      // 换乘：如果当前段有 entrance 且前一段有 exit 则代表换乘
      if (seg.entrance || seg.exit) {
        // 只在明确有换乘入口/出口标记且前面有交通段时加换乘步骤
        if (steps.length && steps[steps.length - 1].kind !== 'transfer') {
          steps.push({ kind: 'transfer', text: '站内换乘', min: 3 });
        }
      }
    }
    return {
      durationMin: Math.round(Number(t.duration) / 60),
      distanceKm: Math.round(Number(t.distance) / 1000 * 10) / 10,
      costYuan: Number(t.cost) || 0,
      steps,
    };
  }

  if (mode === 'driving' || mode === 'walking') {
    const p = j.route?.paths?.[0];
    if (!p) return null;
    if (mode === 'driving') {
      return {
        durationMin: Math.round(Number(p.duration) / 60),
        distanceKm: Math.round(Number(p.distance) / 1000 * 10) / 10,
        costYuan: 0,
        steps: (p.steps || []).map((s) => ({
          kind: 'car',
          text: s.instruction || '',
          min: Math.round(Number(s.duration) / 60),
        })),
      };
    }
    // walking
    return {
      durationMin: Math.round(Number(p.duration) / 60),
      distanceKm: Math.round(Number(p.distance) / 1000 * 10) / 10,
      costYuan: 0,
      steps: [{ kind: 'walk', text: `步行 ${Math.round(Number(p.distance) / 1000 * 10) / 10} 公里`, min: Math.round(Number(p.duration) / 60) }],
    };
  }
  return null;
}

export async function planTransit(o, d, city = null) {
  const c = city || getEnv().DEFAULT_CITY;
  return planRouteV3('transit/integrated', o, d, { city: c });
}

export async function planDriving(o, d) {
  return planRouteV3('driving', o, d);
}

export async function planWalking(o, d) {
  return planRouteV3('walking', o, d);
}

export async function planRiding(o, d) {
  return planBicyclingV4(o, d);
}

/* 一次拿齐四种模式 */
export async function planAllModes(o, d, city = null) {
  const [transit, driving, walking, riding] = await Promise.allSettled([
    planTransit(o, d, city),
    planDriving(o, d),
    planWalking(o, d),
    planRiding(o, d),
  ]);
  return {
    transit: transit.status === 'fulfilled' ? transit.value : null,
    car: driving.status === 'fulfilled' ? driving.value : null,
    walk: walking.status === 'fulfilled' ? walking.value : null,
    bike: riding.status === 'fulfilled' ? riding.value : null,
    moto: driving.status === 'fulfilled' ? { ...driving.value, modeOverride: 'moto' } : null, // 摩托车暂用驾车数据近似
  };
}
