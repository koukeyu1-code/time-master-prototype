/* ============================================================
   工具函数
   ============================================================ */
import crypto from 'node:crypto';

export function ok(data) {
  return { code: 0, data };
}

export function fail(code, message, data = null) {
  return { code, message, data };
}

export function genId(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
}

/* 时间字符串 HH:mm → 当天分钟数 */
export function hmToMin(hm) {
  if (!hm) return null;
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

export function minToHm(min) {
  if (min == null) return null;
  const h = Math.floor(min / 60) % 24;
  const m = Math.round(min % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function nowHm() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

/* 加若干分钟到 HH:mm，跨天进位到次日，但只回 HH:mm */
export function addMin(hm, min) {
  if (hm == null || min == null) return null;
  const total = hmToMin(hm) + min;
  return minToHm(total);
}

/* 计算 HH:mm 之间的分钟差（b - a，跨天为负数） */
export function diffMin(aHm, bHm) {
  return hmToMin(bHm) - hmToMin(aHm);
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
