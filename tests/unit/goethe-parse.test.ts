import { describe, expect, it } from 'vitest';
import {
  detectColumns,
  extractArticleEntries,
  levelFromFilename,
  longestIncreasingSubsequence,
  mergeLevels,
  normalizeHeadword,
  readColumns,
  toColumnLines,
  type ColumnLine,
  type PdfItem,
} from '../../scripts/lib/goethe-parse.ts';

describe('levelFromFilename', () => {
  it('reads the level out of the published filenames', () => {
    // Underscores are word characters, so \b sees no boundary in "_B1_".
    expect(levelFromFilename('Goethe-Zertifikat_B1_Wortliste.pdf')).toBe('B1');
    expect(levelFromFilename('Goethe-Zertifikat_A2_Wortliste.pdf')).toBe('A2');
    expect(levelFromFilename('Goethe-Zertifikat_A1_Fit1_Wortliste.pdf')).toBe('A1');
    expect(levelFromFilename('Start_Deutsch_1_Wortliste.pdf')).toBe('A1');
  });

  it('says so when the name carries no level, rather than guessing', () => {
    expect(levelFromFilename('wortliste.pdf')).toBeNull();
  });
});

describe('normalizeHeadword', () => {
  it('reads the whole entry, not just its first word', () => {
    // The bug this replaced: taking the first token turned every noun entry
    // into its article, losing every noun in the list.
    expect(normalizeHeadword('die Ansage, -n')).toBe('Ansage');
    expect(normalizeHeadword('der Arbeitsplatz, -ä, e')).toBe('Arbeitsplatz');
    expect(normalizeHeadword('das Wochenende')).toBe('Wochenende');
  });

  it('drops the reflexive marker the lists print before a verb', () => {
    expect(normalizeHeadword('(sich) anziehen')).toBe('anziehen');
  });

  it('drops a grammatical note in brackets', () => {
    expect(normalizeHeadword('ab (Präp. + Dat.)')).toBe('ab');
  });

  it('keeps a derived stem, which the lists write with a trailing hyphen', () => {
    expect(normalizeHeadword('all-')).toBe('all-');
    expect(normalizeHeadword('Lieblings-')).toBe('Lieblings-');
  });

  it('rejects anything carrying a digit, before trimming could hide it', () => {
    // "Seite 12" in a footer would otherwise reduce to the real noun "Seite".
    expect(normalizeHeadword('Seite 12')).toBeNull();
    expect(normalizeHeadword('0.03 Uhr = null Uhr drei')).toBeNull();
  });

  it('rejects a section header and an empty line', () => {
    expect(normalizeHeadword('A')).toBeNull();
    expect(normalizeHeadword('   ')).toBeNull();
  });

  it('keeps umlauts and eszett', () => {
    expect(normalizeHeadword('die Tür, -en')).toBe('Tür');
    expect(normalizeHeadword('groß')).toBe('groß');
  });
});

describe('detectColumns', () => {
  const items = (xs: number[]): PdfItem[] =>
    xs.map((x, i) => ({ x, y: i, text: 'w', page: 1 }));

  it('finds the positions text actually starts at', () => {
    const list = items([
      ...Array.from({ length: 100 }, () => 143),
      ...Array.from({ length: 100 }, () => 237),
      12, 99, // incidental
    ]);
    expect(detectColumns(list)).toEqual([143, 237]);
  });

  it('keeps the sub-entry indent as its own column', () => {
    // "arbeiten" at 143 and "die Arbeit, -en" at 148 interleave when merged,
    // and since "Arbeit" sorts before "arbeiten" the ascending run has to drop
    // one of them.
    const list = items([
      ...Array.from({ length: 100 }, () => 143),
      ...Array.from({ length: 40 }, () => 148),
    ]);
    expect(detectColumns(list)).toEqual([143, 148]);
  });

  it('still merges sub-point jitter', () => {
    const list = items([
      ...Array.from({ length: 100 }, () => 143),
      ...Array.from({ length: 100 }, () => 144),
    ]);
    expect(detectColumns(list)).toEqual([143]);
  });
});

describe('toColumnLines', () => {
  it('splits a row into one line per column', () => {
    const items: PdfItem[] = [
      { x: 143, y: 500, text: 'die Ansage, -n', page: 1 },
      { x: 237, y: 500, text: 'Hören Sie die Ansagen.', page: 1 },
    ];
    const lines = toColumnLines(items, [143, 237]);
    expect(lines).toHaveLength(2);
    expect(lines.find((l) => l.column === 143)?.text).toBe('die Ansage, -n');
    expect(lines.find((l) => l.column === 237)?.text).toBe('Hören Sie die Ansagen.');
  });

  it('joins items that belong to the same column', () => {
    const items: PdfItem[] = [
      { x: 143, y: 500, text: '(sich)', page: 1 },
      { x: 166, y: 500, text: 'anziehen', page: 1 },
    ];
    expect(toColumnLines(items, [143])[0]!.text).toBe('(sich) anziehen');
  });
});

describe('readColumns', () => {
  const headwords = Array.from({ length: 300 }, (_, i) =>
    `${String.fromCharCode(97 + Math.floor(i / 26))}${String.fromCharCode(97 + (i % 26))}wort`,
  ).sort((a, b) => a.localeCompare(b, 'de'));

  function lines(): ColumnLine[] {
    const out: ColumnLine[] = [];
    headwords.forEach((w, i) => {
      out.push({ column: 143, text: `die ${w[0]!.toUpperCase()}${w.slice(1)}, -n`, page: 1 });
      // The example beside it, and a principal-part line under the entry.
      out.push({ column: 237, text: `Ein Satz über ${w} und mehr.`, page: 1 });
      if (i % 3 === 0) out.push({ column: 143, text: 'hat gemacht', page: 1 });
    });
    return out;
  }

  it('keeps the headword column and drops the example column', () => {
    const reports = readColumns(lines(), [143, 237]);
    const head = reports.find((r) => r.column === 143)!;
    const example = reports.find((r) => r.column === 237)!;
    expect(head.kept).toBe(true);
    expect(example.kept).toBe(false);
    expect(head.headwords).toBeGreaterThan(headwords.length * 0.9);
  });

  it('drops the principal-part lines that sit inside an entry', () => {
    const head = readColumns(lines(), [143, 237]).find((r) => r.column === 143)!;
    expect(head.extracted).not.toContain('gemacht');
  });

  it('reports every column, kept or not', () => {
    expect(readColumns(lines(), [143, 237])).toHaveLength(2);
  });
});

describe('extractArticleEntries', () => {
  it('reads the thematic word groups, which are not alphabetical', () => {
    // Days, months and times are laid out as a grid, so the ascending run
    // cannot see them — and they hold core vocabulary.
    const lines: ColumnLine[] = [
      { column: 143, text: 'der Tag, -e', page: 7 },
      { column: 258, text: 'das Jahr, -e', page: 7 },
      { column: 143, text: 'der Montag', page: 7 },
    ];
    expect(extractArticleEntries(lines)).toEqual(['Tag', 'Jahr', 'Montag']);
  });

  it('does not swallow an example sentence that opens with an article', () => {
    const lines: ColumnLine[] = [
      { column: 237, text: 'Die Kinder spielen auf der Straße.', page: 1 },
      { column: 237, text: 'Der Kurs hört in einer Woche auf.', page: 1 },
    ];
    expect(extractArticleEntries(lines)).toEqual([]);
  });

  it('skips anything with a digit', () => {
    expect(extractArticleEntries([{ column: 143, text: 'der Januar 2024', page: 1 }])).toEqual([]);
  });
});

describe('longestIncreasingSubsequence', () => {
  it('returns the ascending run, dropping what breaks it', () => {
    const words = ['ab', 'schrieb', 'aber', 'hat', 'abfahren', 'Abend'];
    expect(longestIncreasingSubsequence(words).map((i) => words[i]!))
      .toEqual(['ab', 'aber', 'abfahren']);
  });

  it('is strict, so a repeated word cannot inflate it', () => {
    expect(longestIncreasingSubsequence(['die', 'die', 'die'])).toHaveLength(1);
  });

  it('copes with an empty column', () => {
    expect(longestIncreasingSubsequence([])).toEqual([]);
  });
});

describe('mergeLevels', () => {
  it('keeps the lowest level, since the lists are cumulative', () => {
    expect(
      mergeLevels([
        { lemma: 'Haus', level: 'B1' },
        { lemma: 'Haus', level: 'A1' },
        { lemma: 'Brücke', level: 'A2' },
      ]),
    ).toEqual({ Haus: 'A1', Brücke: 'A2' });
  });

  it('treats a verb and its noun as different words', () => {
    // German capitalisation is semantic: "essen" and "Essen" are both taught.
    expect(mergeLevels([{ lemma: 'essen', level: 'A1' }, { lemma: 'Essen', level: 'A1' }]))
      .toEqual({ essen: 'A1', Essen: 'A1' });
  });
});
