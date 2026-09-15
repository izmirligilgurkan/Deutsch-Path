import { getDB } from './index.ts';
import type { DeutschPathDB } from './schema.ts';
import { DB_VERSION } from './schema.ts';

/**
 * Export / import of learner progress (spec §4.8).
 *
 * The Goethe level list is deliberately *excluded*: it is derived from
 * copyrighted material and must stay on the device that imported it, so a
 * backup file can be moved between devices without carrying it along.
 */

export const BACKUP_FORMAT = 'deutsch-path-backup';
export const BACKUP_FORMAT_VERSION = 1;

const EXPORTED_STORES = [
  'settings',
  'cards',
  'reviewLogs',
  'unitProgress',
  'mistakes',
  'testResults',
  'seenLemmas',
] as const satisfies readonly (keyof DeutschPathDB)[];

type ExportedStore = (typeof EXPORTED_STORES)[number];

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  dbVersion: number;
  exportedAt: string;
  stores: Record<ExportedStore, unknown[]>;
}

export async function exportProgress(): Promise<BackupFile> {
  const db = await getDB();
  const tx = db.transaction(EXPORTED_STORES, 'readonly');
  const stores = {} as Record<ExportedStore, unknown[]>;
  await Promise.all(
    EXPORTED_STORES.map(async (name) => {
      stores[name] = await tx.objectStore(name).getAll();
    }),
  );
  await tx.done;

  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    dbVersion: DB_VERSION,
    exportedAt: new Date().toISOString(),
    stores,
  };
}

export class BackupError extends Error {}

/** Structural check — a malformed file must fail before anything is written. */
export function parseBackup(raw: string): BackupFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BackupError('Not valid JSON.');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new BackupError('Backup must be a JSON object.');
  }
  const file = parsed as Partial<BackupFile>;
  if (file.format !== BACKUP_FORMAT) {
    throw new BackupError('This file is not a Deutsch-Path backup.');
  }
  if (typeof file.formatVersion !== 'number' || file.formatVersion > BACKUP_FORMAT_VERSION) {
    throw new BackupError(
      `Backup format v${String(file.formatVersion)} is newer than this app understands (v${BACKUP_FORMAT_VERSION}). Update the app first.`,
    );
  }
  if (typeof file.stores !== 'object' || file.stores === null) {
    throw new BackupError('Backup has no "stores" section.');
  }
  for (const name of EXPORTED_STORES) {
    const rows = (file.stores as Record<string, unknown>)[name];
    if (rows !== undefined && !Array.isArray(rows)) {
      throw new BackupError(`Store "${name}" is not an array.`);
    }
  }
  return file as BackupFile;
}

/**
 * Replaces learner state with the backup's contents. All-or-nothing: a single
 * IndexedDB transaction covers every store, so a failure mid-import rolls back.
 */
export async function importProgress(file: BackupFile): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(EXPORTED_STORES, 'readwrite');
  for (const name of EXPORTED_STORES) {
    const store = tx.objectStore(name);
    await store.clear();
    for (const row of file.stores[name] ?? []) {
      // autoIncrement stores keep their exported ids so review logs stay linked.
      await store.put(row as never);
    }
  }
  await tx.done;
}

export function backupFilename(now = new Date()): string {
  const stamp = now.toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return `deutsch-path-${stamp}.json`;
}
