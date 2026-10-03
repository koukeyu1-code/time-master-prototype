import assert from 'node:assert/strict';
import { test } from 'node:test';
import { promises as fs } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { createStore } from '../server/store/db.js';

async function fixture(t, options = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'time-master-store-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const messages = [];
  const logger = Object.fromEntries(['info', 'warn', 'error'].map((level) => [level, (message) => messages.push({ level, message })]));
  const store = createStore(dir, { logger, ...options });
  await store.ensureSeed();
  return { dir, store, messages, file: (name) => path.join(dir, name) };
}

const gate = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
const failure = () => Object.assign(new Error('Injected disk failure'), { code: 'EIO' });

test('factory requires explicit initialization, seeds once and preserves null trips', async (t) => {
  const { dir, store, file } = await fixture(t);
  const second = createStore(dir, { logger: {} });
  await assert.rejects(second.getTrip(), /not initialized/);
  await second.ensureSeed();
  assert.equal(await second.getTrip(), null);
  assert.ok((await second.getPlaces()).length > 0);
  assert.deepEqual(await second.getEvents(), []);
  await store.savePlaces([]);
  await store.saveTrip(null);
  await second.ensureSeed();
  assert.deepEqual(await store.getPlaces(), []);
  assert.equal(JSON.parse(await fs.readFile(file('trip.json'), 'utf8')), null);
  assert.ok((await fs.stat(file('.store-initialized'))).isFile());
});

test('singleton resolves DATA_DIR when initialized after dotenv, not at import time', async (t) => {
  const { dir } = await fixture(t);
  const envPath = path.join(dir, 'fixture.env');
  await fs.writeFile(envPath, `DATA_DIR=${dir}\n`);
  const moduleUrl = new URL('../server/store/db.js', import.meta.url).href;
  const script = `
    import assert from 'node:assert/strict';
    import dotenv from 'dotenv';
    import { db, ensureSeed } from ${JSON.stringify(moduleUrl)};
    await assert.rejects(db.getTrip(), /not initialized/);
    dotenv.config({ path: ${JSON.stringify(envPath)}, override: true });
    await ensureSeed();
    await db.saveTrip({ id: 'late-dotenv' });
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: path.resolve('.'), env: { ...process.env, DATA_DIR: path.join(dir, 'wrong-at-import') }, encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(await fs.readFile(path.join(dir, 'trip.json'), 'utf8')).id, 'late-dotenv');
  await assert.rejects(fs.stat(path.join(dir, 'wrong-at-import')), { code: 'ENOENT' });
});

test('parallel place inserts, updates and deletion do not lose each other', async (t) => {
  const { store } = await fixture(t);
  await store.savePlaces([{ id: 'remove', alias: 'Remove' }, { id: 'keep', alias: 'Keep' }]);
  await Promise.all([
    ...Array.from({ length: 25 }, (_, i) => store.upsertPlace({ id: `p${i}`, alias: `Place ${i}` })),
    store.updatePlaces((list) => list.filter((place) => place.id !== 'remove')),
    store.upsertPlace({ id: 'keep', hits: 4 }),
  ]);
  const places = await store.getPlaces();
  assert.equal(places.length, 26);
  assert.equal(places.some((place) => place.id === 'remove'), false);
  assert.deepEqual(await store.getPlaceById('keep'), { id: 'keep', alias: 'Keep', hits: 4 });
  assert.equal((await store.findPlaceByAlias('Place 2')).id, 'p2');
});

test('parallel settings patches, nested updaters, and cache writes are retained', async (t) => {
  const { store } = await fixture(t);
  await Promise.all([
    ...Array.from({ length: 20 }, (_, i) => store.saveSettings({ [`option${i}`]: i })),
    ...Array.from({ length: 20 }, (_, i) => store.setCached(i % 2 ? 'routes' : 'weather', `key${i}`, i)),
    store.updateSettings(async (settings) => ({ ...settings, sync: { ...settings.sync, intervalMin: 23 } })),
  ]);
  const settings = await store.getSettings();
  for (let i = 0; i < 20; i++) {
    assert.equal(settings[`option${i}`], i);
    assert.equal(await store.getCached(i % 2 ? 'routes' : 'weather', `key${i}`, 5), i);
  }
  assert.equal(settings.sync.intervalMin, 23);
  assert.equal(await store.getCached('weather', 'absent', 5), null);
  await store.updateCache((cache) => ({ ...cache, old: { expired: { ts: 0, data: 'old' } } }));
  assert.equal(await store.getCached('old', 'expired', 1), null);
  await store.setCached('__proto__', '__proto__', 'own-value');
  assert.equal(await store.getCached('__proto__', '__proto__', 1), 'own-value');
  assert.equal(Object.prototype.data, undefined);
});

test('parallel event inserts and location updates preserve independent changes', async (t) => {
  const { store } = await fixture(t);
  await store.saveEvents([{ id: 'target', status: 'pending' }]);
  await Promise.all([
    ...Array.from({ length: 25 }, (_, i) => store.upsertEvent({ id: `event${i}` })),
    store.updateEvents(async (events) => events.map((event) => event.id === 'target' ? { ...event, placeId: 'fixed', status: 'ok' } : event)),
    store.upsertEvent({ id: 'target', title: 'A new title' }),
  ]);
  const events = await store.getEvents();
  assert.equal(events.length, 26);
  assert.deepEqual(events.find((event) => event.id === 'target'), { id: 'target', status: 'ok', placeId: 'fixed', title: 'A new title' });
});

test('async trip updates and reads share a queue while other files can progress', async (t) => {
  const { store } = await fixture(t);
  await store.saveTrip({ id: 'trip', count: 0 });
  const entered = gate();
  const release = gate();
  const writing = store.updateTrip(async (trip) => {
    entered.resolve();
    await release.promise;
    return { ...trip, count: trip.count + 1 };
  });
  await entered.promise;
  let readFinished = false;
  const reading = store.getTrip().then((trip) => { readFinished = true; return trip; });
  await store.saveSettings({ independentFile: true });
  assert.equal(readFinished, false);
  release.resolve();
  assert.equal((await writing).count, 1);
  assert.equal((await reading).count, 1);
  await Promise.all(Array.from({ length: 30 }, () => store.updateTrip(async (trip) => {
    await new Promise((resolve) => setImmediate(resolve));
    return { ...trip, count: trip.count + 1 };
  })));
  assert.equal((await store.getTrip()).count, 31);
});

test('two store instances for the same path share the process queue', async (t) => {
  const { store, dir } = await fixture(t);
  const other = createStore(dir, { logger: {} });
  await other.ensureSeed();
  await store.saveTrip({ count: 0 });
  await Promise.all(Array.from({ length: 20 }, (_, i) => (i % 2 ? store : other).updateTrip(async (trip) => {
    await new Promise((resolve) => setImmediate(resolve));
    trip.count++;
    return trip;
  })));
  assert.equal((await store.getTrip()).count, 20);
});

test('failed or invalid updaters never persist mutations or poison the queue', async (t) => {
  const { store } = await fixture(t);
  await store.saveTrip({ id: 'original' });
  await assert.rejects(store.updateTrip((trip) => { trip.id = 'unsaved'; throw new Error('cancel'); }), /cancel/);
  assert.equal(await store.updateTrip((trip) => { trip.id = 'discarded'; return undefined; }), undefined);
  await assert.rejects(store.saveTrip([]), /Invalid data shape/);
  assert.deepEqual(await store.getTrip(), { id: 'original' });
  await store.updateTrip((trip) => ({ ...trip, next: true }));
  assert.deepEqual(await store.getTrip(), { id: 'original', next: true });
});

for (const damaged of ['corrupt', 'missing', 'wrong shape']) {
  test(`a ${damaged} primary restores the previous verified JSON backup and logs recovery`, async (t) => {
    const { store, file, messages } = await fixture(t);
    await store.saveTrip({ id: 'previous' });
    await store.updateTrip((trip) => { trip.id = 'newest'; return trip; });
    assert.deepEqual(JSON.parse(await fs.readFile(file('trip.json.bak'), 'utf8')), { id: 'previous' });
    if (damaged === 'missing') await fs.unlink(file('trip.json'));
    else await fs.writeFile(file('trip.json'), damaged === 'corrupt' ? '{broken' : '[]');
    assert.deepEqual(await store.getTrip(), { id: 'previous' });
    assert.deepEqual(JSON.parse(await fs.readFile(file('trip.json'), 'utf8')), { id: 'previous' });
    assert.ok(messages.some(({ level, message }) => level === 'warn' && message.includes('Recovering') && message.includes('may be lost')));
  });
}

test('legacy JSON without backups is adopted without changing data', async (t) => {
  const { store, dir, file, messages } = await fixture(t);
  await store.saveTrip({ id: 'legacy' });
  for (const entry of await fs.readdir(dir)) if (entry.endsWith('.bak') || entry === '.store-initialized') await fs.unlink(file(entry));
  const adopting = createStore(dir, { logger: { warn: (message) => messages.push({ level: 'warn', message }) } });
  await adopting.ensureSeed();
  assert.deepEqual(await adopting.getTrip(), { id: 'legacy' });
  assert.deepEqual(JSON.parse(await fs.readFile(file('trip.json.bak'), 'utf8')), { id: 'legacy' });
  assert.ok(messages.some(({ message }) => message.includes('Rebuilding')));
});

test('a corrupt backup is repaired only from a verified good primary', async (t) => {
  const { store, dir, file } = await fixture(t);
  await store.saveTrip({ id: 'good-primary' });
  await fs.writeFile(file('trip.json.bak'), 'not-json');
  const warnings = [];
  const restarting = createStore(dir, { logger: { warn: (message) => warnings.push(message) } });
  await restarting.ensureSeed();
  assert.deepEqual(JSON.parse(await fs.readFile(file('trip.json.bak'), 'utf8')), { id: 'good-primary' });
  assert.ok(warnings.some((message) => message.includes('invalid backup')));
});

for (const damage of ['corrupt', 'missing']) {
  test(`${damage} primary and backup fail closed, without reseeding or rewriting`, async (t) => {
    const { store, dir, file, messages } = await fixture(t);
    if (damage === 'missing') {
      await fs.unlink(file('events.json'));
      await fs.unlink(file('events.json.bak'));
    } else {
      await fs.writeFile(file('events.json'), '{broken primary');
      await fs.writeFile(file('events.json.bak'), '{broken backup');
    }
    await assert.rejects(store.getEvents(), { code: 'STORE_DATA_UNAVAILABLE' });
    await assert.rejects(store.upsertEvent({ id: 'unsafe' }), /refusing to reset/);
    await assert.rejects(createStore(dir, { logger: {} }).ensureSeed(), /refusing to reset/);
    if (damage === 'missing') await assert.rejects(fs.stat(file('events.json')), { code: 'ENOENT' });
    else assert.equal(await fs.readFile(file('events.json'), 'utf8'), '{broken primary');
    assert.ok(messages.some(({ level }) => level === 'error'));
  });
}

test('an initialized directory with all JSON files missing is never treated as a fresh install', async (t) => {
  const { dir, file } = await fixture(t);
  for (const entry of await fs.readdir(dir)) if (entry.endsWith('.json') || entry.endsWith('.bak')) await fs.unlink(file(entry));
  await assert.rejects(createStore(dir, { logger: {} }).ensureSeed(), /refusing to reset/);
  assert.deepEqual(await fs.readdir(dir), ['.store-initialized']);
});

for (const stage of ['temp write', 'temp fsync', 'backup rename', 'primary rename']) {
  test(`failure during ${stage} preserves the previous primary and clears temp files`, async (t) => {
    let failWrites = false;
    const injectedFs = {
      ...fs,
      async open(file, flags, mode) {
        const handle = await fs.open(file, flags, mode);
        if (!failWrites || flags !== 'wx' || !['temp write', 'temp fsync'].includes(stage)) return handle;
        return {
          writeFile: stage === 'temp write' ? async () => { await handle.writeFile('{partial'); throw failure(); } : handle.writeFile.bind(handle),
          sync: stage === 'temp fsync' ? async () => { throw failure(); } : handle.sync.bind(handle),
          close: handle.close.bind(handle),
        };
      },
      async rename(source, target) {
        if (failWrites && ((stage === 'backup rename' && target.endsWith('trip.json.bak')) ||
          (stage === 'primary rename' && target.endsWith('trip.json')))) throw failure();
        return fs.rename(source, target);
      },
    };
    const { store, dir, file } = await fixture(t, { fs: injectedFs });
    await store.saveTrip({ id: 'previous' });
    const before = await fs.readFile(file('trip.json'), 'utf8');
    failWrites = true;
    await assert.rejects(store.saveTrip({ id: 'failed' }), { code: 'EIO' });
    assert.equal(await fs.readFile(file('trip.json'), 'utf8'), before);
    assert.deepEqual(await store.getTrip(), { id: 'previous' });
    assert.equal((await fs.readdir(dir)).some((entry) => entry.endsWith('.tmp')), false);
    failWrites = false;
    await store.saveTrip({ id: 'recovered' });
    assert.deepEqual(await store.getTrip(), { id: 'recovered' });
  });
}

test('primary read permission errors are surfaced rather than replaced with a backup', async (t) => {
  let deny = false;
  const injectedFs = { ...fs, async readFile(file, ...args) {
    if (deny && file.endsWith('trip.json')) throw Object.assign(new Error('Permission denied'), { code: 'EACCES' });
    return fs.readFile(file, ...args);
  } };
  const { store, file, messages } = await fixture(t, { fs: injectedFs });
  await store.saveTrip({ id: 'private' });
  deny = true;
  await assert.rejects(store.getTrip(), { code: 'EACCES' });
  assert.deepEqual(JSON.parse(await fs.readFile(file('trip.json'), 'utf8')), { id: 'private' });
  assert.ok(messages.some(({ level, message }) => level === 'error' && message.includes('not reset')));
});

test('a backup read error fails recovery and leaves both originals untouched', async (t) => {
  let deny = false;
  const injectedFs = { ...fs, async readFile(file, ...args) {
    if (deny && file.endsWith('trip.json.bak')) throw Object.assign(new Error('Permission denied'), { code: 'EACCES' });
    return fs.readFile(file, ...args);
  } };
  const { store, file } = await fixture(t, { fs: injectedFs });
  await store.saveTrip({ id: 'previous' });
  await store.saveTrip({ id: 'latest' });
  await fs.writeFile(file('trip.json'), 'corrupt');
  deny = true;
  await assert.rejects(store.getTrip(), /backup EACCES/);
  assert.equal(await fs.readFile(file('trip.json'), 'utf8'), 'corrupt');
  assert.deepEqual(JSON.parse(await fs.readFile(file('trip.json.bak'), 'utf8')), { id: 'previous' });
});

test('failed recovery keeps the last-good backup intact and reports an error', async (t) => {
  let deny = false;
  const injectedFs = { ...fs, async rename(source, target) {
    if (deny && target.endsWith('trip.json')) throw failure();
    return fs.rename(source, target);
  } };
  const { store, file, messages } = await fixture(t, { fs: injectedFs });
  await store.saveTrip({ id: 'previous' });
  await store.saveTrip({ id: 'latest' });
  await fs.writeFile(file('trip.json'), 'corrupt');
  deny = true;
  await assert.rejects(store.getTrip(), /Could not restore/);
  assert.equal(await fs.readFile(file('trip.json'), 'utf8'), 'corrupt');
  assert.deepEqual(JSON.parse(await fs.readFile(file('trip.json.bak'), 'utf8')), { id: 'previous' });
  assert.ok(messages.some(({ level, message }) => level === 'error' && message.includes('Recovery failed')));
});

test('parallel location corrections share an atomic place lookup and storage errors reach Express', async (t) => {
  const { store } = await fixture(t);
  const { default: express } = await import('express');
  const { default: placesRouter } = await import('../server/routes/places.js');
  const { default: eventsRouter } = await import('../server/routes/events.js');
  const { db } = await import('../server/store/db.js');
  for (const name of Object.keys(db)) t.mock.method(db, name, store[name]);
  await store.savePlaces([{ id: 'remove-me', alias: 'Remove' }]);
  await store.saveEvents([{ id: 'first' }, { id: 'second' }]);
  const app = express();
  app.use(express.json());
  app.use('/places', placesRouter);
  app.use('/events', eventsRouter);
  app.use((error, _req, res, _next) => res.status(500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const base = `http://127.0.0.1:${server.address().port}`;
  const responses = await Promise.all([
    ...['first', 'second'].map((id) => fetch(`${base}/events/${id}/location`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ alias: 'Same new place' }),
    })),
    fetch(`${base}/places/remove-me`, { method: 'DELETE' }),
    fetch(`${base}/places`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ alias: 'Independent insert' }) }),
  ]);
  assert.deepEqual(responses.map((response) => response.status), [200, 200, 200, 201]);
  const places = await store.getPlaces();
  assert.equal(places.length, 2);
  assert.equal(places.filter((place) => place.alias === 'Same new place').length, 1);
  assert.equal(places.some((place) => place.id === 'remove-me'), false);
  const events = await store.getEvents();
  assert.equal(events[0].placeId, events[1].placeId);
  assert.ok(events.every((event) => event.status === 'ok'));
  const missing = await fetch(`${base}/events/nonexistent/location`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ alias: 'Do not create' }),
  });
  assert.equal(missing.status, 404);
  assert.equal((await store.getPlaces()).length, 2);
  t.mock.method(db, 'getPlaces', async () => { throw failure(); });
  const failed = await fetch(`${base}/places`);
  assert.equal(failed.status, 500);
  assert.deepEqual(await failed.json(), { error: 'Injected disk failure' });
});
