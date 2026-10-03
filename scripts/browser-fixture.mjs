// Isolated server used by browser-regression.mjs. Never copies .env or user data.
import { fork } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { access, cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from '../server/lib/auth.js';

const root = fileURLToPath(new URL('../', import.meta.url));
export const selectedPoi = {
  key: 'ctrip:browser-regression-viewpoint', name: '回归测试观景台',
  lng: 101.91, lat: 36.71, type: 'scenic', rating: 4.9,
  distanceKm: 2, price: 15, ticketType: '测试门票',
  address: '仅限本机隔离测试', note: '来自模拟携程接口，无真实账号或网络调用',
  source: 'ctrip_mock', photos: [],
};
export const tripName = '浏览器回归测试 · 两日行程';

const mockAmap = `
export async function planDriving() { return { distanceKm: 10, durationMin: 20, steps: [] }; }
export async function getWeather() { return null; }
export async function poiSearch() { return []; }
export async function placeAround() { return []; }
export async function geocode() { return null; }
export async function planAllModes() { return {}; }
export async function planTransit() { return null; }
export async function planWalking() { return null; }
export async function planRiding() { return null; }
`;
const mockFeishu = `
export async function fetchAgenda() { return []; }
export function normalizeEvent(value) { return value; }
export async function syncAgenda() { return []; }
export async function getEventDetail() { return null; }
export async function healthCheck() { return { ok: true, source: 'browser-fixture' }; }
`;

// Imported before the actual server entrypoint. Even a missed provider mock may
// not contact a real service. This also forbids unexpected CLI execution.
const bootstrap = `
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
const forbidden = () => {
  console.error('FORBIDDEN_EXTERNAL_IO');
  throw new Error('External network and CLI access are forbidden in the browser fixture');
};
globalThis.fetch = forbidden;
for (const mod of [http, https]) { mod.request = forbidden; mod.get = forbidden; }
net.connect = forbidden;
net.createConnection = forbidden;
net.Socket.prototype.connect = forbidden;
for (const name of ['exec', 'execFile', 'spawn', 'fork', 'execSync', 'execFileSync', 'spawnSync']) childProcess[name] = forbidden;
syncBuiltinESMExports();
if (process.env.FIXTURE_SEED === 'true') {
  const { db, ensureSeed } = await import('./server/store/db.js');
  const { buildOneDay } = await import('./server/services/tripBuilder.js');
  await ensureSeed();
  const days = [
    await buildOneDay(['xining', 'huzhu'], { preset: 'relaxed10', dayNumber: 1, date: '2026-10-01' }),
    await buildOneDay(['huzhu', 'chaka'], { preset: 'relaxed10', dayNumber: 2, date: '2026-10-02' }),
  ];
  await db.saveTrip({
    id: 'browser-regression-trip', name: ${JSON.stringify(tripName)},
    preset: 'relaxed10', mode: 'motorcycle', startDate: '2026-10-01', endDate: '2026-10-02',
    createdAt: '2026-10-01T08:00:00.000Z', totalDays: 2, customStops: {}, customPois: {}, days,
    summary: { totalKm: 20, drivingHours: 0.7, stayHours: 0, highestAlt: 3100, averageDailyKm: 10 },
  });
}
await import('./server/index.js');
`;

async function unusedPort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

export async function createBrowserFixture() {
  await access(path.join(root, 'dist/index.html')).catch(() => {
    throw new Error('Build the current frontend first: npm run build');
  });
  const dir = await mkdtemp(path.join(os.tmpdir(), 'time-master-browser-'));
  let child;
  let output = '';
  try {
    // Copy only executable server source. There is deliberately no fallback to
    // a development server, real .env, or the developer's .run-data directory.
    await cp(path.join(root, 'server'), path.join(dir, 'server'), {
      recursive: true,
      filter: source => !path.basename(source).startsWith('.') &&
        (!path.extname(source) || ['.js', '.mjs'].includes(path.extname(source))),
    });
    await cp(path.join(root, 'dist'), path.join(dir, 'dist'), { recursive: true });
    await symlink(path.join(root, 'node_modules'), path.join(dir, 'node_modules'), 'junction');
    await writeFile(path.join(dir, 'package.json'), '{"type":"module"}\n');
    await writeFile(path.join(dir, 'server/services/amap.js'), mockAmap);
    await writeFile(path.join(dir, 'server/services/feishu.js'), mockFeishu);
    await writeFile(path.join(dir, 'server/data/ctripProvider.mjs'), `
export function ctripEnabled() { return false; }
export async function searchCtripNearby() { return [${JSON.stringify(selectedPoi)}]; }
export async function getCtripProductDetail() { return null; }
`);
    await writeFile(path.join(dir, 'fixture-bootstrap.mjs'), bootstrap);
    const port = await unusedPort();
    const origin = `http://127.0.0.1:${port}`;
    const dataDir = path.join(dir, 'isolated-data');
    await mkdir(dataDir);
    const password = `fixture-only-${randomBytes(24).toString('hex')}`;
    const passwordHash = await hashPassword(password);
    const env = {
      NODE_ENV: 'test', HOST: '127.0.0.1', PORT: String(port), PUBLIC_ORIGIN: origin,
      AUTH_DISABLED: 'false', AUTH_PASSWORD_HASH: passwordHash, DATA_DIR: dataDir,
    };
    for (const key of ['PATH', 'SystemRoot', 'WINDIR', 'TMP', 'TEMP']) {
      if (process.env[key]) env[key] = process.env[key];
    }
    const fixture = {
      dir, dataDir, origin, password,
      async start({ seed = false } = {}) {
        if (child) throw new Error('Stop the fixture before restarting it');
        const processOutput = [];
        child = fork(path.join(dir, 'fixture-bootstrap.mjs'), [], {
          cwd: dir, env: { ...env, FIXTURE_SEED: String(seed) }, silent: true, execArgv: [],
        });
        const current = child;
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => finish(new Error('Fixture startup timed out')), 15000);
          const onExit = (code, signal) => finish(new Error(`Fixture exited during startup: ${code ?? signal}`));
          const onError = error => finish(error);
          function finish(error) {
            clearTimeout(timeout);
            current.off('exit', onExit);
            current.off('error', onError);
            if (error) reject(new Error(`${error.message}\n${processOutput.join('')}`));
            else resolve();
          }
          current.once('exit', onExit);
          current.once('error', onError);
          const capture = chunk => {
            const text = chunk.toString();
            output += text;
            processOutput.push(text);
            if (processOutput.join('').includes('时间管理大师已启动')) finish();
          };
          current.stdout.on('data', capture);
          current.stderr.on('data', capture);
        });
      },
      async stop(signal = 'SIGTERM') {
        if (!child) return;
        const current = child;
        child = null;
        if (current.exitCode !== null || current.signalCode !== null) return;
        const exited = once(current, 'exit');
        current.kill(signal);
        const timeout = setTimeout(() => current.kill('SIGKILL'), 5000);
        try { await exited; } finally { clearTimeout(timeout); }
      },
      async readTrip() { return JSON.parse(await readFile(path.join(dataDir, 'trip.json'), 'utf8')); },
      get output() { return output; },
      async dispose() {
        await fixture.stop();
        await rm(dir, { recursive: true, force: true });
      },
    };
    return fixture;
  } catch (error) {
    child?.kill('SIGKILL');
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
}
