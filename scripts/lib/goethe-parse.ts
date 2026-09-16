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

/** German collation, built once: it is called a lot inside the search below. */
const collator = new Intl.Collator('de', { sensitivity: 'base' });

/**
 * Indices of the longest strictly increasing run of words, in document order.
 *
 * This is what actually recovers the headwords. A column in these lists is not
 * a clean list of them: an entry occupies several lines at the same position
 * and in the same face — the headword, then its principal parts, then an
 * example ("abschreiben", "schrieb", "hat", "das", "Matura"). Only the first
 * line of each entry is a headword, and nothing local distinguishes it.
 *
 * What does distinguish it is global: the headwords ascend through the whole
 * document and the continuation lines do not, so the headwords are the longest
 * increasing subsequence and the rest is noise around it.
 *
 * Strictly increasing, so a column of one repeated word cannot score.
 */
export function longestIncreasingSubsequence(words: string[]): number[] {
  if (words.length === 0) return [];

  const tails: number[] = [];
  const parent = new Array<number>(words.length).fill(-1);

  for (let i = 0; i < words.length; i++) {
    // First tail whose word is not less than this one.
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

export interface ColumnGroup {
  x: number;
  font: string;
  lines: number;
  /** Lines whose first token could be a headword at all. */
  words: number;
  /** Length of the ascending run — the headwords this column yields. */
  headwords: number;
  /** headwords / words. Near 0.5 for a real column, near 0.02 for prose. */
  ratio: number;
  /** Share of the headwords the course knows. Informational only. */
  knownRate: number;
  /** The headwords themselves, in document order. */
  extracted: string[];
  sample: string[];
}

export interface ColumnChoice {
  keys: Set<string>;
  /** Headwords found across the accepted columns. */
  headwords: number;
  diagnostics: ColumnGroup[];
}

export function groupKey(x: number, font: string): string {
  return `${Math.round(x)}|${font}`;
}

/**
 * Picks the columns the headwords are in.
 *
 * Scoring is by how long an ascending run the column contains, not by how much
 * of it the course knows and not by how well sorted it is overall. The lists
 * run to thousands of entries, most outside a 3,000-lemma course vocabulary,
 * so overlap picked example sentences instead; and because entries span
 * several lines, even a true headword column is only about 60% ordered, which
 * is too close to the 50% that sentences reach by chance.
 *
 * An ascending run separates them cleanly: a headword column of 1,567 lines
 * yields around 780 ascending words, while an example column of 1,940 yields
 * about 24 — the square-root behaviour of a random sequence.
 */
export function chooseHeadwordColumns(
  lines: PdfLine[],
  isKnownLemma: (word: string) => boolean,
  {
    minHeadwords = 100,
    minRatio = 0.15,
  }: { minHeadwords?: number; minRatio?: number } = {},
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
    const [xPart, ...fontParts] = key.split('|');
    const words: string[] = [];
    for (const line of group) {
      const word = normalizeHeadword(firstToken(line.text));
      if (word) words.push(word);
    }
    if (words.length === 0) continue;

    const extracted = longestIncreasingSubsequence(words).map((i) => words[i]!);
    const matched = extracted.filter((w) => isKnownLemma(w)).length;

    diagnostics.push({
      x: Number(xPart),
      font: fontParts.join('|'),
      lines: group.length,
      words: words.length,
      headwords: extracted.length,
      ratio: extracted.length / words.length,
      knownRate: extracted.length > 0 ? matched / extracted.length : 0,
      extracted,
      sample: extracted.slice(0, 6),
    });
  }

  // Ranked by how many headwords they yield, which is the thing being looked
  // for; ranking by rate buried the real columns under tiny perfect groups.
  diagnostics.sort((a, b) => b.headwords - a.headwords);

  const accepted = diagnostics.filter(
    (d) => d.headwords >= minHeadwords && d.ratio >= minRatio,
  );

  return {
    keys: new Set(accepted.map((d) => groupKey(d.x, d.font))),
    headwords: accepted.reduce((n, d) => n + d.headwords, 0),
    diagnostics,
  };
}

/** Merges the accepted columns' headwords, deduplicated, in document order. */
export function extractHeadwords(
  choice: ColumnChoice,
  isKnownLemma: (word: string) => boolean,
): { known: string[]; unknown: string[] } {
  const known: string[] = [];
  const unknown: string[] = [];
  const seen = new Set<string>();

  for (const group of choice.diagnostics) {
    if (!choice.keys.has(groupKey(group.x, group.font))) continue;
    for (const word of group.extracted) {
      const key = word.toLocaleLowerCase('de-DE');
      if (seen.has(key)) continue;
      seen.add(key);
      (isKnownLemma(word) ? known : unknown).push(word);
    }
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
