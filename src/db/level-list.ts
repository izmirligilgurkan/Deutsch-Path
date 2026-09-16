import { getDB } from './index.ts';
import { loadLexicon } from '~/lib/content.ts';
import { formKey } from '~/lib/tokenize.ts';
import type { Lemma, Level } from '~/lib/content-types.ts';

/**
 * Applies a learner-imported level list over the bundled levels.
 *
 * The app already ships the Goethe A1/A2/B1 levels, with corpus frequency as
 * the fallback for words the lists do not cover. This is the override path for
 * a learner who wants to re-level the course from their own extraction, so
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
