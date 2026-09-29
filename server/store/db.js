/* ============================================================
   存储层：JSON 文件存储（无外部数据库依赖）
   - places：常去地点别名库
   - settings：用户偏好设置
   - cache：路线/天气缓存
   ============================================================ */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function readJson(file, fallback) {
  try {
    const txt = await fs.readFile(file, 'utf8');
    return JSON.parse(txt);
  } catch (e) {
    if (e.code === 'ENOENT') return fallback;
    throw e;
  }
}

async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
}

/* ---------- 数据文件路径 ---------- */
function dataDir(dir) {
  return {
    placesFile: path.join(dir, 'places.json'),
    settingsFile: path.join(dir, 'settings.json'),
    cacheFile: path.join(dir, 'cache.json'),
    eventsFile: path.join(dir, 'events.json'),   // 日程本地副本（飞书拉取后缓存）
    tripFile: path.join(dir, 'trip.json'),       // 当前行程（摩托自驾规划产物）
  };
}

/* ---------- 初始化：写入种子数据 ---------- */
export async function ensureSeed(dir) {
  await fs.mkdir(dir, { recursive: true });
  const { placesFile, settingsFile, cacheFile, eventsFile, tripFile } = dataDir(dir);
  const { seedPlaces, seedSettings } = await import('./seed.js');

  const places = await readJson(placesFile, null);
  if (!places) await writeJson(placesFile, seedPlaces);

  const settings = await readJson(settingsFile, null);
  if (!settings) await writeJson(settingsFile, seedSettings);

  const cache = await readJson(cacheFile, null);
  if (!cache) await writeJson(cacheFile, { weather: {}, routes: {} });

  const events = await readJson(eventsFile, null);
  if (!events) await writeJson(eventsFile, []);

  const trip = await readJson(tripFile, null);
  if (!trip) await writeJson(tripFile, null); // 初始空行程

  console.log(`  [store] data dir: ${dir}`);
}

/* ---------- 对外 API ---------- */
/* 重要：把运行时数据目录放在项目根 `.run-data/` 下，避免 node --watch 监视 server/ 时被 cache/trip.json 写入触发重启 */
const DIR = path.join(__dirname, '..', '..', '.run-data');
const files = dataDir(DIR);

export const db = {
  async getPlaces() {
    return readJson(files.placesFile, []);
  },
  async savePlaces(list) {
    await writeJson(files.placesFile, list);
  },
  async upsertPlace(place) {
    const list = await this.getPlaces();
    const idx = list.findIndex((p) => p.id === place.id);
    if (idx >= 0) list[idx] = { ...list[idx], ...place };
    else list.push(place);
    await this.savePlaces(list);
    return place;
  },
  async getPlaceById(id) {
    const list = await this.getPlaces();
    return list.find((p) => p.id === id) || null;
  },
  async findPlaceByAlias(alias) {
    const list = await this.getPlaces();
    const a = (alias || '').trim();
    return list.find((p) => p.alias === a || p.address?.includes(a)) || null;
  },

  async getSettings() {
    return readJson(files.settingsFile, {});
  },
  async saveSettings(patch) {
    const cur = await this.getSettings();
    const next = Array.isArray(patch) ? patch : { ...cur, ...patch };
    await writeJson(files.settingsFile, next);
    return next;
  },

  async getEvents() {
    return readJson(files.eventsFile, []);
  },
  async saveEvents(list) {
    await writeJson(files.eventsFile, list);
  },
  async upsertEvent(event) {
    const list = await this.getEvents();
    const idx = list.findIndex((e) => e.id === event.id);
    if (idx >= 0) list[idx] = { ...list[idx], ...event };
    else list.push(event);
    await this.saveEvents(list);
    return event;
  },

  async getCache() {
    return readJson(files.cacheFile, { weather: {}, routes: {} });
  },
  async saveCache(cache) {
    await writeJson(files.cacheFile, cache);
  },
  async getCached(key, sub, ttlMin) {
    const cache = await this.getCache();
    const slot = cache[key]?.[sub];
    if (!slot) return null;
    const ageMin = (Date.now() - slot.ts) / 60000;
    if (ageMin > ttlMin) return null;
    return slot.data;
  },
  async setCached(key, sub, data) {
    const cache = await this.getCache();
    if (!cache[key]) cache[key] = {};
    cache[key][sub] = { ts: Date.now(), data };
    await this.saveCache(cache);
  },

  // 行程（摩托自驾规划）
  async getTrip() {
    return readJson(files.tripFile, null);
  },
  async saveTrip(trip) {
    await writeJson(files.tripFile, trip);
    return trip;
  },
};
