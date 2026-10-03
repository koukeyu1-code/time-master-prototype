import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const run = promisify(execFile);
const customPoi = {
  key: 'amap:fixture-stop', name: '测试观景台', type: 'scenic',
  lng: 101.91, lat: 36.71, altitude: 2800, stayMin: 45,
  note: '仅用于隔离测试', photos: [], source: 'amap',
};
const otherPoi = { ...customPoi, key: 'ctrip:fixture-stop', name: '第二天测试景点', lng: 100.6, source: 'ctrip_mock' };
const firstStops = ['xining', customPoi, 'huzhu'];
const firstKeys = ['xining', customPoi.key, 'huzhu'];

const mockAmap = `
  export const calls = [];
  export async function planDriving(from, to) {
    calls.push([from, to]);
    await new Promise(resolve => setImmediate(resolve));
    return { distanceKm: 10, durationMin: 20, steps: [] };
  }
  export async function getWeather() { return null; }
  export async function poiSearch() { return []; }
  export async function placeAround() { return [${JSON.stringify(customPoi)}]; }
`;

// Run the real trip builder and JSON store, but only in a temporary source/data
// tree with deterministic provider modules. No user data, .env, CLI or API access.
async function fixture(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'time-master-trip-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  for (const file of ['server/services/tripBuilder.js', 'server/data/qingganPois.mjs', 'server/store/db.js', 'server/store/seed.js']) {
    await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
    await copyFile(path.join(root, file), path.join(dir, file));
  }
  await writeFile(path.join(dir, 'package.json'), '{"type":"module"}\n');
  await writeFile(path.join(dir, 'server/services/amap.js'), mockAmap);
  await writeFile(path.join(dir, 'server/data/ctripProvider.mjs'), 'export async function searchCtripNearby() { return []; }\n');
  const dataDir = path.join(dir, 'isolated-data');
  return { dir, dataDir, tripFile: path.join(dataDir, 'trip.json') };
}

async function load(t, f) {
  // Advance only Date.now so the production API limiter doesn't slow mock calls.
  let time = Date.now();
  t.mock.method(Date, 'now', () => time += 1000);
  const store = await import(pathToFileURL(path.join(f.dir, 'server/store/db.js')));
  await store.ensureSeed(f.dataDir);
  const builderUrl = pathToFileURL(path.join(f.dir, 'server/services/tripBuilder.js'));
  const builder = await import(builderUrl);
  const providers = await import(pathToFileURL(path.join(f.dir, 'server/services/amap.js')));
  return { ...builder, ...store, providers, builderUrl };
}

function topology(day) {
  return [day.legs[0]?.from.key, ...day.legs.map(leg => leg.to.key)];
}

async function seed(api) {
  const days = [
    await api.buildOneDay(['xining', 'huzhu'], { preset: 'relaxed10', dayNumber: 1, date: '2026-10-01' }),
    await api.buildOneDay(['huzhu', 'chaka'], { preset: 'relaxed10', dayNumber: 2, date: '2026-10-02' }),
  ];
  return api.db.saveTrip({
    id: 'fixture-trip', preset: 'relaxed10', startDate: '2026-10-01', totalDays: 2,
    customStops: {}, days, summary: { totalKm: 20, drivingHours: 0.7, stayHours: 0, highestAlt: 3100, averageDailyKm: 10 },
  });
}

test('dynamic selection survives a fresh module and does not use process-global POIs', async (t) => {
  const f = await fixture(t);
  const api = await load(t, f);
  await seed(api);
  const updated = await api.updateDayStops(1, firstStops);
  assert.deepEqual(updated.customStops['1'], firstKeys);
  assert.equal(updated.customPois[customPoi.key].lng, customPoi.lng);
  assert.equal(updated.customPois[customPoi.key].name, customPoi.name);
  assert.deepEqual(topology(updated.days[0]), firstKeys);

  const catalog = await import(pathToFileURL(path.join(f.dir, 'server/data/qingganPois.mjs')));
  assert.equal(catalog.getPoi(customPoi.key), null);
  const fresh = await import(`${api.builderUrl}?restart=1`);
  const recalculated = await fresh.recalcDay(1);
  assert.deepEqual(topology(recalculated.days[0]), firstKeys);
  assert.equal(recalculated.days[0].legs.length, 2);
  assert.deepEqual(recalculated.days[0].stops.filter(stop => stop.poi).map(stop => stop.poi.key), firstKeys);
  assert.equal(recalculated.days[0].totalStayMin, 45);

  // Replacing the stored trip cannot accidentally resolve a previous trip's POI.
  await seed(api);
  await assert.rejects(api.updateDayStops(1, firstKeys), /无法解析 POI/);
});

test('dynamic add -> process exit -> fresh process recalc retains route and snapshots', async (t) => {
  const f = await fixture(t);
  const runner = path.join(f.dir, 'restart-runner.mjs');
  await writeFile(runner, `
    import assert from 'node:assert/strict';
    import { db, ensureSeed } from './server/store/db.js';
    import { buildOneDay, updateDayStops, recalcDay } from './server/services/tripBuilder.js';
    const forbidden = () => { throw new Error('External API calls are forbidden in trip tests'); };
    globalThis.fetch = forbidden;
    let now = Date.now();
    Date.now = () => now += 1000;
    await ensureSeed(${JSON.stringify(f.dataDir)});
    if (process.argv[2] === 'add') {
      const day = await buildOneDay(['xining', 'huzhu'], { preset: 'relaxed10', dayNumber: 1, date: '2026-10-01' });
      await db.saveTrip({ id: 'restart-fixture', preset: 'relaxed10', startDate: '2026-10-01', totalDays: 1, days: [day] });
      await updateDayStops(1, ${JSON.stringify(firstStops)});
    } else {
      const trip = await recalcDay(1);
      assert.deepEqual(trip.customStops['1'], ${JSON.stringify(firstKeys)});
      assert.deepEqual([trip.days[0].legs[0].from.key, ...trip.days[0].legs.map(leg => leg.to.key)], ${JSON.stringify(firstKeys)});
      assert.equal(trip.days[0].stops.find(stop => stop.poi?.key === ${JSON.stringify(customPoi.key)}).poi.name, ${JSON.stringify(customPoi.name)});
    }
  `);
  const env = { NODE_ENV: 'test' };
  for (const key of ['PATH', 'SystemRoot', 'WINDIR', 'TMP', 'TEMP']) if (process.env[key]) env[key] = process.env[key];
  await run(process.execPath, [runner, 'add'], { cwd: f.dir, env, timeout: 15000 });
  const before = JSON.parse(await readFile(f.tripFile, 'utf8'));
  await run(process.execPath, [runner, 'recalc'], { cwd: f.dir, env, timeout: 15000 });
  const after = JSON.parse(await readFile(f.tripFile, 'utf8'));
  assert.deepEqual(topology(before.days[0]), topology(after.days[0]));
  assert.deepEqual(before.customPois, after.customPois);
});

test('legacy trips recover selected custom POIs from saved stops or leg endpoints', async (t) => {
  const f = await fixture(t);
  const api = await load(t, f);
  await seed(api);
  await api.updateDayStops(1, firstStops);
  const legacy = await api.db.getTrip();
  delete legacy.customPois;
  await api.db.saveTrip(legacy);
  const fresh = await import(`${api.builderUrl}?legacy=1`);
  const recovered = await fresh.recalcDay(1);
  assert.deepEqual(topology(recovered.days[0]), firstKeys);
  assert.equal(recovered.customPois[customPoi.key].stayMin, 45);

  // Very old trips can lack customStops and omit scenic UI stops, while still
  // retaining the full connected route and POIs inside leg endpoints.
  delete legacy.customStops;
  legacy.days[0].stops = legacy.days[0].stops.filter(stop => stop.poi?.key !== customPoi.key);
  await api.db.saveTrip(legacy);
  const fromLegs = await fresh.recalcDay(1);
  assert.deepEqual(topology(fromLegs.days[0]), firstKeys);
  assert.equal(fromLegs.customPois[customPoi.key].name, customPoi.name);
});

test('unknown keys fail before provider calls and never overwrite the saved itinerary', async (t) => {
  const f = await fixture(t);
  const api = await load(t, f);
  await seed(api);
  const original = await readFile(f.tripFile, 'utf8');
  const calls = api.providers.calls.length;
  await assert.rejects(api.updateDayStops(1, ['xining', 'amap:missing', 'huzhu']), /无法解析 POI/);
  assert.equal(await readFile(f.tripFile, 'utf8'), original);
  assert.equal(api.providers.calls.length, calls);

  const unresolved = await api.db.getTrip();
  unresolved.customStops = { 1: ['xining', 'amap:missing', 'huzhu'] };
  await api.db.saveTrip(unresolved);
  const beforeRecalc = await readFile(f.tripFile, 'utf8');
  await assert.rejects(api.recalcDay(1), /无法解析 POI/);
  assert.equal(await readFile(f.tripFile, 'utf8'), beforeRecalc);
  assert.equal(api.providers.calls.length, calls);

  unresolved.customStops = { 1: ['xining'] };
  await api.db.saveTrip(unresolved);
  await assert.rejects(api.recalcDay(1), /至少 2/);
});

test('invalid custom POI data and builtin overrides are rejected without writes', async (t) => {
  const f = await fixture(t);
  const api = await load(t, f);
  await seed(api);
  const original = await readFile(f.tripFile, 'utf8');
  const invalid = [
    null, {}, 17, [], { ...customPoi, key: '__proto__' }, { ...customPoi, key: 'constructor' },
    { ...customPoi, key: 'prototype' }, { ...customPoi, key: 'toString' }, { ...customPoi, key: 'bad key' },
    { ...customPoi, name: '  ' }, { ...customPoi, name: 123 },
    { ...customPoi, lng: NaN }, { ...customPoi, lng: Infinity }, { ...customPoi, lng: 181 },
    { ...customPoi, lat: -91 }, { ...customPoi, lat: '36.7' },
    { ...customPoi, altitude: Infinity }, { ...customPoi, stayMin: -10 },
    { ...customPoi, type: 'script' }, { ...customPoi, photos: [{}] },
    { ...customPoi, note: { script: 'bad' } }, { ...customPoi, unexpected: true },
    JSON.parse(JSON.stringify(customPoi).replace('"key":', '"__proto__":{"polluted":true},"key":')),
    Object.assign(Object.create({ polluted: true }), customPoi),
    { key: 'xining', name: 'changed built-in', lng: 0, lat: 0 },
  ];
  for (const poi of invalid) {
    await assert.rejects(api.updateDayStops(1, ['xining', poi, 'huzhu']), /POI/);
    assert.equal(await readFile(f.tripFile, 'utf8'), original);
  }
  assert.equal({}.polluted, undefined);
  const calls = api.providers.calls.length;
  for (const day of [0, 3, 1.5, 'bad']) await assert.rejects(api.updateDayStops(day, firstStops), /day 越界/);
  assert.equal(api.providers.calls.length, calls);
  assert.equal(await readFile(f.tripFile, 'utf8'), original);

  const poisoned = await api.db.getTrip();
  poisoned.customPois = { xining: { ...customPoi, key: 'xining' } };
  await api.db.saveTrip(poisoned);
  const saved = await readFile(f.tripFile, 'utf8');
  await assert.rejects(api.recalcDay(1), /不能覆盖内置 POI/);
  assert.equal(await readFile(f.tripFile, 'utf8'), saved);
});

test('concurrent separate-day updates and recalc retain both changes and correct summary', async (t) => {
  const f = await fixture(t);
  const api = await load(t, f);
  await seed(api);
  const secondKeys = ['huzhu', otherPoi.key, 'chaka'];
  await Promise.all([
    api.updateDayStops(1, firstStops),
    api.updateDayStops(2, ['huzhu', otherPoi, 'chaka']),
    api.recalcDay(1),
  ]);
  const saved = await api.db.getTrip();
  assert.deepEqual(topology(saved.days[0]), firstKeys);
  assert.deepEqual(topology(saved.days[1]), secondKeys);
  assert.deepEqual(saved.customStops, { 1: firstKeys, 2: secondKeys });
  assert.deepEqual(Object.keys(saved.customPois).sort(), [customPoi.key, otherPoi.key].sort());
  assert.equal(saved.summary.totalKm, 40);
  assert.equal(saved.summary.drivingHours, 1.3);
  assert.equal(saved.summary.stayHours, 1.5);
});

test('build, edit and recalc share the trip queue; builtin-only trips stay usable', async (t) => {
  const f = await fixture(t);
  const api = await load(t, f);
  await Promise.all([
    api.buildTrip({ preset: 'xining2dunhuang', startDate: '2026-10-01' }),
    api.updateDayStops(1, firstStops),
    api.recalcDay(1),
  ]);
  const saved = await api.db.getTrip();
  assert.equal(saved.totalDays, 5);
  assert.deepEqual(topology(saved.days[0]), firstKeys);
  assert.equal(saved.customPois[customPoi.key].name, customPoi.name);

  const builtin = await api.buildTrip({ preset: 'classic7', startDate: '2026-10-01' });
  assert.equal(builtin.totalDays, 7);
  assert.deepEqual(builtin.customPois, {});
  const recalculated = await api.recalcDay(2);
  assert.deepEqual(topology(recalculated.days[1]), topology(builtin.days[1]));
  const before = await readFile(f.tripFile, 'utf8');
  assert.equal(await api.recalcDay(99), null);
  assert.equal(await readFile(f.tripFile, 'utf8'), before);
});

test('nearby search is read-only and full provider selections can be saved', async (t) => {
  const f = await fixture(t);
  const api = await load(t, f);
  await seed(api);
  const original = await readFile(f.tripFile, 'utf8');
  const nearby = await api.getNearbyAttractions(1);
  const found = nearby.find(poi => poi.key === customPoi.key);
  assert.ok(found);
  assert.equal(await readFile(f.tripFile, 'utf8'), original);
  // Search alone does not create an ephemeral key registry.
  await assert.rejects(api.updateDayStops(1, firstKeys), /无法解析 POI/);
  const saved = await api.updateDayStops(1, ['xining', found, 'huzhu']);
  assert.deepEqual(topology(saved.days[0]), firstKeys);
});
