/* ============================================================
   携程景点门票分销 Provider
   来源优先级：
     1) 真实携程开放平台（openapi.ctrip.com）→ source = 'ctrip'
     2) 未配置 Key 或 调用失败 → Mock 示例数据 → source = 'ctrip_mock'
   所有输出字段统一为 「POI 候选格式」，可直接与 getNearbyAttractions 合并。
   ============================================================ */
import crypto from 'node:crypto';

/* 注意：读取 process.env 必须在 dotenv.config() 之后，因此放在运行时函数中，而不是模块顶层 */
function env() {
  return {
    key: process.env.CTRIP_API_KEY || '',
    secret: process.env.CTRIP_API_SECRET || '',
    base: process.env.CTRIP_API_BASE || 'https://openapi.ctrip.com',
  };
}
const TIMEOUT_MS = 6000;

/* 统一出口：是否可用真实接口 */
export function ctripEnabled() {
  const { key, secret } = env();
  return !!(key && secret);
}

/* ---------- Mock 示例数据（按经纬度做距离过滤，字段与真实一致） ---------- */
/* 每个点对应青甘大环线周边真实热门景点，带携程风格价格/评分/门票类型 */
const MOCK_SCENIC = [
  { key: 'ctrip:qinghaih_erlangjian', name: '青海湖二郎剑景区（官方票）', lng: 100.812, lat: 36.623, rating: 4.6,
    price: 90, ticketType: '成人票', address: '海南藏族自治州共和县109国道旁',
    photos: ['https://youimg1.c-ctrip.com/target/100o0y0000009r0qjC5A1.jpg'] },
  { key: 'ctrip:chaka_sky',       name: '茶卡盐湖天空壹号·含电瓶车', lng: 99.109, lat: 36.777, rating: 4.8,
    price: 138, ticketType: '成人套票', address: '海西州乌兰县茶卡镇巴音村',
    photos: ['https://youimg1.c-ctrip.com/target/100i0y000000q27a4E2CB.jpg'] },
  { key: 'ctrip:chaka_old',       name: '茶卡盐湖（老景区）·门票',   lng: 99.086, lat: 36.804, rating: 4.3,
    price: 60,  ticketType: '成人票', address: '海西州乌兰县茶卡镇盐湖路9号',
    photos: ['https://youimg1.c-ctrip.com/target/100m0y000000n0p2bD31E.jpg'] },
  { key: 'ctrip:menyuan_rape',    name: '门源百里油菜花海·观花台',   lng: 101.622, lat: 37.496, rating: 4.7,
    price: 60,  ticketType: '成人票', address: '海北州门源县浩门镇观花台', },
  { key: 'ctrip:qilian_zhuoer',   name: '祁连卓尔山风景区',           lng: 100.256, lat: 38.187, rating: 4.8,
    price: 120, ticketType: '门票+观光车', address: '海北州祁连县八宝镇卓尔山', },
  { key: 'ctrip:zhangye_danxia',  name: '张掖七彩丹霞·深度游',         lng: 100.002, lat: 38.937, rating: 4.9,
    price: 188, ticketType: '深度含4个观景台', address: '张掖市甘州区倪家营镇丹霞景区', },
  { key: 'ctrip:jiayuguan',       name: '嘉峪关关城·联票（含悬壁+第一墩）', lng: 98.247, lat: 39.808, rating: 4.6,
    price: 110, ticketType: '成人联票', address: '嘉峪关市峪泉镇关城景区', },
  { key: 'ctrip:dunhuang_mingsha',name: '敦煌鸣沙山月牙泉·含骑骆驼',  lng: 94.683, lat: 40.088, rating: 4.8,
    price: 280, ticketType: '门票+骆驼项目套票', address: '酒泉市敦煌市鸣沙山', },
  { key: 'ctrip:dunhuang_mogao',  name: '莫高窟 A 类票（含数字中心+8窟）', lng: 94.809, lat: 40.043, rating: 4.9,
    price: 238, ticketType: 'A 类成人票', address: '酒泉市敦煌市莫高镇', },
  { key: 'ctrip:yadan_nanbaxian', name: '敦煌雅丹国家地质公园（南八仙）', lng: 94.476, lat: 40.489, rating: 4.5,
    price: 95, ticketType: '门票+观光车', address: '酒泉市敦煌市西北 180km', },
  { key: 'ctrip:shuishang_yadan', name: '乌素特（水上）雅丹地质公园',  lng: 93.922, lat: 37.413, rating: 4.7,
    price: 120, ticketType: '门票+区间车', address: '海西州大柴旦行委西台', },
  { key: 'ctrip:dongtai_salt',    name: '东台吉乃尔湖·接送',           lng: 94.183, lat: 37.529, rating: 4.4,
    price: 168, ticketType: '往返接送（含小交通）', address: '海西州格尔木市', },
  { key: 'ctrip:delingha_keerk',  name: '可鲁克湖·托素湖',             lng: 97.021, lat: 37.238, rating: 4.2,
    price: 20,  ticketType: '成人票', address: '海西州德令哈市怀头他拉镇', },
  { key: 'ctrip:lenghu_youxing',  name: '冷湖火星营地·科普体验',       lng: 92.970, lat: 38.831, rating: 4.6,
    price: 398, ticketType: '参观+宇航服拍照', address: '海西州茫崖市冷湖镇', },
];

/* Haversine 距离 km */
function distanceKm(a, b) {
  const R = 6371;
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s1 = Math.sin(dLat / 2) ** 2;
  const s2 = Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s1 + s2));
}

async function searchMock({ lng, lat, radius, limit }) {
  const arr = MOCK_SCENIC
    .map(p => ({ ...p, distanceKm: distanceKm({ lng, lat }, p) }))
    .filter(p => p.distanceKm <= radius)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit)
    .map(p => ({
      key: p.key,
      name: p.name,
      lng: p.lng,
      lat: p.lat,
      rating: p.rating,
      distanceKm: Number(p.distanceKm.toFixed(1)),
      price: p.price,
      ticketType: p.ticketType,
      address: p.address,
      note: `${p.ticketType || ''} 携程门票（示例数据）`,
      photos: p.photos || [],
      source: 'ctrip_mock',
    }));
  return arr;
}

/* ---------- 真实携程开放平台：景点门票搜索 ---------- */
/**
 * 参考携程开放平台「景点门票查询」：
 *   POST /open/ticket/scenic/search
 *   Header: appKey, timestamp, sign
 *   sign = md5(appKey + timestamp + secret + body) （具体算法以官方为准，
 *   本实现做标准模板，实际按文档微调 1 行即可。）
 * 返回：景点列表 → 规范化
 */
async function searchReal({ lng, lat, radius, limit }) {
  const { key: API_KEY, secret: API_SECRET, base: API_BASE } = env();
  const endpoint = '/open/ticket/scenic/search';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const body = {
    keyword: '',
    cityId: '',   /* 留空按经纬度搜索 */
    longitude: Number(lng),
    latitude: Number(lat),
    radius: Number(radius), /* 米 */
    pageIndex: 1,
    pageSize: Number(limit || 20),
    sort: 'distance',
  };
  const bodyStr = JSON.stringify(body);
  const rawSign = `${API_KEY}${timestamp}${API_SECRET}${bodyStr}`;
  const sign = crypto.createHash('md5').update(rawSign).digest('hex');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        appKey: API_KEY,
        timestamp,
        sign,
      },
      body: bodyStr,
    });
    if (!res.ok) throw new Error(`CTRIP HTTP ${res.status}`);
    const json = await res.json();
    /* 解析：约定响应结构 { code:0, data: { items:[{scenicId, name, longitude, latitude, score, minPrice, address, photoUrl, ticketName}] } } */
    const items = (json?.data?.items || []).map((it, i) => ({
      key: `ctrip:${it.scenicId || ('sc_' + i)}`,
      name: it.name,
      lng: Number(it.longitude),
      lat: Number(it.latitude),
      rating: Number(it.score || 0),
      price: Number(it.minPrice || 0),
      ticketType: it.ticketName || '',
      address: it.address || '',
      note: it.ticketName ? `携程门票：${it.ticketName}` : '',
      photos: it.photoUrl ? [it.photoUrl] : [],
      source: 'ctrip',
      distanceKm: Number((it.distanceKm ?? distanceKm({ lng, lat }, { lng: it.longitude, lat: it.latitude })).toFixed(1)),
    }));
    return items.filter(p => p.distanceKm <= radius / 1000);
  } finally {
    clearTimeout(timer);
  }
}

/** 统一入口：周边景点搜索（携程侧） */
export async function searchCtripNearby({ lng, lat, radius, limit = 20 }) {
  if (!lng || !lat) return [];
  const enabled = ctripEnabled();
  try {
    if (enabled) {
      return await searchReal({ lng, lat, radius: radius * 1000, limit });
    }
    return await searchMock({ lng, lat, radius: radius / 1000, limit });
  } catch (e) {
    if (enabled) {
      /* 真实接口失败，降为 Mock 并标记来源失败提示（可选） */
      return await searchMock({ lng, lat, radius: radius / 1000, limit });
    }
    return [];
  }
}

/** 单景点详情（留作未来单独点进去买门票用） */
export async function getCtripProductDetail(productKey) {
  return { key: productKey, enabled: ctripEnabled(), bookingUrl: `${API_BASE}/booking?product=${encodeURIComponent(productKey)}` };
}
