/* ============================================================
   飞书日历接入：lark-cli 子进程封装
   职责：
   - 通过 `lark-cli calendar +agenda` 拉取日程
   - 转换为内部 Event 模型（对齐 src/mock/data.js 的 events 结构）
   - 写入本地缓存（events.json）供后端其他模块读
   不直接走 OpenAPI：避免在后端维护 app_id/app_secret
   ============================================================ */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { db } from '../store/db.js';

const execFileAsync = promisify(execFile);
const LARK_BIN = process.env.LARK_CLI_BIN || 'lark-cli';
const LARK_PROFILE = process.env.LARK_PROFILE || '';
const AGENDA_HOURS = Number(process.env.AGENDA_HOURS || 24);

function buildArgs(base) {
  const args = [...base];
  if (LARK_PROFILE) args.push('--profile', LARK_PROFILE);
  return args;
}

async function runLark(args) {
  try {
    const { stdout } = await execFileAsync(LARK_BIN, args, {
      maxBuffer: 16 * 1024 * 1024,
      timeout: 30000,
      windowsHide: true,
    });
    return stdout;
  } catch (e) {
    const msg = e.stderr || e.stdout || e.message;
    throw new Error(`lark-cli 执行失败: ${msg}`);
  }
}

/* ---------- 拉取日程 ---------- */
export async function fetchAgenda(startISO, endISO) {
  const args = buildArgs([
    'calendar', '+agenda',
    '--format', 'json',
    '--start', startISO,
    '--end', endISO,
  ]);
  const out = await runLark(args);
  const j = JSON.parse(out);
  if (!j.ok) throw new Error(`lark-cli 业务错误: ${JSON.stringify(j)}`);
  return j.data || [];
}

/* ---------- 飞书日程 → 内部 Event 模型 ---------- */
export function normalizeEvent(raw) {
  const id = raw.event_id || raw.id;
  const title = raw.summary || '(无主题)';
  const startISO = raw.start_time?.datetime || raw.start_time?.date;
  const endISO = raw.end_time?.datetime || raw.end_time?.date;
  const start = isoToHm(startISO);
  const end = isoToHm(endISO);

  const meetingUrl = raw.vchat?.meeting_url || null;
  const locationRaw = raw.location?.name || raw.location?.address || raw.location || '';

  // 状态判定：有线上会议且无地点 → online；有地点 → ok（后续由 planner/placeMatcher 决定是否 pending）；否则 pending
  let status = 'pending';
  let type = 'personal';
  if (meetingUrl && !locationRaw) {
    status = 'online';
    type = 'meeting';
  } else if (locationRaw) {
    status = 'pending'; // 等待 placeMatcher 解析
    type = /客户|拜访|见|谈/i.test(title) ? 'visit' : 'meeting';
  } else {
    type = 'personal';
  }

  return {
    id,
    title,
    start,
    end,
    startISO,
    endISO,
    locationRaw,
    placeId: null,
    status,
    type,
    meetingUrl,
    organizer: raw.event_organizer?.display_name || '',
    selfRsvp: raw.self_rsvp_status || '',
    raw, // 保留原始对象方便排错
  };
}

function isoToHm(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/* ---------- 拉取 + 缓存 ---------- */
export async function syncAgenda(hours = AGENDA_HOURS) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now.getTime() + hours * 3600 * 1000);

  const raw = await fetchAgenda(start.toISOString(), end.toISOString());
  const events = raw.map(normalizeEvent);
  await db.saveEvents(events);

  // 同步后写入 settings.sync.lastSyncAt
  const settings = await db.getSettings();
  settings.sync = settings.sync || {};
  settings.sync.lastSyncAt = new Date().toTimeString().slice(0, 5);
  await db.saveSettings(settings);

  return events;
}

/* ---------- 拉单个事件详情（用于查看完整字段） ---------- */
export async function getEventDetail(calendarId, eventId) {
  const args = buildArgs([
    'calendar', '+get',
    '--calendar-id', calendarId,
    '--event-id', eventId,
    '--format', 'json',
  ]);
  const out = await runLark(args);
  return JSON.parse(out);
}

/* ---------- 是否可用（健康检查） ---------- */
export async function healthCheck() {
  try {
    const args = buildArgs(['auth', 'status']);
    const out = await runLark(args);
    const j = JSON.parse(out);
    const user = j.identities?.user;
    return {
      ok: !!user?.available,
      brand: j.brand,
      userName: user?.userName,
      tokenStatus: user?.tokenStatus,
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
