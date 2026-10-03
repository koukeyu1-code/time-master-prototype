/* Single-process JSON store. Keep one Node process on one persistent local volume.
   Queues are per file, not cross-file transactions or multi-process locks. */
import { promises as nodeFs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedPlaces, seedSettings } from './seed.js';

const defaultDir = fileURLToPath(new URL('../../.run-data/', import.meta.url));
const queues = new Map();
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const definitions = {
  places: { seed: seedPlaces, valid: Array.isArray },
  settings: { seed: seedSettings, valid: (value) => object(value) || Array.isArray(value) },
  cache: { seed: { weather: {}, routes: {} }, valid: object },
  events: { seed: [], valid: Array.isArray },
  trip: { seed: null, valid: (value) => value === null || object(value) },
};

function serialized(key, action) {
  const previous = queues.get(key) || Promise.resolve();
  const result = previous.then(action);
  // A rejected operation must not poison the queue or become unhandled.
  const tail = result.then(() => {}, () => {});
  queues.set(key, tail);
  tail.then(() => { if (queues.get(key) === tail) queues.delete(key); });
  return result;
}

function dataError(message, cause) {
  return Object.assign(new Error(message, { cause }), { code: 'STORE_DATA_UNAVAILABLE' });
}

/** Isolated test/store factory. fs is a promises-compatible injectable filesystem.
 * Call ensureSeed() before using the store. Updaters return the complete value,
 * may be async; undefined means no write and returns undefined (mutations discarded).
 * Do not call another operation on the same file from an updater (deadlock).
 * save* methods are explicit replacements; use update* for read/modify/write.
 */
export function createStore(dir, { fs = nodeFs, logger = console } = {}) {
  if (!dir || typeof dir !== 'string') throw new TypeError('A data directory is required');
  const root = path.resolve(dir);
  const fileFor = (name) => path.join(root, `${name}.json`);
  let initialization;
  let initialized = false;

  function report(level, message) {
    // Logging must never turn a completed rename into an apparent failed write.
    try { logger[level]?.(message); } catch { /* best-effort diagnostic */ }
  }

  function parse(name, text, file) {
    let value;
    try { value = JSON.parse(text); } catch (cause) {
      throw Object.assign(new Error(`Invalid JSON in ${file}`, { cause }), { code: 'INVALID_JSON' });
    }
    if (!definitions[name].valid(value)) {
      throw Object.assign(new Error(`Invalid data shape in ${file}`), { code: 'INVALID_JSON' });
    }
    return value;
  }

  function encode(name, value) {
    const text = JSON.stringify(value, null, 2);
    if (text === undefined) throw new TypeError(`Updater for ${name} must return a complete JSON value`);
    parse(name, text, fileFor(name));
    return `${text}\n`;
  }

  async function syncDirectory() {
    let handle;
    try {
      handle = await fs.open(root, 'r');
      await handle.sync();
    } catch (error) {
      // The rename has already committed. Reporting failure as if nothing changed
      // would invite unsafe retries; warn that power-loss durability is uncertain.
      report('warn', `[store] Rename committed, but directory fsync failed for ${root} (${error.code || error.message}); verify the persistent volume supports durable renames`);
    } finally {
      if (handle) await handle.close().catch((error) => report('warn', `[store] Directory close failed (${error.code || error.message})`));
    }
  }

  async function atomicReplace(file, text) {
    const temporary = path.join(root, `.${path.basename(file)}.${process.pid}.${randomUUID()}.tmp`);
    let handle;
    try {
      handle = await fs.open(temporary, 'wx', 0o600);
      await handle.writeFile(text, 'utf8');
      await handle.sync();
      await handle.close();
      handle = null;
      await fs.rename(temporary, file);
      await syncDirectory();
    } finally {
      if (handle) await handle.close().catch(() => {});
      await fs.unlink(temporary).catch((error) => {
        if (error.code !== 'ENOENT') report('warn', `[store] Could not remove temporary file ${temporary} (${error.code || error.message})`);
      });
    }
  }

  const recoverable = (error) => error.code === 'ENOENT' || error.code === 'INVALID_JSON';
  async function load(name) {
    const file = fileFor(name);
    try {
      const text = await fs.readFile(file, 'utf8');
      return { value: parse(name, text, file), text };
    } catch (error) {
      if (!recoverable(error)) {
        report('error', `[store] Cannot read ${file} (${error.code || error.message}); data was not reset`);
        throw error;
      }
      const backup = `${file}.bak`;
      let text;
      let value;
      try {
        text = await fs.readFile(backup, 'utf8');
        value = parse(name, text, backup);
      } catch (backupError) {
        const failure = dataError(`Cannot recover ${file}: primary ${error.code}, backup ${backupError.code || backupError.message}; refusing to reset existing data`, backupError);
        report('error', `[store] ${failure.message}`);
        throw failure;
      }
      report('warn', `[store] Recovering ${file} from last-good backup (${error.code}); the most recent change may be lost`);
      try { await atomicReplace(file, text); } catch (cause) {
        report('error', `[store] Recovery failed for ${file}; backup left intact (${cause.code || cause.message})`);
        throw dataError(`Could not restore ${file} from its last-good backup`, cause);
      }
      return { value, text };
    }
  }

  async function requireInitialization() {
    if (!initialization) throw new Error('Store is not initialized; await ensureSeed() before use');
    await initialization;
  }

  async function read(name) {
    await requireInitialization();
    return serialized(fileFor(name), async () => (await load(name)).value);
  }

  async function update(name, updater) {
    if (typeof updater !== 'function') throw new TypeError('A store updater function is required');
    await requireInitialization();
    return serialized(fileFor(name), async () => {
      const { value, text: previous } = await load(name);
      const next = await updater(value);
      if (next === undefined) return undefined;
      const text = encode(name, next);
      // Preserve the verified old contents first; never copy a corrupt primary.
      await atomicReplace(`${fileFor(name)}.bak`, previous);
      await atomicReplace(fileFor(name), text);
      return JSON.parse(text);
    });
  }

  const store = {
    dataDir: root,
    async ensureSeed() {
      if (initialized) return store;
      if (!initialization) {
        initialization = serialized(path.join(root, '.initialize'), async () => {
          await fs.mkdir(root, { recursive: true });
          const entries = await fs.readdir(root);
          const marker = '.store-initialized';
          const existing = entries.some((entry) => entry === marker || Object.keys(definitions).some((name) =>
            entry === `${name}.json` || entry === `${name}.json.bak` || entry.startsWith(`.${name}.json.`)));
          for (const [name, definition] of Object.entries(definitions)) {
            await serialized(fileFor(name), async () => {
              if (existing) {
                const { text } = await load(name);
                // Adopt legacy plain JSON directories and repair missing/corrupt
                // backups from a verified primary, with an explicit diagnostic.
                const backup = `${fileFor(name)}.bak`;
                try { parse(name, await fs.readFile(backup, 'utf8'), backup); } catch (error) {
                  if (!recoverable(error)) throw error;
                  report('warn', `[store] Rebuilding missing or invalid backup ${backup} (${error.code})`);
                  await atomicReplace(backup, text);
                }
              } else {
                const text = encode(name, definition.seed);
                await atomicReplace(`${fileFor(name)}.bak`, text);
                await atomicReplace(fileFor(name), text);
              }
            });
          }
          if (!entries.includes(marker)) await atomicReplace(path.join(root, marker), '{"version":1}\n');
          initialized = true;
          report('info', `[store] data dir: ${root}`);
          return store;
        });
      }
      return initialization;
    },
    getPlaces: () => read('places'),
    savePlaces: (list) => update('places', () => list),
    updatePlaces: (updater) => update('places', updater),
    async upsertPlace(place) {
      await update('places', (list) => {
        const idx = list.findIndex((row) => row.id === place.id);
        if (idx >= 0) list[idx] = { ...list[idx], ...place };
        else list.push(place);
        return list;
      });
      return place;
    },
    async getPlaceById(id) { return (await read('places')).find((place) => place.id === id) || null; },
    async findPlaceByAlias(alias) {
      const term = (alias || '').trim();
      return (await read('places')).find((place) => place.alias === term || place.address?.includes(term)) || null;
    },
    getSettings: () => read('settings'),
    saveSettings: (patch) => update('settings', (current) => Array.isArray(patch) ? patch : { ...current, ...patch }),
    updateSettings: (updater) => update('settings', updater),
    getEvents: () => read('events'),
    saveEvents: (list) => update('events', () => list),
    updateEvents: (updater) => update('events', updater),
    async upsertEvent(event) {
      await update('events', (list) => {
        const idx = list.findIndex((row) => row.id === event.id);
        if (idx >= 0) list[idx] = { ...list[idx], ...event };
        else list.push(event);
        return list;
      });
      return event;
    },
    getCache: () => read('cache'),
    saveCache: (cache) => update('cache', () => cache),
    updateCache: (updater) => update('cache', updater),
    async getCached(key, sub, ttlMin) {
      const slot = (await read('cache'))[key]?.[sub];
      if (!slot || (Date.now() - slot.ts) / 60000 > ttlMin) return null;
      return slot.data;
    },
    async setCached(key, sub, data) {
      await update('cache', (cache) => {
        if (!Object.hasOwn(cache, key)) Object.defineProperty(cache, key, { value: {}, enumerable: true, configurable: true, writable: true });
        // A property definition avoids __proto__ invoking the legacy setter.
        Object.defineProperty(cache[key], sub, { value: { ts: Date.now(), data }, enumerable: true, configurable: true, writable: true });
        return cache;
      });
    },
    getTrip: () => read('trip'),
    saveTrip: (trip) => update('trip', () => trip),
    updateTrip: (updater) => update('trip', updater),
  };
  return store;
}

// Do not resolve DATA_DIR during ESM import: entrypoint dotenv has not run yet.
let singleton;
export async function ensureSeed(dir = process.env.DATA_DIR || defaultDir) {
  const root = path.resolve(dir);
  if (singleton && singleton.dataDir !== root) throw new Error('The singleton store is already bound to another data directory');
  singleton ||= createStore(root);
  return singleton.ensureSeed();
}

// Stable, mockable object for existing service imports. No implicit disk access.
export const db = Object.fromEntries([
  'getPlaces', 'savePlaces', 'updatePlaces', 'upsertPlace', 'getPlaceById', 'findPlaceByAlias',
  'getSettings', 'saveSettings', 'updateSettings', 'getEvents', 'saveEvents', 'updateEvents', 'upsertEvent',
  'getCache', 'saveCache', 'updateCache', 'getCached', 'setCached', 'getTrip', 'saveTrip', 'updateTrip',
].map((method) => [method, async (...args) => {
  if (!singleton) throw new Error('Store is not initialized; await ensureSeed() before use');
  return singleton[method](...args);
}]));
