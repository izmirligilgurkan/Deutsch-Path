import { describe, expect, it } from 'vitest';
import { applyLevels } from '~/db/level-list.ts';
import type { Lemma, Level } from '~/lib/content-types.ts';

function lemma(word: string, level: Level): Lemma {
  return {
    id: `${word}|noun`, lemma: word, pos: 'noun', forms: [], glosses: ['x'],
    level, levelSource: 'frequency-approx', freqRank: 1,
    source: 's', sourceUrl: 'u', license: 'CC-BY-SA-4.0',
  };
}

const lexicon = [lemma('Haus', 'A1'), lemma('Brücke', 'A2'), lemma('Verfassung', 'B1')];

describe('applyLevels', () => {
  it('leaves the bundled levels alone when nothing is imported', () => {
    const out = applyLevels(lexicon, new Map());
    expect(out).toBe(lexicon);
    expect(out[0]!.levelSource).toBe('frequency-approx');
  });

  it('overrides the frequency level with the imported one', () => {
    const out = applyLevels(lexicon, new Map([['brücke', 'A1' as Level]]));
    const bruecke = out.find((l) => l.lemma === 'Brücke')!;
    expect(bruecke.level).toBe('A1');
    expect(bruecke.levelSource).toBe('goethe-import');
  });

  it('marks a word the list confirms, even when the level already matched', () => {
    // The learner should see that this level is now official, not approximate.
    const out = applyLevels(lexicon, new Map([['haus', 'A1' as Level]]));
    expect(out.find((l) => l.lemma === 'Haus')!.levelSource).toBe('goethe-import');
  });

  it('leaves words the list does not mention as they were', () => {
    const out = applyLevels(lexicon, new Map([['haus', 'A1' as Level]]));
    const other = out.find((l) => l.lemma === 'Verfassung')!;
    expect(other.level).toBe('B1');
    expect(other.levelSource).toBe('frequency-approx');
  });

  it('matches case-insensitively, since a list may print a headword differently', () => {
    const out = applyLevels(lexicon, new Map([['HAUS'.toLowerCase(), 'B1' as Level]]));
    expect(out.find((l) => l.lemma === 'Haus')!.level).toBe('B1');
  });

  it('does not mutate the lexicon it was given', () => {
    const before = structuredClone(lexicon);
    applyLevels(lexicon, new Map([['haus', 'B1' as Level]]));
    expect(lexicon).toEqual(before);
  });
});
