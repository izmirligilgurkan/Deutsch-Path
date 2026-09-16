import type { Level } from '../../src/lib/content-types.ts';

/**
 * Parsing for the Goethe-Institut Wortlisten.
 *
 * These PDFs are copyrighted, so this code never sees one in this repository
 * and never runs in CI — it runs on the learner's machine against a file they
 * downloaded themselves, and its output is gitignored.
 *
 * Because the layout cannot be checked in as a fixture, nothing here is tuned
 * to a fixed position on the page. The parser measures the document, picks the
 * columns whose first words actually look like German lemmas, and reports what
 * it decided so the learner can check it before anything is written.
 */

/** One rendered line of text, with where it starts on the page. */
export interface PdfLine {
  text: string;
  /** Left edge, in PDF points. Headwords sit at a column margin. */
  x: number;
  page: number;
  font: string;
}

export function levelFromFilename(filename: string): Level | null {
  // "Goethe-Zertifikat_B1_Wortliste.pdf", "start deutsch 1 a1 wortliste.pdf".
  // Separators are normalised to spaces first: an underscore counts as a word
  // character, so \b would not see a boundary in "_B1_" — which is exactly how
  // the published filenames are written.
  const name = filename.toUpperCase().replace(/[^A-Z0-9]+/g, ' ');
  if (/\bA1\b|\bSTART DEUTSCH 1\b/.test(name)) return 'A1';
  if (/\bA2\b/.test(name)) return 'A2';
  if (/\bB1\b/.test(name)) return 'B1';
  return null;
}

/** Grammatical annotations a Wortliste attaches to its headwords. */
const TRAILING_NOISE = [
  /\s*\(.*$/, // "(sich)", "(Präp. + Dat.)"
  /\s*,.*$/, // ", der, -e"  — plural and gender markers
  /\s*[;:].*$/,
  /[*†‡¹²³⁰-⁹]+$/, // footnote markers
];

const LEADING_ARTICLE = /^(?:der|die|das)\s+/i;

/**
 * Reduces a raw line to the lemma it announces, or null when the line is not
 * a headword at all. Selection and trimming only — no word is altered.
 */
export function normalizeHeadword(raw: string): string | null {
  let word = raw.trim();
  if (word.length === 0) return null;

  word = word.replace(LEADING_ARTICLE, '');
  for (const pattern of TRAILING_NOISE) word = word.replace(pattern, '');
  word = word.replace(/^[^A-Za-zÄÖÜäöüß]+/, '').replace(/[^A-Za-zÄÖÜäöüß)]+$/, '');
  word = word.trim();

  if (word.length < 2) return null; // alphabet section headers: "A", "B", …
  // Checked against the raw line, not the cleaned word: "Seite 12" in a page
  // footer would otherwise reduce to "Seite", which is a real German noun and
  // would be accepted.
  if (/\d/.test(raw)) return null;
  // Separable verbs are one word in the infinitive, so a space here means the
  // line is a phrase or an example sentence, not a headword.
  if (/\s/.test(word)) return null;
  if (word.length > 30) return null;
  if (!/^[A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß'-]*$/.test(word)) return null;

  return word;
}

/** The first whitespace-delimited token of a line. */
export function firstToken(line: string): string {
  return line.trim().split(/\s+/)[0] ?? '';
}

export interface ColumnGroup {
  /** Rounded x of the column margin. */
  x: number;
  /** PDF font name. A Wortliste sets its headwords in a different face. */
  font: string;
  lines: number;
  matched: number;
  rate: number;
  /** A few words from this group, so a wrong pick is obvious in the report. */
  sample: string[];
}

export interface ColumnChoice {
  /** Accepted groups, as `${x}|${font}` keys. */
  keys: Set<string>;
  /** Share of lines in the accepted groups whose first word is a known lemma. */
  matchRate: number;
  /** Every candidate, best first, for the report. */
  diagnostics: ColumnGroup[];
}

export function groupKey(x: number, font: string): string {
  return `${Math.round(x)}|${font}`;
}

/**
 * How far apart two accepted positions in the same face must be to count as
 * separate columns rather than a margin and the indent beneath it.
 */
const COLUMN_REGION = 60;

/**
 * Picks the columns the headwords are in.
 *
 * Grouping is by position *and* typeface. A Wortliste sets its headwords in
 * bold and its examples in roman or italic, often starting at the same margin,
 * so position alone cannot separate them — scoring x on its own picks up
 * example sentences, whose first word is frequently a known lemma too.
 *
 * Each group is scored by how often the word at that position is a lemma the
 * course already knows. A real headword column scores near 100%; a column of
 * example sentences scores far lower, which is what the threshold rejects.
 */
export function chooseHeadwordColumns(
  lines: PdfLine[],
  isKnownLemma: (word: string) => boolean,
  { minLines = 20, minRate = 0.8 }: { minLines?: number; minRate?: number } = {},
): ColumnChoice {
  const groups = new Map<string, PdfLine[]>();
  for (const line of lines) {
    const key = groupKey(line.x, line.font);
    const bucket = groups.get(key);
    if (bucket) bucket.push(line);
    else groups.set(key, [line]);
  }

  const diagnostics: ColumnGroup[] = [];
  for (const [key, group] of groups) {
    if (group.length < minLines) continue;
    const [xPart, ...fontParts] = key.split('|');
    let matched = 0;
    const sample: string[] = [];
    for (const line of group) {
      const word = normalizeHeadword(firstToken(line.text));
      if (word && isKnownLemma(word)) {
        matched += 1;
        if (sample.length < 6) sample.push(word);
      }
    }
    diagnostics.push({
      x: Number(xPart),
      font: fontParts.join('|'),
      lines: group.length,
      matched,
      rate: matched / group.length,
      sample,
    });
  }
  diagnostics.sort((a, b) => b.rate - a.rate || b.lines - a.lines);

  // Within one face, a headword margin and the indent under it both score;
  // the headwords are the leftmost position, so drop the indents.
  const accepted: ColumnGroup[] = [];
  for (const group of diagnostics.filter((d) => d.rate >= minRate)) {
    const shadowed = accepted.some(
      (a) => a.font === group.font && Math.abs(a.x - group.x) < COLUMN_REGION && a.x <= group.x,
    );
    if (!shadowed) accepted.push(group);
  }

  const totalLines = accepted.reduce((n, d) => n + d.lines, 0);
  const totalMatched = accepted.reduce((n, d) => n + d.matched, 0);

  return {
    keys: new Set(accepted.map((d) => groupKey(d.x, d.font))),
    matchRate: totalLines > 0 ? totalMatched / totalLines : 0,
    diagnostics,
  };
}

/** Headwords found in the chosen groups, deduplicated, in document order. */
export function extractHeadwords(
  lines: PdfLine[],
  keys: Set<string>,
  isKnownLemma: (word: string) => boolean,
): { known: string[]; unknown: string[] } {
  const known: string[] = [];
  const unknown: string[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    if (keys.size > 0 && !keys.has(groupKey(line.x, line.font))) continue;
    const word = normalizeHeadword(firstToken(line.text));
    if (!word || seen.has(word)) continue;
    seen.add(word);
    (isKnownLemma(word) ? known : unknown).push(word);
  }

  return { known, unknown };
}

const LEVEL_ORDER: Record<Level, number> = { A1: 0, A2: 1, B1: 2 };

/**
 * Merges the lists.
 *
 * The B1 Wortliste repeats the A1 and A2 vocabulary, so a word present in
 * several lists takes the lowest level it appears at — that is the level it is
 * actually introduced.
 */
export function mergeLevels(entries: { lemma: string; level: Level }[]): Record<string, Level> {
  const out: Record<string, Level> = {};
  for (const { lemma, level } of entries) {
    const existing = out[lemma];
    if (!existing || LEVEL_ORDER[level] < LEVEL_ORDER[existing]) out[lemma] = level;
  }
  return out;
}
