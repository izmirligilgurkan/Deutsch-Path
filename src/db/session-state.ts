import { getDB } from './index.ts';
import type { SessionState } from './types.ts';
import type { Exercise } from '~/lib/content-types.ts';

/**
 * Picking a practice session up where it stopped.
 *
 * A unit's practice is over a hundred items. Losing that at item twenty
 * because the phone locked or the tab was closed is the difference between a
 * course you use on a commute and one you have to sit down for.
 *
 * What is saved is the ordered list of item ids and how far through it the
 * learner got. The ids are what make a resume exact rather than approximate:
 * they say which items, in which order, and they reveal a session saved
 * against course data that has since been rebuilt.
 */

/** Only practice sessions resume. A test is meant to be one sitting. */
export function sessionKey(unit: number): string {
  return `drill:${unit}`;
}

export interface Resumed {
  index: number;
  correct: number;
  wrong: { id: string; given: string }[];
}

/**
 * Pure: what a saved session is worth against the items on offer now.
 *
 * Returns nothing when the session does not match — a different set of items,
 * or the same ids in a different order, means the course was rebuilt under it
 * and resuming would put the learner at an arbitrary place.
 */
export function resumeFrom(
  saved: SessionState | undefined,
  items: readonly Exercise[],
): Resumed | null {
  if (!saved) return null;
  if (saved.index <= 0) return null;
  // Finished sessions are cleared, but a stale one is not worth restoring.
  if (saved.index >= items.length) return null;
  if (saved.itemIds.length !== items.length) return null;
  for (const [i, item] of items.entries()) {
    if (saved.itemIds[i] !== item.id) return null;
  }
  return { index: saved.index, correct: saved.correct, wrong: saved.wrong };
}

export async function loadSessionState(key: string): Promise<SessionState | undefined> {
  const db = await getDB();
  return db.get('sessionState', key);
}

export async function saveSessionState(
  key: string,
  items: readonly Exercise[],
  progress: Resumed,
): Promise<void> {
  const db = await getDB();
  const existing = await db.get('sessionState', key);
  await db.put('sessionState', {
    key,
    itemIds: items.map((e) => e.id),
    index: progress.index,
    correct: progress.correct,
    wrong: progress.wrong,
    startedAt: existing?.startedAt ?? Date.now(),
    updatedAt: Date.now(),
  });
}

export async function clearSessionState(key: string): Promise<void> {
  const db = await getDB();
  await db.delete('sessionState', key);
}

/** How far through a saved session the learner is, for the unit screen. */
export async function savedProgress(
  key: string,
): Promise<{ index: number; total: number } | null> {
  const saved = await loadSessionState(key);
  if (!saved || saved.index <= 0 || saved.index >= saved.itemIds.length) return null;
  return { index: saved.index, total: saved.itemIds.length };
}
