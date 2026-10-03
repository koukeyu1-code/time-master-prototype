import assert from 'node:assert/strict';
import { after, afterEach, beforeEach, mock, test } from 'node:test';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import dotenv from 'dotenv';
import { createStore, db } from '../server/store/db.js';

const envKeys = ['LARK_CLI_BIN', 'LARK_PROFILE', 'AGENDA_HOURS'];
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
const originalExecFile = childProcess.execFile;
let stdout;
let failure;

// Install a fresh function before importing feishu: execFile's own promisify hook
// otherwise retains the real executable. No test ever launches lark-cli.
const execute = mock.fn(async () => {
  if (failure) throw failure;
  return { stdout, stderr: '' };
});
function fakeExecFile() {
  throw new Error('Tests expect the promisified execFile interface');
}
fakeExecFile[promisify.custom] = execute;
childProcess.execFile = fakeExecFile;
syncBuiltinESMExports();
for (const key of envKeys) delete process.env[key];
const { fetchAgenda, getEventDetail, healthCheck, normalizeEvent, syncAgenda } =
  await import('../server/services/feishu.js');

beforeEach(() => {
  for (const key of envKeys) delete process.env[key];
  stdout = JSON.stringify({ ok: true, data: [] });
  failure = null;
  execute.mock.resetCalls();
});
afterEach(() => {
  for (const key of envKeys) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});
after(() => {
  childProcess.execFile = originalExecFile;
  syncBuiltinESMExports();
});

const startISO = '2026-10-01T00:00:00.000Z';
const endISO = '2026-10-02T00:00:00.000Z';
function lastCall() {
  return execute.mock.calls.at(-1).arguments;
}
function assertWindow(hours, now) {
  const [, args] = lastCall();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  assert.equal(args[args.indexOf('--start') + 1], start.toISOString());
  assert.equal(args[args.indexOf('--end') + 1], new Date(now + hours * 3600000).toISOString());
}
function mockStore(t) {
  return {
    events: t.mock.method(db, 'updateEvents', async (updater) => updater([])),
    settings: t.mock.method(db, 'updateSettings', async (updater) => updater({ sync: { mode: 'polling' } })),
  };
}

test('agenda uses default binary, no profile, exact args and execution limits', async () => {
  const data = [{ event_id: 'fixture-event' }];
  stdout = JSON.stringify({ ok: true, data });
  assert.deepEqual(await fetchAgenda(startISO, endISO), data);
  assert.deepEqual(lastCall(), [
    'lark-cli',
    ['calendar', '+agenda', '--format', 'json', '--start', startISO, '--end', endISO],
    { maxBuffer: 16 * 1024 * 1024, timeout: 30000, windowsHide: true },
  ]);
});

test('dotenv loaded after module import configures binary, profile and agenda hours', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'time-master-env-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const envFile = path.join(dir, '.env');
  await writeFile(envFile, 'LARK_CLI_BIN="/fixture/bin/lark cli"\nLARK_PROFILE="test profile"\nAGENDA_HOURS=48\n');
  const loaded = dotenv.config({ path: envFile });
  assert.ifError(loaded.error);
  const now = new Date('2026-10-01T12:34:00Z').getTime();
  t.mock.timers.enable({ apis: ['Date'], now });
  mockStore(t);
  await syncAgenda();
  assert.equal(lastCall()[0], '/fixture/bin/lark cli');
  assert.deepEqual(lastCall()[1].slice(-2), ['--profile', 'test profile']);
  assertWindow(48, now);
});

test('detail and health reread binary and profile for each call', async () => {
  process.env.LARK_CLI_BIN = '/fixture/lark-one';
  process.env.LARK_PROFILE = 'first profile';
  stdout = JSON.stringify({ ok: true, data: { id: 'event-1' } });
  assert.deepEqual(await getEventDetail('calendar-1', 'event-1'), JSON.parse(stdout));
  assert.deepEqual(lastCall().slice(0, 2), [
    '/fixture/lark-one',
    ['calendar', '+get', '--calendar-id', 'calendar-1', '--event-id', 'event-1', '--format', 'json', '--profile', 'first profile'],
  ]);
  process.env.LARK_CLI_BIN = '/fixture/lark-two';
  process.env.LARK_PROFILE = 'second profile';
  stdout = JSON.stringify({ brand: 'feishu', identities: { user: { available: true, userName: 'Fixture User', tokenStatus: 'valid' } } });
  assert.deepEqual(await healthCheck(), { ok: true, brand: 'feishu', userName: 'Fixture User', tokenStatus: 'valid' });
  assert.deepEqual(lastCall().slice(0, 2), ['/fixture/lark-two', ['auth', 'status', '--profile', 'second profile']]);
});

test('empty binary and profile retain defaults', async () => {
  process.env.LARK_CLI_BIN = '';
  process.env.LARK_PROFILE = '';
  await fetchAgenda(startISO, endISO);
  assert.equal(lastCall()[0], 'lark-cli');
  assert.equal(lastCall()[1].includes('--profile'), false);
});

test('agenda without data returns an empty list', async () => {
  stdout = '{"ok":true}';
  assert.deepEqual(await fetchAgenda(startISO, endISO), []);
});

test('agenda rejects CLI business errors', async () => {
  stdout = '{"ok":false,"error":"permission denied"}';
  await assert.rejects(fetchAgenda(startISO, endISO), /lark-cli 业务错误:.*permission denied/);
});

test('agenda rejects malformed CLI JSON', async () => {
  stdout = 'not json';
  await assert.rejects(fetchAgenda(startISO, endISO), SyntaxError);
});

for (const [label, fields, expected] of [
  ['stderr', { stderr: 'fixture stderr', stdout: 'fixture stdout' }, 'fixture stderr'],
  ['stdout', { stdout: 'fixture stdout' }, 'fixture stdout'],
  ['message', {}, 'fixture spawn failure'],
]) {
  test(`CLI failure surfaces ${label}`, async () => {
    failure = Object.assign(new Error('fixture spawn failure'), fields);
    await assert.rejects(fetchAgenda(startISO, endISO), { message: `lark-cli 执行失败: ${expected}` });
  });
}

test('health returns a failure object when executable is missing', async () => {
  failure = new Error('spawn fixture-lark ENOENT');
  assert.deepEqual(await healthCheck(), { ok: false, error: 'lark-cli 执行失败: spawn fixture-lark ENOENT' });
});

test('health does not mark an unavailable identity as connected', async () => {
  stdout = JSON.stringify({ identities: { user: { available: false } } });
  assert.equal((await healthCheck()).ok, false);
});

for (const [label, value, explicitHours, expectedHours] of [
  ['unset hours default to 24', undefined, undefined, 24],
  ['empty hours default to 24', '', undefined, 24],
  ['environment overrides default hours', '36', undefined, 36],
  ['explicit hours override environment', '36', 6, 6],
]) {
  test(`sync: ${label}`, async (t) => {
    if (value !== undefined) process.env.AGENDA_HOURS = value;
    const now = new Date('2026-10-01T12:34:00Z').getTime();
    t.mock.timers.enable({ apis: ['Date'], now });
    const store = mockStore(t);
    const raw = { event_id: 'event-fixture', summary: 'Fixture meeting', start_time: { datetime: startISO }, end_time: { datetime: endISO } };
    stdout = JSON.stringify({ ok: true, data: [raw] });
    const result = await syncAgenda(explicitHours);
    assertWindow(expectedHours, now);
    assert.equal(result[0].id, 'event-fixture');
    assert.deepEqual(await store.events.mock.calls[0].result, result);
    assert.deepEqual(await store.settings.mock.calls[0].result, { sync: { mode: 'polling', lastSyncAt: new Date(now).toTimeString().slice(0, 5) } });
  });
}

test('sync does not persist a failed CLI response', async (t) => {
  const store = mockStore(t);
  failure = new Error('fixture failure');
  await assert.rejects(syncAgenda(), /fixture failure/);
  assert.equal(store.events.mock.callCount(), 0);
  assert.equal(store.settings.mock.callCount(), 0);
});

test('normalization preserves identity and marks an online meeting', () => {
  const raw = { event_id: 'online-fixture', summary: 'Online fixture', start_time: { datetime: startISO }, end_time: { datetime: endISO }, vchat: { meeting_url: 'https://example.invalid/meeting' } };
  const result = normalizeEvent(raw);
  assert.equal(result.id, raw.event_id);
  assert.equal(result.title, raw.summary);
  assert.equal(result.startISO, startISO);
  assert.equal(result.endISO, endISO);
  assert.equal(result.type, 'meeting');
  assert.equal(result.status, 'online');
  assert.equal(result.meetingUrl, raw.vchat.meeting_url);
  assert.equal(result.raw, raw);
});

test('normalization handles missing optional fields and unresolved locations', () => {
  const empty = normalizeEvent({ id: 'empty-fixture' });
  assert.equal(empty.id, 'empty-fixture');
  assert.equal(empty.title, '(无主题)');
  assert.equal(empty.start, null);
  assert.equal(empty.end, null);
  assert.equal(empty.type, 'personal');
  assert.equal(empty.status, 'pending');
  const visit = normalizeEvent({ id: 'visit-fixture', summary: '客户拜访', location: { address: 'Fixture address' } });
  assert.equal(visit.locationRaw, 'Fixture address');
  assert.equal(visit.type, 'visit');
  assert.equal(visit.status, 'pending');
  assert.equal(visit.placeId, null);
});

// These tests use only fresh temporary data; the CLI remains mocked above.
test('a slow agenda refresh preserves a concurrent local location and settings correction', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'time-master-sync-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = createStore(dir, { logger: {} });
  await store.ensureSeed();
  await store.saveEvents([{ id: 'event-fixture', placeId: null, status: 'pending' }]);
  t.mock.method(db, 'updateEvents', store.updateEvents);
  t.mock.method(db, 'updateSettings', store.updateSettings);
  let release;
  let announce;
  const blocked = new Promise((resolve) => { release = resolve; });
  const started = new Promise((resolve) => { announce = resolve; });
  execute.mock.mockImplementationOnce(async () => {
    announce();
    await blocked;
    return { stdout: JSON.stringify({ ok: true, data: [{ event_id: 'event-fixture', summary: 'Updated remote title' }] }), stderr: '' };
  });
  const syncing = syncAgenda();
  await started;
  await store.updateEvents((events) => events.map((event) => ({ ...event, placeId: 'local-place', locationRaw: 'Corrected location', status: 'ok' })));
  await store.updateSettings((settings) => ({ ...settings, reminderLeadMin: 42, sync: { ...settings.sync, intervalMin: 19 } }));
  release();
  const result = await syncing;
  assert.equal(result[0].title, 'Updated remote title');
  assert.equal(result[0].placeId, 'local-place');
  assert.equal(result[0].locationRaw, 'Corrected location');
  assert.equal(result[0].status, 'ok');
  assert.deepEqual(await store.getEvents(), result);
  const settings = await store.getSettings();
  assert.equal(settings.reminderLeadMin, 42);
  assert.equal(settings.sync.intervalMin, 19);
  assert.ok(settings.sync.lastSyncAt);
});
