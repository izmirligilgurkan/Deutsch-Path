import { getDB } from './index.ts';
import { loadLexicon } from '~/lib/content.ts';
import { formKey } from '~/lib/tokenize.ts';
import type { Lemma, Level } from '~/lib/content-types.ts';

/**
 * Applies the learner's own Goethe level list over the bundled levels.
 *
 * The levels that ship with the app come from corpus frequency and are marked
 * approximate. A learner who imports the real Wortlisten on their own device
 * should get those levels instead — that is the whole point of the import, so
 * every screen reads the lexicon through here rather than straight from the
 * data file.
 */

/** Pure: overrides win, and say where they came from. */
export function applyLevels(lexicon: Lemma[], overrides: Map<string, Level>): Lemma[] {
  if (overrides.size === 0) return lexicon;

  return lexicon.map((lemma) => {
    const level = overrides.get(formKey(lemma.lemma));
    if (!level || level === lemma.level) {
      return level ? { ...lemma, levelSource: 'goethe-import' as const } : lemma;
    }
    return { ...lemma, level, levelSource: 'goethe-import' as const };
  });
}

/** The imported list, keyed for case-insensitive lookup. Empty when none. */
export async function getImportedLevels(): Promise<Map<string, Level>> {
  const db = await getDB();
  const rows = await db.getAll('levelList');
  return new Map(rows.map((r) => [formKey(r.lemma), r.level]));
}

let cached: Promise<Lemma[]> | null = null;

/**
 * The lexicon every screen should use: bundled data with the learner's
 * imported levels applied.
 */
export async function loadCourseLexicon(): Promise<Lemma[]> {
  cached ??= (async () => applyLevels(await loadLexicon(), await getImportedLevels()))();
  return cached;
}

/** Call after importing or clearing a list, so screens pick up the change. */
export function invalidateCourseLexicon(): void {
  cached = null;
}
