/* ============================================================
   API Client 层：调用后端 BFF（默认 http://localhost:8787）
   函数签名对齐设计方案 v0.3 §7 接口设计
   ============================================================ */
const BASE = '/api'; // Personal access uses same-origin cookies only.
let csrfToken;
async function session() {
  const result = await fetch(`${BASE}/auth/session`, { credentials: 'same-origin', cache: 'no-store' });
  if (result.status === 401) { window.location.replace('/login'); throw new Error('请先登录'); }
  if (!result.ok) throw new Error('读取登录状态失败');
  csrfToken = (await result.json()).data.csrfToken;
  return csrfToken;
}
export async function logout() {
  await call('/auth/logout', { method: 'POST' });
  window.location.replace('/login');
}

async function call(path, options = {}) {
  const mutating = !['GET', 'HEAD'].includes(options.method || 'GET');
  if (mutating && csrfToken === undefined) await session();
  const res = await fetch(`${BASE}${path}`, {
    ...options, credentials: 'same-origin', cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...(mutating && csrfToken ? { 'X-CSRF-Token': csrfToken } : {}), ...options.headers },
  });
  if (res.status === 401) { window.location.replace('/login'); throw new Error('登录已失效，请重新登录'); }
  let json;
  try { json = await res.json(); } catch { json = { code: res.status, message: `HTTP ${res.status}` }; }
  if (!res.ok || (json.code && json.code !== 0)) {
    throw new Error(json.message || json.error || `HTTP ${res.status}`);
  }
  return json;
}

/** GET /api/plan/today —— 今日出行方案（不存在则实时生成） */
export async function fetchTodayPlan() {
  return call('/plan/today');
}

/** GET /api/plan/legs/:legId —— 取单段通勤详情 */
export async function fetchRouteDetail(legId) {
  return call(`/plan/legs/${encodeURIComponent(legId)}`);
}

/** GET /api/events/pending —— 地点待补全队列 */
export async function fetchPendingLocations() {
  return call('/events/pending');
}

/** POST /api/events/:id/location —— 补全日程地点 */
export async function completeLocation(eventId, place) {
  return call(`/events/${encodeURIComponent(eventId)}/location`, {
    method: 'POST',
    body: JSON.stringify(place),
  });
}

/** GET /api/places —— 常去地点别名库 */
export async function fetchPlaces() {
  return call('/places');
}

/** GET /api/settings —— 读取偏好设置 */
export async function fetchSettings() {
  return call('/settings');
}

/** PUT /api/settings —— 保存偏好设置 */
export async function saveSettings(patch) {
  return call('/settings', {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
}

/** GET /api/trip/templates —— 可用行程模板列表 */
export async function fetchTripTemplates() {
  return call('/trip/templates');
}

/** POST /api/trip —— 创建行程（如摩托自驾 7 日） */
export async function buildTrip(payload) {
  return call('/trip', { method: 'POST', body: JSON.stringify(payload || {}) });
}

/** GET /api/trip —— 取当前行程 */
export async function fetchTrip() {
  return call('/trip');
}

/** GET /api/trip/days/:day —— 取单天详情 */
export async function fetchTripDay(day) {
  return call(`/trip/days/${encodeURIComponent(day)}`);
}

/** POST /api/trip/days/:day/recalc —— 重算某一天（路线、天气、风险） */
export async function recalcTripDay(day) {
  return call(`/trip/days/${encodeURIComponent(day)}/recalc`, { method: 'POST' });
}

/** GET /api/trip/days/:day/pois —— 取某日 50km 范围内的候选景点（高德+内置） */
export async function fetchTripDayPOIs(day, radius) {
  const q = radius ? `?radius=${radius}` : '';
  return call(`/trip/days/${encodeURIComponent(day)}/pois${q}`);
}

/** PUT /api/trip/days/:day/stops —— 覆盖某日 stops 并重算全程 summary */
export async function updateTripDayStops(day, stops) {
  return call(`/trip/days/${encodeURIComponent(day)}/stops`, { method: 'PUT', body: JSON.stringify({ stops }) });
}

/** POST /api/plan/recalc —— 实时路况重算 */
export async function recalcTraffic(legId) {
  return call('/plan/recalc', {
    method: 'POST',
    body: JSON.stringify({ legId }),
  });
}

/** POST /api/sync —— 手动触发全量同步 */
export async function triggerSync() {
  return call('/sync', { method: 'POST' });
}
