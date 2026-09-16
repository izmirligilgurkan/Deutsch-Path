import { openDB, type IDBPDatabase } from 'idb';
import { DB_NAME, DB_VERSION, type DeutschPathDB } from './schema.ts';
import { DEFAULT_SETTINGS, type Settings } from './types.ts';

// DBSchema carries an index signature, so `keyof` widens to string. Deriving
// the union from a literal tuple keeps idb's store-name checking intact.
const ALL_STORES = [
  'settings',
  'cards',
  'reviewLogs',
  'unitProgress',
  'mistakes',
  'testResults',
  'seenLemmas',
  'levelList',
] as const satisfies readonly (keyof DeutschPathDB)[];

type StoreName = (typeof ALL_STORES)[number];

let dbPromise: Promise<IDBPDatabase<DeutschPathDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<DeutschPathDB>> {
  dbPromise ??= openDB<DeutschPathDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      // v1: initial schema. Later versions extend this switch rather than
      // recreating stores, so learner progress survives upgrades.
      if (oldVersion < 1) {
        db.createObjectStore('settings', { keyPath: 'id' });

        const cards = db.createObjectStore('cards', { keyPath: 'id' });
        cards.createIndex('by-due', 'due');
        cards.createIndex('by-lemma', 'lemmaId');
        cards.createIndex('by-unit', 'unit');
        cards.createIndex('by-lapses', 'lapses');

        const logs = db.createObjectStore('reviewLogs', {
          keyPath: 'id',
          autoIncrement: true,
        });
        logs.createIndex('by-card', 'cardId');
        logs.createIndex('by-ts', 'ts');

        db.createObjectStore('unitProgress', { keyPath: 'unit' });

        const mistakes = db.createObjectStore('mistakes', {
          keyPath: 'id',
          autoIncrement: true,
        });
        mistakes.createIndex('by-ts', 'ts');
        mistakes.createIndex('by-topic', 'topic');
        mistakes.createIndex('by-unit', 'unit');

        const tests = db.createObjectStore('testResults', {
          keyPath: 'id',
          autoIncrement: true,
        });
        tests.createIndex('by-ts', 'ts');
        tests.createIndex('by-kind', 'kind');

        db.createObjectStore('levelList', { keyPath: 'lemma' });

        const seen = db.createObjectStore('seenLemmas', { keyPath: 'lemmaId' });
        seen.createIndex('by-last-seen', 'lastSeenAt');
      }
    },
    blocked() {
      console.warn('[db] upgrade blocked by another open tab');
    },
    blocking() {
      // Another tab wants to upgrade; drop our handle so it can proceed.
      void dbPromise?.then((db) => db.close());
      dbPromise = null;
    },
  });
  return dbPromise;
}

export async function getSettings(): Promise<Settings> {
  const db = await getDB();
  const stored = await db.get('settings', 'app');
  // Merge so settings added in a later release get their defaults.
  return { ...DEFAULT_SETTINGS, ...stored, id: 'app' };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const db = await getDB();
  const next: Settings = { ...(await getSettings()), ...patch, id: 'app' };
  await db.put('settings', next);
  return next;
}

/** Wipes learner state. `keepLevelList` spares an imported level-list override. */
export async function resetAll(keepLevelList = true): Promise<void> {
  const db = await getDB();
  const stores: StoreName[] = keepLevelList
    ? ALL_STORES.filter((s) => s !== 'levelList')
    : [...ALL_STORES];
  const tx = db.transaction(stores, 'readwrite');
  await Promise.all(stores.map((s) => tx.objectStore(s).clear()));
  await tx.done;
}

/** Drops progress for one unit only, leaving the rest of the course alone. */
export async function resetUnit(unit: number): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['cards', 'unitProgress', 'mistakes'], 'readwrite');
  const cards = tx.objectStore('cards');
  for (const key of await cards.index('by-unit').getAllKeys(unit)) {
    await cards.delete(key);
  }
  const mistakes = tx.objectStore('mistakes');
  for (const key of await mistakes.index('by-unit').getAllKeys(unit)) {
    await mistakes.delete(key);
  }
  await tx.objectStore('unitProgress').delete(unit);
  await tx.done;
}

/** Test seam: forces the next getDB() to reopen. */
export function _resetConnectionForTests(): void {
  dbPromise = null;
}
