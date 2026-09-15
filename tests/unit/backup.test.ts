import { describe, expect, it } from 'vitest';
import { BackupError, backupFilename, parseBackup } from '~/db/backup.ts';

const valid = JSON.stringify({
  format: 'deutsch-path-backup',
  formatVersion: 1,
  dbVersion: 1,
  exportedAt: '2026-01-01T00:00:00.000Z',
  stores: { settings: [], cards: [], reviewLogs: [] },
});

describe('parseBackup', () => {
  it('accepts a well-formed backup', () => {
    expect(parseBackup(valid).formatVersion).toBe(1);
  });

  it('rejects non-JSON', () => {
    expect(() => parseBackup('not json')).toThrow(BackupError);
  });

  it('rejects a foreign file', () => {
    expect(() => parseBackup('{"format":"anki"}')).toThrow(/not a Deutsch-Path backup/);
  });

  it('rejects a backup from a newer app version', () => {
    const future = JSON.stringify({ format: 'deutsch-path-backup', formatVersion: 99, stores: {} });
    expect(() => parseBackup(future)).toThrow(/newer than this app/);
  });

  it('rejects a store that is not an array', () => {
    const bad = JSON.stringify({
      format: 'deutsch-path-backup',
      formatVersion: 1,
      stores: { cards: { nope: true } },
    });
    expect(() => parseBackup(bad)).toThrow(/not an array/);
  });
});

describe('backupFilename', () => {
  it('is filesystem-safe and timestamped', () => {
    const name = backupFilename(new Date('2026-03-04T05:06:07Z'));
    expect(name).toBe('deutsch-path-2026-03-04-05-06-07.json');
  });
});
