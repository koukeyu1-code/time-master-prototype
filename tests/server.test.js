import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fork } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

test('BFF starts with isolated seed data and serves health and local reads', { timeout: 15000 }, async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'time-master-bff-'));
  let child;
  let exited;
  t.after(async () => {
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill();
      const forceKill = setTimeout(() => child.kill('SIGKILL'), 3000);
      try { await exited; } finally { clearTimeout(forceKill); }
    }
    await rm(dir, { recursive: true, force: true });
  });

  // The store is relative to server's source location. A temp cwd alone would
  // still touch the developer's .run-data, so copy the code, never real data/env.
  const serverDir = path.join(root, 'server');
  await cp(serverDir, path.join(dir, 'server'), {
    recursive: true,
    filter: (source) => {
      const relative = path.relative(serverDir, source);
      return !path.basename(source).startsWith('.env') &&
        relative !== path.join('store', 'data') &&
        !relative.startsWith(`store${path.sep}data${path.sep}`);
    },
  });
  await writeFile(path.join(dir, 'package.json'), '{"type":"module"}\n');
  await writeFile(path.join(dir, 'server', '.env'), 'PORT=0\n');
  await symlink(path.join(root, 'node_modules'), path.join(dir, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');

  // Observe the real entry point's ephemeral port; bind test traffic to loopback.
  // Fail closed if an unexpected code path attempts an external API or CLI call.
  const runner = `
    import http from 'node:http';
    import childProcess from 'node:child_process';
    import { syncBuiltinESMExports } from 'node:module';
    const forbidden = () => { throw new Error('External APIs and CLI are disabled in this smoke test'); };
    globalThis.fetch = forbidden;
    childProcess.execFile = forbidden;
    syncBuiltinESMExports();
    const listen = http.Server.prototype.listen;
    http.Server.prototype.listen = function (port, host, callback) {
      this.once('listening', () => process.send({ port: this.address().port }));
      return listen.call(this, port, '127.0.0.1', callback);
    };
    await import('./server/index.js');
  `;
  const runnerPath = path.join(dir, 'smoke-runner.mjs');
  await writeFile(runnerPath, runner);
  const env = { NODE_ENV: 'test', AUTH_DISABLED: 'true' };
  for (const key of ['PATH', 'SystemRoot', 'WINDIR', 'TMP', 'TEMP']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  child = fork(runnerPath, [], { cwd: dir, env, execArgv: [], stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let output = '';
  child.stdout.on('data', (chunk) => { output = (output + chunk).slice(-10000); });
  child.stderr.on('data', (chunk) => { output = (output + chunk).slice(-10000); });
  exited = new Promise((resolve) => child.once('exit', resolve));
  const { port } = await new Promise((resolve, reject) => {
    child.once('message', resolve);
    child.once('error', reject);
    child.once('exit', (code, signal) => reject(new Error(`BFF exited before listening (${code ?? signal}): ${output}`)));
  });
  assert.ok(Number.isInteger(port) && port > 0);
  const base = `http://127.0.0.1:${port}`;
  const health = await fetch(`${base}/api/health`);
  assert.equal(health.status, 200);
  const body = await health.json();
  assert.equal(body.code, 0);
  assert.equal(body.data.ok, true);
  assert.equal(typeof body.data.ts, 'number');

  const events = await fetch(`${base}/api/events`);
  assert.equal(events.status, 200);
  assert.deepEqual(await events.json(), { code: 0, data: [] });
  const trip = await fetch(`${base}/api/trip`);
  assert.equal(trip.status, 404);
  assert.equal((await trip.json()).code, 404);
  const dataDir = path.join(dir, '.run-data');
  assert.deepEqual(JSON.parse(await readFile(path.join(dataDir, 'events.json'), 'utf8')), []);
  assert.equal(JSON.parse(await readFile(path.join(dataDir, 'trip.json'), 'utf8')), null);
  assert.ok(JSON.parse(await readFile(path.join(dataDir, 'places.json'), 'utf8')).length > 0);
});

test('production entry exits before binding or seeding when auth is absent or bypass requested', { timeout: 15000 }, async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'time-master-fail-closed-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const serverDir = path.join(root, 'server');
  await cp(serverDir, path.join(dir, 'server'), { recursive: true, filter: source => !path.basename(source).startsWith('.env') });
  await writeFile(path.join(dir, 'package.json'), '{"type":"module"}\n');
  await symlink(path.join(root, 'node_modules'), path.join(dir, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  for (const extra of [{}, { AUTH_DISABLED: 'true' }]) {
    const child = fork(path.join(dir, 'server/index.js'), [], {
      cwd: dir, execArgv: [], stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      env: { NODE_ENV: 'production', PORT: '0', DATA_DIR: path.join(dir, 'data'), ...extra },
    });
    let stderr = '';
    child.stderr.on('data', chunk => stderr += chunk);
    const exitCode = await new Promise((resolve, reject) => { child.once('exit', resolve); child.once('error', reject); });
    assert.notEqual(exitCode, 0);
    assert.match(stderr, /AUTH_PASSWORD_HASH|AUTH_DISABLED/);
    await assert.rejects(readFile(path.join(dir, 'data/trip.json')), { code: 'ENOENT' });
  }
});
