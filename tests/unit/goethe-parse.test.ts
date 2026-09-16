import { describe, expect, it } from 'vitest';
import {
  alphabeticalRate,
  chooseHeadwordColumns,
  distinctRatio,
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

  /** Alphabetical headwords at the margin, example sentences beside them. */
  function wordList(words: string[], { x = 56, font = 'Bold' } = {}): PdfLine[] {
    const lines: PdfLine[] = [];
    for (const word of words) {
      lines.push({ text: `${word}, der, -e`, x, page: 1, font });
      // The example sits on the same row, further right, in another face.
      lines.push({ text: `Und dann sagte ${word} etwas.`, x: x + 110, page: 1, font: 'Roman' });
    }
    return lines;
  }

  /**
   * 200 sorted pseudo-words, letters only — a headword with a digit in it is
   * rejected as page furniture, which is correct but makes a poor fixture.
   */
  const sorted = Array.from({ length: 200 }, (_, i) => {
    const a = String.fromCharCode(97 + Math.floor(i / 26));
    const b = String.fromCharCode(97 + (i % 26));
    return `${a}${b}wort`;
  });

  it('picks the alphabetical column, not the example sentences', () => {
    const choice = chooseHeadwordColumns(wordList(sorted), isKnown);
    expect([...choice.keys]).toEqual([groupKey(56, 'Bold')]);
    expect(choice.alphabetical).toBeGreaterThan(0.95);
  });

  it('picks a headword column even when the course knows almost none of it', () => {
    // The real case: the published lists run to thousands of words, most of
    // them outside a 3,000-lemma course vocabulary. Scoring by "known" put
    // these columns last.
    const choice = chooseHeadwordColumns(wordList(sorted), () => false);
    expect([...choice.keys]).toEqual([groupKey(56, 'Bold')]);
    const picked = choice.diagnostics.find((d) => d.x === 56)!;
    expect(picked.knownRate).toBe(0);
  });

  it('rejects a column of sentences whose first words are common and known', () => {
    // These scored ~60% under the old rule and were accepted.
    const lines: PdfLine[] = Array.from({ length: 120 }, (_, i) => ({
      text: ['Ich gehe nach Hause.', 'Wir sind da.', 'Er hat ein Haus.', 'Auf dem Tisch.'][i % 4]!,
      x: 56, page: 1, font: 'Roman',
    }));
    expect(chooseHeadwordColumns(lines, isKnown).keys.size).toBe(0);
  });

  it('rejects running prose, such as the foreword', () => {
    const prose: PdfLine[] = Array.from({ length: 120 }, (_, i) => ({
      text: `Die vorliegende Publikation enthält Satz ${i}.`, x: 143, page: 1, font: 'F2',
    }));
    expect(chooseHeadwordColumns(prose, isKnown).keys.size).toBe(0);
  });

  it('takes both columns of a two-column list', () => {
    // The alphabet runs down column one and on into column two, so each
    // column on its own is still increasing.
    const lines = [
      ...wordList(sorted.slice(0, 100), { x: 35 }),
      ...wordList(sorted.slice(100), { x: 315 }),
    ];
    const keys = [...chooseHeadwordColumns(lines, isKnown).keys].sort();
    expect(keys).toEqual([groupKey(35, 'Bold'), groupKey(315, 'Bold')].sort());
  });

  it('ignores a short run that happens to be sorted', () => {
    // "Aufgabe, Beispiel, Lösung, Prüfung" in the exam instructions is sorted
    // by luck; a word list is long.
    const short: PdfLine[] = ['Aufgabe', 'Beispiel', 'Lösung', 'Prüfung'].map((w) => ({
      text: w, x: 237, page: 1, font: 'F2',
    }));
    expect(chooseHeadwordColumns(short, isKnown).keys.size).toBe(0);
  });

  it('reports every candidate with its ordering, so a wrong pick is visible', () => {
    const choice = chooseHeadwordColumns(wordList(sorted), isKnown);
    expect(choice.diagnostics.length).toBeGreaterThan(1);
    expect(choice.diagnostics[0]!.sample.length).toBeGreaterThan(0);
  });
});

describe('distinctRatio', () => {
  it('is near zero for prose that repeats its opening word', () => {
    expect(distinctRatio(['Die', 'Die', 'Die', 'Die'])).toBe(0.25);
  });

  it('is 1 for a list of distinct entries', () => {
    expect(distinctRatio(['ab', 'aber', 'abfahren'])).toBe(1);
  });

  it('ignores case, so a word is not counted twice', () => {
    expect(distinctRatio(['Haus', 'haus'])).toBe(0.5);
  });
});

describe('alphabeticalRate', () => {
  it('is 1 for a sorted list and about half for shuffled text', () => {
    expect(alphabeticalRate(['ab', 'abbiegen', 'aber', 'abfahren'])).toBe(1);
    expect(alphabeticalRate(['Wir', 'Ab', 'Zu', 'Er'])).toBeLessThan(0.7);
  });

  it('tolerates a repeated entry, which a real list has', () => {
    expect(alphabeticalRate(['ab', 'ab', 'aber'])).toBe(1);
  });

  it('ignores case, so a capitalised noun still follows a lower-case verb', () => {
    expect(alphabeticalRate(['abend', 'Apfel', 'auto', 'Bier'])).toBe(1);
  });

  it('treats an umlaut variant as equal to its base letter, and allows it', () => {
    expect(alphabeticalRate(['Apfel', 'Äpfel', 'Banane'])).toBe(1);
  });

  it('is 0 for a list too short to judge', () => {
    expect(alphabeticalRate(['Haus'])).toBe(0);
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
  const keys = new Set([groupKey(56, 'b')]);

  it('takes only the chosen group, and splits known from unknown', () => {
    const { known: hits, unknown } = extractHeadwords(lines, keys, (w) => known.has(w));
    expect(hits).toEqual(['Haus', 'Abend']);
    expect(unknown).toEqual(['Quatschwort']);
  });

  it('deduplicates a word repeated across pages', () => {
    expect(extractHeadwords(lines, keys, (w) => known.has(w)).known).toHaveLength(2);
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
