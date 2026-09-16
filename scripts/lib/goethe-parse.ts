import type { Level } from '../../src/lib/content-types.ts';

/**
 * Parsing for the Goethe-Institut Wortlisten.
 *
 * The lists are laid out in fixed columns: a headword column and, beside it,
 * an example column; larger lists put two such pairs side by side on a page.
 * So the parser builds a column model of the document first and reads each
 * headword column whole. Reading only a line's first token — which is what an
 * earlier version did — turns every noun entry ("die Ansage, -n") into its
 * article and silently loses every noun in the list.
 *
 * Within a headword column the entries are alphabetical, while the foreword,
 * the principal-part lines that sit under a verb ("gibt ab", "hat abgegeben")
 * and hyphenation fragments are not. The longest ascending run is therefore
 * the list, and everything else falls away.
 */

/** One text item as the PDF places it. */
export interface PdfItem {
  x: number;
  y: number;
  text: string;
  page: number;
}

/** One line of a single column. */
export interface ColumnLine {
  column: number;
  text: string;
  page: number;
}

export function levelFromFilename(filename: string): Level | null {
  // Separators are normalised first: an underscore is a word character, so \b
  // sees no boundary in "_B1_", which is how the published names are written.
  const name = filename.toUpperCase().replace(/[^A-Z0-9]+/g, ' ');
  if (/\bA1\b|\bFIT1\b|\bSTART DEUTSCH 1\b/.test(name)) return 'A1';
  if (/\bA2\b/.test(name)) return 'A2';
  if (/\bB1\b/.test(name)) return 'B1';
  return null;
}

/**
 * Column starts, taken from where text actually begins on the page.
 *
 * A position carrying a real share of the document's items is a column; the
 * rest is incidental.
 *
 * Starts only merge when they are within a couple of points, i.e. the same
 * column with sub-point jitter. The small indent the lists use for sub-entries
 * — "arbeiten" at 143, "die Arbeit, -en" at 148 — is a column of its own:
 * merged into the main one its entries interleave, and since "Arbeit" sorts
 * before "arbeiten" the ascending run has to drop one of them. Read apart,
 * both are kept.
 */
export function detectColumns(
  items: PdfItem[],
  { minShare = 0.015, mergeWithin = 2 }: { minShare?: number; mergeWithin?: number } = {},
): number[] {
  const counts = new Map<number, number>();
  for (const item of items) {
    const x = Math.round(item.x);
    counts.set(x, (counts.get(x) ?? 0) + 1);
  }

  const threshold = items.length * minShare;
  const candidates = [...counts.entries()]
    .filter(([, n]) => n >= threshold)
    .map(([x]) => x)
    .sort((a, b) => a - b);

  const columns: number[] = [];
  for (const x of candidates) {
    const last = columns[columns.length - 1];
    if (last === undefined || x - last > mergeWithin) columns.push(x);
  }
  return columns;
}

/** Groups items into one line of text per (row, column). */
export function toColumnLines(items: PdfItem[], columns: number[]): ColumnLine[] {
  if (columns.length === 0) return [];

  const columnOf = (x: number): number => {
    let chosen = columns[0]!;
    for (const start of columns) if (x >= start - 2) chosen = start;
    return chosen;
  };

  const rows = new Map<string, PdfItem[]>();
  for (const item of items) {
    const key = `${item.page}|${item.y}`;
    const row = rows.get(key);
    if (row) row.push(item);
    else rows.set(key, [item]);
  }

  const lines: ColumnLine[] = [];
  for (const row of rows.values()) {
    row.sort((a, b) => a.x - b.x);
    const byColumn = new Map<number, string[]>();
    for (const item of row) {
      const column = columnOf(item.x);
      const parts = byColumn.get(column);
      if (parts) parts.push(item.text);
      else byColumn.set(column, [item.text]);
    }
    for (const [column, parts] of byColumn) {
      lines.push({
        column,
        page: row[0]!.page,
        text: parts.join(' ').replace(/\s+/g, ' ').trim(),
      });
    }
  }
  return lines;
}

/** Leading markers the lists attach before a headword. */
const LEADING_MARKER = /^\((?:sich|etwas|jemanden?|jdn?|jdm?|etw)\.?\)\s*/i;
const LEADING_ARTICLE = /^(?:der|die|das)\s+/i;

/**
 * Reduces one headword line to the lemma it announces, or null.
 *
 * Selection and trimming only: the article, the gender and plural markers
 * after the comma, and any parenthesised note are removed, and nothing is
 * rewritten.
 */
export function normalizeHeadword(line: string): string | null {
  // A digit anywhere means page furniture or a numbered example, never a
  // headword — checked before trimming, so "Seite 12" cannot become "Seite".
  if (/\d/.test(line)) return null;

  let word = line.trim();
  word = word.replace(LEADING_MARKER, '');
  word = word.replace(LEADING_ARTICLE, '');
  // ", -n" / ", der, -e" / "; …" / "(Präp. + Dat.)"
  word = word.replace(/\s*[,;:(].*$/, '');
  word = word.replace(/[*†‡¹²³⁰-⁹]+$/, '');
  word = word.trim();

  if (word.length < 2) return null;
  // The lists write derived stems as "all-", "ander-", "Lieblings-"; those are
  // real entries, so a trailing hyphen is kept.
  if (!/^[A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß'’\- ]*$/.test(word)) return null;
  if (word.length > 40) return null;
  return word;
}

const collator = new Intl.Collator('de', { sensitivity: 'base' });

/**
 * Indices of the longest strictly increasing run, in document order.
 *
 * Strict, so a column of one repeated word cannot score.
 */
export function longestIncreasingSubsequence(words: string[]): number[] {
  if (words.length === 0) return [];

  const tails: number[] = [];
  const parent = new Array<number>(words.length).fill(-1);

  for (let i = 0; i < words.length; i++) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (collator.compare(words[tails[mid]!]!, words[i]!) < 0) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) parent[i] = tails[lo - 1]!;
    if (lo === tails.length) tails.push(i);
    else tails[lo] = i;
  }

  const out: number[] = [];
  let k = tails.length > 0 ? tails[tails.length - 1]! : -1;
  while (k !== -1) {
    out.push(k);
    k = parent[k]!;
  }
  return out.reverse();
}

export interface ColumnReport {
  column: number;
  lines: number;
  candidates: number;
  headwords: number;
  ratio: number;
  kept: boolean;
  sample: string[];
  extracted: string[];
}

/**
 * Reads every column and keeps the ones that hold a word list.
 *
 * A headword column yields an ascending run over most of its candidates; an
 * example column yields the square-root-sized run of a random sequence. On the
 * published lists the two sit at 65-80% against 10-17%, so the cut is wide.
 */
export function readColumns(
  lines: ColumnLine[],
  columns: number[],
  // Low enough to keep a sub-entry column, which is short but genuine; the
  // ratio is what rejects example columns, not the size.
  { minHeadwords = 25, minRatio = 0.35 }: { minHeadwords?: number; minRatio?: number } = {},
): ColumnReport[] {
  return columns.map((column) => {
    const raw = lines.filter((l) => l.column === column).map((l) => l.text);
    const candidates = raw
      .map((text) => normalizeHeadword(text))
      .filter((w): w is string => w !== null);

    const extracted = longestIncreasingSubsequence(candidates).map((i) => candidates[i]!);
    const ratio = candidates.length > 0 ? extracted.length / candidates.length : 0;
    const kept = extracted.length >= minHeadwords && ratio >= minRatio;

    return {
      column,
      lines: raw.length,
      candidates: candidates.length,
      headwords: extracted.length,
      ratio,
      kept,
      sample: extracted.slice(0, 5),
      extracted: kept ? extracted : [],
    };
  });
}

/**
 * A line that is exactly an article and one noun, with an optional plural
 * marker: "der Tag, -e", "das Wochenende", "die Woche, -e".
 *
 * The lists open with a Wortgruppenliste — days, months, seasons, times —
 * laid out as a grid of these rather than alphabetically, so the ascending run
 * cannot see them. That section holds core vocabulary (Tag, Jahr, Montag,
 * Januar), and leaving it out pushed those words to whichever later list did
 * catch them.
 *
 * Being an exact match, this cannot swallow an example sentence: "Die Kinder
 * spielen auf der Straße." has more than one word after its article.
 */
const ARTICLE_ENTRY = /^(?:der|die|das)\s+([A-ZÄÖÜ][A-Za-zÄÖÜäöüß-]*)\s*(?:,.*)?$/;

/** Article-and-noun entries anywhere in the document, in order of appearance. */
export function extractArticleEntries(lines: ColumnLine[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    if (/\d/.test(line.text)) continue;
    const match = ARTICLE_ENTRY.exec(line.text.trim());
    const word = match?.[1];
    if (word && word.length >= 2) out.push(word);
  }
  return out;
}

const LEVEL_ORDER: Record<Level, number> = { A1: 0, A2: 1, B1: 2 };

/**
 * Merges the lists.
 *
 * They are cumulative — the B1 Wortliste repeats the A1 and A2 vocabulary — so
 * a word belongs to the lowest level it appears at.
 */
export function mergeLevels(entries: { lemma: string; level: Level }[]): Record<string, Level> {
  const out: Record<string, Level> = {};
  for (const { lemma, level } of entries) {
    const existing = out[lemma];
    if (!existing || LEVEL_ORDER[level] < LEVEL_ORDER[existing]) out[lemma] = level;
  }
  return out;
}
