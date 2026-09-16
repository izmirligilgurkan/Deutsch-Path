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

export interface ColumnChoice {
  /** Rounded x positions accepted as headword column margins. */
  columns: number[];
  /** Share of lines at those columns whose first word is a known lemma. */
  matchRate: number;
  /** What every candidate column scored, for the report. */
  diagnostics: { x: number; lines: number; matched: number; rate: number }[];
}

/**
 * Picks the columns the headwords are in.
 *
 * A Wortliste sets its headwords at a column margin and its example sentences
 * indented or in another face. Rather than hard-coding a position, every
 * candidate margin is scored by how often the word at that position is a lemma
 * the course already knows — a headword column scores very high, a column of
 * example sentences does not.
 */
/**
 * How far apart two accepted positions must be to count as separate columns
 * rather than a margin and the indent beneath it.
 */
const COLUMN_REGION = 60;

export function chooseHeadwordColumns(
  lines: PdfLine[],
  isKnownLemma: (word: string) => boolean,
  { minLines = 20, minRate = 0.5 }: { minLines?: number; minRate?: number } = {},
): ColumnChoice {
  const byX = new Map<number, PdfLine[]>();
  for (const line of lines) {
    const x = Math.round(line.x);
    const bucket = byX.get(x);
    if (bucket) bucket.push(line);
    else byX.set(x, [line]);
  }

  const diagnostics = [...byX.entries()]
    .filter(([, group]) => group.length >= minLines)
    .map(([x, group]) => {
      let matched = 0;
      for (const line of group) {
        const word = normalizeHeadword(firstToken(line.text));
        if (word && isKnownLemma(word)) matched += 1;
      }
      return { x, lines: group.length, matched, rate: matched / group.length };
    })
    .sort((a, b) => b.rate - a.rate || b.lines - a.lines);

  // A headword column and the indent its examples sit at both score well, and
  // example sentences often begin with a word the course knows. Within one
  // column region the headwords are the leftmost position, so keep that and
  // drop its indents.
  const candidates = diagnostics.filter((d) => d.rate >= minRate).map((d) => d.x).sort((a, b) => a - b);
  const columns: number[] = [];
  for (const x of candidates) {
    const previous = columns[columns.length - 1];
    if (previous === undefined || x - previous > COLUMN_REGION) columns.push(x);
  }
  const accepted = diagnostics.filter((d) => columns.includes(d.x));
  const totalLines = accepted.reduce((n, d) => n + d.lines, 0);
  const totalMatched = accepted.reduce((n, d) => n + d.matched, 0);

  return {
    columns,
    matchRate: totalLines > 0 ? totalMatched / totalLines : 0,
    diagnostics,
  };
}

/** Headwords found at the chosen columns, deduplicated, in document order. */
export function extractHeadwords(
  lines: PdfLine[],
  columns: number[],
  isKnownLemma: (word: string) => boolean,
): { known: string[]; unknown: string[] } {
  const wanted = new Set(columns);
  const known: string[] = [];
  const unknown: string[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    if (wanted.size > 0 && !wanted.has(Math.round(line.x))) continue;
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
