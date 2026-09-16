import { describe, expect, it } from 'vitest';
import {
  chooseHeadwordColumns,
  extractHeadwords,
  firstToken,
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
  const known = new Set(['Haus', 'Abend', 'Brücke', 'gehen', 'Wasser', 'Kind']);
  const isKnown = (w: string) => known.has(w);

  /** Headwords at the margin, example sentences indented. */
  function page(): PdfLine[] {
    const lines: PdfLine[] = [];
    for (let i = 0; i < 30; i++) {
      const word = [...known][i % known.size]!;
      lines.push({ text: `${word}, der, -e`, x: 56, page: 1, font: 'bold' });
      lines.push({ text: `Beispielsatz mit ${word} darin.`, x: 72, page: 1, font: 'italic' });
    }
    return lines;
  }

  it('finds the column the headwords are in, not the examples', () => {
    const choice = chooseHeadwordColumns(page(), isKnown);
    expect(choice.columns).toEqual([56]);
    expect(choice.matchRate).toBeGreaterThan(0.9);
  });

  it('reports every candidate so a bad guess can be seen', () => {
    const choice = chooseHeadwordColumns(page(), isKnown);
    expect(choice.diagnostics.map((d) => d.x).sort()).toEqual([56, 72]);
  });

  it('handles a two-column layout', () => {
    const lines = [...page(), ...page().map((l) => ({ ...l, x: l.x + 300 }))];
    expect(chooseHeadwordColumns(lines, isKnown).columns.sort((a, b) => a - b)).toEqual([56, 356]);
  });

  it('chooses nothing rather than guessing when no column looks like a word list', () => {
    const prose: PdfLine[] = Array.from({ length: 50 }, (_, i) => ({
      text: `Dies ist ein Satz Nummer ${i}.`, x: 56, page: 1, font: 'roman',
    }));
    expect(chooseHeadwordColumns(prose, isKnown).columns).toEqual([]);
  });
});

describe('extractHeadwords', () => {
  const known = new Set(['Haus', 'Abend']);
  const lines: PdfLine[] = [
    { text: 'Haus, das, ¨-er', x: 56, page: 1, font: 'b' },
    { text: 'Im Haus ist es warm.', x: 72, page: 1, font: 'i' },
    { text: 'Abend, der, -e', x: 56, page: 1, font: 'b' },
    { text: 'Quatschwort', x: 56, page: 1, font: 'b' },
    { text: 'Haus, das, ¨-er', x: 56, page: 2, font: 'b' },
  ];

  it('takes only the chosen column, and splits known from unknown', () => {
    const { known: hits, unknown } = extractHeadwords(lines, [56], (w) => known.has(w));
    expect(hits).toEqual(['Haus', 'Abend']);
    expect(unknown).toEqual(['Quatschwort']);
  });

  it('deduplicates a word repeated across pages', () => {
    expect(extractHeadwords(lines, [56], (w) => known.has(w)).known).toHaveLength(2);
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
