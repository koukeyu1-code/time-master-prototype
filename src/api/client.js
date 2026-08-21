/* ============================================================
   API Stub 层：函数签名对齐设计方案 v0.3 §7 接口设计
   当前返回 mock；接入真实后端时逐函数替换实现，形状保持不变。
   ============================================================ */
import { plan, weather, pendingLocations, places, settings, trip, events } from '../mock/data';

const delay = (ms = 320) => new Promise((r) => setTimeout(r, ms));

/** GET /api/plan/today —— 今日出行方案（不存在则实时生成） */
export async function fetchTodayPlan() {
  await delay();
  // TODO: replace with fetch('/api/plan/today')
  return { code: 0, data: { plan, weather, events } };
}

/** GET /api/plan/today · 取单段通勤详情（legs JSONB 切片） */
export async function fetchRouteDetail(legId) {
  await delay(240);
  // TODO: replace with fetch(`/api/plan/today`) 后切片，或后端提供 /api/plan/legs/{legId}
  const leg = plan.legs.find((l) => l.id === legId);
  return { code: leg ? 0 : 404, data: leg || null };
}

/** GET /api/events?status=pending —— 地点待补全队列 */
export async function fetchPendingLocations() {
  await delay(260);
  // TODO: replace with fetch('/api/events?status=pending')
  return { code: 0, data: pendingLocations };
}

/** POST /api/events/{id}/location —— 补全日程地点，同时写入别名库 */
export async function completeLocation(eventId, place) {
  await delay(420);
  // TODO: replace with fetch(`/api/events/${eventId}/location`, { method: 'POST', body: JSON.stringify(place) })
  const ev = events.find((e) => e.id === eventId);
  if (ev) { ev.status = 'ok'; ev.locationRaw = place.alias; }
  return { code: 0, data: { eventId, place } };
}

/** GET /api/places —— 常去地点别名库 */
export async function fetchPlaces() {
  await delay(240);
  // TODO: replace with fetch('/api/places')
  return { code: 0, data: places };
}

/** GET /api/settings —— 读取偏好设置 */
export async function fetchSettings() {
  await delay(220);
  // TODO: replace with fetch('/api/settings')
  return { code: 0, data: settings };
}

/** PUT /api/settings —— 保存偏好设置 */
export async function saveSettings(patch) {
  await delay(380);
  // TODO: replace with fetch('/api/settings', { method: 'PUT', body: JSON.stringify(patch) })
  return { code: 0, data: { ...settings, ...patch }, savedAt: new Date().toISOString() };
}

/** GET /api/plan/{date} —— 差旅多日规划按天调用；原型返回整趟行程 */
export async function fetchTrip() {
  await delay(300);
  // TODO: replace with fetch(`/api/plan/${date}`) 按天分片
  return { code: 0, data: trip };
}

/** POST /api/plan/recalc —— 实时路况重算（对应设计 §5.4 推送前重算能力） */
export async function recalcTraffic(legId) {
  await delay(600);
  // TODO: replace with fetch(`/api/plan/recalc`, { method: 'POST', body: JSON.stringify({ legId }) })
  return { code: 0, data: { legId, trafficDeltaMin: +2, note: '实时路况重算完成：小雨导致均速下降，通勤时长 +2 分钟' } };
}

/** POST /api/sync —— 手动触发全量同步 */
export async function triggerSync() {
  await delay(500);
  // TODO: replace with fetch('/api/sync', { method: 'POST' })
  return { code: 0, data: { synced: 6, at: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) } };
}
