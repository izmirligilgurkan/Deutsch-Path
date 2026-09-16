import { describe, expect, it } from 'vitest';
import {
  chooseHeadwordColumns,
  longestIncreasingSubsequence,
  extractHeadwords,
  firstToken,
  groupKey,
  levelFromFilename,
  mergeLevels,
  normalizeHeadword,
  type PdfLine,
} from '../../scripts/lib/goethe-parse.ts';

describe('levelFromFilename', () => {
  it('reads the level out of the published filenames', () => {
    expect(levelFromFilename('Goethe-Zertifikat_B1_Wortliste.pdf')).toBe('B1');
    expect(levelFromFilename('Goethe-Zertifikat_A2_Wortliste.pdf')).toBe('A2');
    expect(levelFromFilename('Start_Deutsch_1_Wortliste.pdf')).toBe('A1');
    expect(levelFromFilename('goethe a1 wortliste.pdf')).toBe('A1');
  });

  it('says so when the name carries no level, rather than guessing', () => {
    expect(levelFromFilename('wortliste.pdf')).toBeNull();
  });
});

describe('normalizeHeadword', () => {
  it('drops the article a list prints with a noun', () => {
    expect(normalizeHeadword('der Abend')).toBe('Abend');
    expect(normalizeHeadword('die Brücke')).toBe('Brücke');
  });

  it('drops gender and plural markers', () => {
    expect(normalizeHeadword('Abend, der, -e')).toBe('Abend');
    expect(normalizeHeadword('Haus, das, ¨-er')).toBe('Haus');
  });

  it('drops grammatical annotations in brackets', () => {
    expect(normalizeHeadword('ab (Präp. + Dat.)')).toBe('ab');
    expect(normalizeHeadword('freuen (sich)')).toBe('freuen');
  });

  it('keeps a separable verb whole', () => {
    expect(normalizeHeadword('anfangen')).toBe('anfangen');
  });

  it('rejects the alphabet section headers', () => {
    expect(normalizeHeadword('A')).toBeNull();
    expect(normalizeHeadword('B')).toBeNull();
  });

  it('rejects page furniture and anything with digits', () => {
    expect(normalizeHeadword('Seite 12')).toBeNull();
    expect(normalizeHeadword('2024')).toBeNull();
  });

  it('rejects a phrase, which is not a headword', () => {
    expect(normalizeHeadword('Am Abend gehe ich')).toBeNull();
  });

  it('keeps umlauts and eszett intact', () => {
    expect(normalizeHeadword('groß')).toBe('groß');
    expect(normalizeHeadword('Tür')).toBe('Tür');
  });
});

describe('firstToken', () => {
  it('takes the leading word', () => {
    expect(firstToken('  Abend, der, -e  ')).toBe('Abend,');
    expect(firstToken('')).toBe('');
  });
});

describe('chooseHeadwordColumns', () => {
  const known = new Set(['Abend', 'Brücke', 'Haus', 'Kind', 'Wasser', 'gehen']);
  const isKnown = (w: string) => known.has(w);

  /** 900 sorted pseudo-headwords, letters only. */
  const headwords = Array.from({ length: 900 }, (_, i) => {
    const a = String.fromCharCode(97 + Math.floor(i / 900 ** (1 / 2)) % 26);
    return `${a}${String.fromCharCode(97 + (i % 26))}wort${'x'.repeat(i % 5)}`;
  }).sort((a, b) => a.localeCompare(b, 'de'));

  /**
   * A column as the real lists build one: the headword, then continuation
   * lines of its entry at the same position and in the same face.
   */
  function entryColumn(words: string[], { x = 35, font = 'F3' } = {}): PdfLine[] {
    const noise = ['schrieb', 'hat', 'das', 'Matura', 'gibt', 'ist'];
    const lines: PdfLine[] = [];
    words.forEach((word, i) => {
      lines.push({ text: `${word}, der, -e`, x, page: 1, font });
      lines.push({ text: noise[i % noise.length]!, x, page: 1, font });
    });
    return lines;
  }

  it('recovers the headwords from a column of multi-line entries', () => {
    // The real shape: only the first line of each entry is a headword, and
    // nothing local marks it. This was scoring ~60% ordered and being rejected.
    const choice = chooseHeadwordColumns(entryColumn(headwords), isKnown);
    expect(choice.keys.size).toBe(1);
    // Not every one survives: the generator repeats a few at base collation,
    // and a continuation word occasionally fits the chain. The point is that
    // the bulk of the column is recovered and the noise is not.
    expect(choice.headwords).toBeGreaterThan(headwords.length * 0.8);
    const picked = choice.diagnostics[0]!;
    expect(picked.extracted).not.toContain('schrieb');
    expect(picked.extracted).not.toContain('Matura');
  });

  it('rejects a column of example sentences', () => {
    // A random sequence yields an ascending run of about 2*sqrt(n) — far
    // below anything a word list produces.
    const openers = ['Ich', 'Wir', 'Er', 'Sie', 'Das', 'Ein', 'Am', 'Heute',
      'Bitte', 'Wo', 'Wann', 'Meine', 'Der', 'Die', 'Es', 'Auf', 'In', 'Nach'];
    let seed = 7;
    const lines: PdfLine[] = Array.from({ length: 1900 }, () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return { text: `${openers[seed % openers.length]!} sagte etwas.`, x: 142, page: 1, font: 'F3' };
    });
    expect(chooseHeadwordColumns(lines, isKnown).keys.size).toBe(0);
  });

  it('rejects a running header repeated on every page', () => {
    const lines: PdfLine[] = Array.from({ length: 200 }, () => ({
      text: 'WORTLISTE', x: 35, page: 1, font: 'F1',
    }));
    expect(chooseHeadwordColumns(lines, isKnown).keys.size).toBe(0);
  });

  it('rejects running prose', () => {
    const prose: PdfLine[] = Array.from({ length: 400 }, (_, i) => ({
      text: `Die vorliegende Publikation enthält Satz ${i}.`, x: 143, page: 1, font: 'F2',
    }));
    expect(chooseHeadwordColumns(prose, isKnown).keys.size).toBe(0);
  });

  it('takes both columns of a two-column list', () => {
    const lines = [
      ...entryColumn(headwords.slice(0, 450), { x: 35 }),
      ...entryColumn(headwords.slice(450), { x: 315 }),
    ];
    expect([...chooseHeadwordColumns(lines, isKnown).keys].sort())
      .toEqual([groupKey(35, 'F3'), groupKey(315, 'F3')].sort());
  });

  it('finds a list even when it shares a margin with the foreword', () => {
    // The A1 layout: the foreword prose and the word list both sit at x=143.
    const prose: PdfLine[] = Array.from({ length: 60 }, (_, i) => ({
      text: `Die vorliegende Publikation enthält Satz ${i}.`, x: 143, page: 1, font: 'F2',
    }));
    const choice = chooseHeadwordColumns(
      [...prose, ...entryColumn(headwords, { x: 143, font: 'F2' })], isKnown,
    );
    expect(choice.keys.size).toBe(1);
    expect(choice.headwords).toBeGreaterThan(headwords.length * 0.85);
  });

  it('picks a column the course barely knows', () => {
    const choice = chooseHeadwordColumns(entryColumn(headwords), () => false);
    expect(choice.keys.size).toBe(1);
  });

  it('ignores a short sorted run', () => {
    const short: PdfLine[] = ['Aufgabe', 'Beispiel', 'Lösung', 'Prüfung'].map((w) => ({
      text: w, x: 237, page: 1, font: 'F2',
    }));
    expect(chooseHeadwordColumns(short, isKnown).keys.size).toBe(0);
  });
});

describe('longestIncreasingSubsequence', () => {
  it('returns the ascending run, dropping what breaks it', () => {
    const words = ['ab', 'schrieb', 'aber', 'hat', 'abfahren', 'Abend'];
    const picked = longestIncreasingSubsequence(words).map((i) => words[i]!);
    expect(picked).toEqual(['ab', 'aber', 'abfahren']);
  });

  it('takes the longest chain, even one that runs through a later letter', () => {
    // "das" sorts after "abfahren", so it genuinely extends the run.
    const words = ['ab', 'schrieb', 'aber', 'hat', 'abfahren', 'das'];
    expect(longestIncreasingSubsequence(words)).toHaveLength(4);
  });

  it('is strict, so a repeated word cannot inflate it', () => {
    expect(longestIncreasingSubsequence(['die', 'die', 'die', 'die'])).toHaveLength(1);
  });

  it('uses German collation', () => {
    const words = ['Apfel', 'Äpfel', 'Banane'];
    // Base sensitivity makes the first two equal, so only one of them counts.
    expect(longestIncreasingSubsequence(words)).toHaveLength(2);
  });

  it('copes with an empty column', () => {
    expect(longestIncreasingSubsequence([])).toEqual([]);
  });
});

describe('extractHeadwords', () => {
  const known = new Set(['Haus', 'Abend']);
  // An unambiguous ascending column, so the expected run is not a coin flip
  // between two chains of equal length.
  const lines: PdfLine[] = [
    { text: 'Abend, der, -e', x: 56, page: 1, font: 'b' },
    { text: 'Im Abend ist es warm.', x: 72, page: 1, font: 'i' },
    { text: 'Brücke, die, -n', x: 56, page: 1, font: 'b' },
    { text: 'Haus, das, ¨-er', x: 56, page: 1, font: 'b' },
    { text: 'Quatschwort', x: 56, page: 1, font: 'b' },
    { text: 'Abend, der, -e', x: 56, page: 2, font: 'b' },
  ];
  const isKnown = (w: string) => known.has(w);
  const choice = chooseHeadwordColumns(lines, isKnown, { minHeadwords: 1, minRatio: 0 });

  it('takes only the chosen group, and splits known from unknown', () => {
    const { known: hits, unknown } = extractHeadwords(choice, isKnown);
    // The course teaches Haus and Abend; Brücke and Quatschwort are real
    // entries it does not teach, so they are found but reported as skipped.
    // (These thresholds are deliberately permissive to exercise the merge, so
    // the example column is admitted too and contributes "Im".)
    expect(hits).toEqual(['Abend', 'Haus']);
    expect(unknown).toContain('Brücke');
    expect(unknown).toContain('Quatschwort');
  });

  it('deduplicates a word repeated across pages', () => {
    const all = [...extractHeadwords(choice, isKnown).known,
                 ...extractHeadwords(choice, isKnown).unknown];
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('mergeLevels', () => {
  it('keeps the lowest level, since the B1 list repeats A1 and A2', () => {
    expect(
      mergeLevels([
        { lemma: 'Haus', level: 'B1' },
        { lemma: 'Haus', level: 'A1' },
        { lemma: 'Brücke', level: 'A2' },
      ]),
    ).toEqual({ Haus: 'A1', Brücke: 'A2' });
  });

  it('is order-independent', () => {
    const a = mergeLevels([{ lemma: 'x', level: 'A1' }, { lemma: 'x', level: 'B1' }]);
    const b = mergeLevels([{ lemma: 'x', level: 'B1' }, { lemma: 'x', level: 'A1' }]);
    expect(a).toEqual(b);
  });
});
