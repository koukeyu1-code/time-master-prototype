import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import express from 'express';

const derive = promisify(scrypt);
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const digest = value => createHash('sha256').update(value).digest('hex');
const safeEqual = (a, b) => typeof a === 'string' && typeof b === 'string' &&
  /^[a-f0-9]{64}$/.test(a) && /^[a-f0-9]{64}$/.test(b) &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  if (typeof password !== 'string' || password.length < 16 || password.length > 1024) {
    throw new Error('密码须为 16–1024 个字符');
  }
  const key = await derive(password, salt, 64, SCRYPT);
  return `scrypt$${salt}$${key.toString('hex')}`;
}

export function readAuthConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const host = env.HOST || '127.0.0.1';
  if (env.AUTH_DISABLED && !['true', 'false'].includes(env.AUTH_DISABLED)) {
    throw new Error('AUTH_DISABLED 只能为 true 或 false');
  }
  const disabled = env.AUTH_DISABLED === 'true';
  if (disabled && (production || !LOOPBACK.has(host))) {
    throw new Error('AUTH_DISABLED 仅允许非生产环境且 HOST 为回环地址');
  }
  if (disabled) return { disabled, production, host };
  const passwordHash = env.AUTH_PASSWORD_HASH || '';
  if (!/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(passwordHash)) {
    throw new Error('缺少有效 AUTH_PASSWORD_HASH；请先在本机安全配置个人登录密码');
  }
  let origin = null;
  if (env.PUBLIC_ORIGIN) {
    const url = new URL(env.PUBLIC_ORIGIN);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== env.PUBLIC_ORIGIN ||
        url.username || url.password || (production && url.protocol !== 'https:')) {
      throw new Error('PUBLIC_ORIGIN 必须为完整同源地址，生产环境须为 https，不能含路径或尾斜杠');
    }
    origin = url.origin;
  }
  if (production && !origin) throw new Error('生产环境必须设置 HTTPS PUBLIC_ORIGIN');
  if (!production && !origin && !LOOPBACK.has(host)) {
    throw new Error('非回环监听必须配置 PUBLIC_ORIGIN');
  }
  return { disabled, production, host, passwordHash, origin };
}

const loginPage = (failed = false) => `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>登录 · 时间管理大师</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f5f4ef;color:#262823;font:16px system-ui}main{max-width:360px;padding:36px;background:#fff;border:1px solid #ddd;border-radius:18px;box-shadow:0 12px 30px #0001}h1{font-size:25px}p{line-height:1.7;color:#62675e}label,input,button{display:block;box-sizing:border-box;width:100%}input{padding:12px;margin:10px 0 18px;border:1px solid #999;border-radius:8px;font:inherit}button{border:0;border-radius:8px;padding:12px;background:#305a43;color:white;font:inherit;cursor:pointer}[role=alert]{color:#a22}</style></head><body><main><h1>时间管理大师</h1><p>个人工作台，请输入密码后继续</p>${failed ? '<p role="alert">密码错误或暂时无法登录，请稍后再试</p>' : ''}<form action="/login" method="post"><label for="password">个人密码</label><input id="password" name="password" type="password" autocomplete="current-password" required maxlength="1024" autofocus><button type="submit">登录</button></form></main></body></html>`;

export function createPersonalAuth(config, { now = Date.now, sessionTtlMs = 8 * 60 * 60 * 1000, loginLimit = 10 } = {}) {
  const router = express.Router();
  const sessions = new Map();
  const cookieName = config.production ? '__Host-tm_session' : 'tm_session';
  const cookieOptions = { httpOnly: true, secure: config.production || config.origin?.startsWith('https:'), sameSite: 'strict', path: '/' };
  let attemptWindow = 0;
  let attempts = 0;
  let verifying = 0;
  const reject = (res, status, message) => res.status(status).json({ code: status, message });
  function expectedOrigin(req) {
    if (config.origin) return config.origin;
    try {
      const url = new URL(`http://${req.headers.host}`);
      return LOOPBACK.has(url.hostname) ? url.origin : null;
    } catch { return null; }
  }
  function sameOrigin(req) {
    const expected = expectedOrigin(req);
    return expected && req.headers.origin === expected && req.headers['sec-fetch-site'] !== 'cross-site';
  }
  function sessionFor(req) {
    const cookies = (req.headers.cookie || '').split(';').map(s => s.trim());
    const values = cookies.filter(s => s.startsWith(`${cookieName}=`));
    if (values.length !== 1) return null;
    const token = values[0].slice(cookieName.length + 1);
    if (!/^[a-f0-9]{64}$/.test(token)) return null;
    const key = digest(token);
    const session = sessions.get(key);
    if (!session) return null;
    if (session.expiresAt <= now()) { sessions.delete(key); return null; }
    return { ...session, key };
  }
  router.use((req, res, next) => {
    // no-referrer turns native form POST Origin into null (Fetch §3.2),
    // breaking the exact-origin login guard. same-origin still hides referrers
    // from other origins while keeping both initial and retry forms usable.
    res.set({ 'Cache-Control': 'no-store', 'Pragma': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'; object-src 'none'" });
    if (config.production) res.set('Strict-Transport-Security', 'max-age=31536000');
    const expected = expectedOrigin(req);
    if (!expected || (config.origin && req.headers.host !== new URL(expected).host)) return reject(res, 403, 'Host 不允许');
    if (req.headers['sec-fetch-site'] === 'cross-site' || (req.headers.origin && !sameOrigin(req))) return reject(res, 403, '跨站请求不允许');
    next();
  });
  router.get('/login', (req, res) => {
    if (config.disabled || sessionFor(req)) return res.redirect(303, '/');
    res.type('html').send(loginPage());
  });
  router.post('/login', express.urlencoded({ extended: false, limit: '16kb' }), (req, res, next) => {
    if (!sameOrigin(req)) return reject(res, 403, '登录请求须来自本站');
    if (config.disabled) return res.redirect(303, '/');
    if (now() - attemptWindow >= 15 * 60 * 1000) { attempts = 0; attemptWindow = now(); }
    if (attempts >= loginLimit || verifying >= 2) { res.set('Retry-After', '900'); return res.status(429).type('html').send(loginPage(true)); }
    attempts += 1;
    const password = req.body?.password;
    if (typeof password !== 'string' || password.length > 1024) return res.status(401).type('html').send(loginPage(true));
    verifying += 1;
    const [, salt, expected] = config.passwordHash.split('$');
    derive(password, salt, 64, SCRYPT).then(actual => {
      if (!timingSafeEqual(actual, Buffer.from(expected, 'hex'))) return res.status(401).type('html').send(loginPage(true));
      const old = sessionFor(req);
      if (old) sessions.delete(old.key);
      for (const [key, value] of sessions) if (value.expiresAt <= now()) sessions.delete(key);
      if (sessions.size >= 32) sessions.delete(sessions.keys().next().value);
      const token = randomBytes(32).toString('hex');
      const session = { csrfToken: randomBytes(32).toString('hex'), expiresAt: now() + sessionTtlMs };
      sessions.set(digest(token), session);
      res.cookie(cookieName, token, { ...cookieOptions, maxAge: sessionTtlMs });
      res.redirect(303, '/');
    }).catch(next).finally(() => { verifying -= 1; });
  });
  router.use((req, res, next) => {
    if (config.disabled) { req.personalSession = { csrfToken: null }; return next(); }
    const session = sessionFor(req);
    if (!session) {
      if (req.path.startsWith('/api/')) return reject(res, 401, '请先登录');
      return res.redirect(303, '/login');
    }
    req.personalSession = session;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
        (!sameOrigin(req) || !safeEqual(req.headers['x-csrf-token'], session.csrfToken))) {
      return reject(res, 403, '请求校验失败，请刷新页面后重试');
    }
    next();
  });
  router.get('/api/auth/session', (req, res) => res.json({ code: 0, data: { csrfToken: req.personalSession.csrfToken, expiresAt: req.personalSession.expiresAt || null, disabled: config.disabled } }));
  router.post('/api/auth/logout', (req, res) => {
    if (req.personalSession.key) sessions.delete(req.personalSession.key);
    res.clearCookie(cookieName, cookieOptions);
    res.json({ code: 0, data: { loggedOut: true } });
  });
  return router;
}
