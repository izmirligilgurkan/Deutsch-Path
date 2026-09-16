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
  /** PDF font name. */
  font: string;
  lines: number;
  /** Lines in this group whose first token looks like a headword at all. */
  words: number;
  /** Share of consecutive words in alphabetical order. The real signal. */
  alphabetical: number;
  /** Share of the words that are distinct, which rejects repeated prose. */
  distinct: number;
  /** Share that are lemmas the course knows. Informational only. */
  knownRate: number;
  sample: string[];
}

export interface ColumnChoice {
  /** Accepted groups, as `${x}|${font}` keys. */
  keys: Set<string>;
  /** Weighted alphabetical rate across the accepted groups. */
  alphabetical: number;
  /** Every candidate, best first, for the report. */
  diagnostics: ColumnGroup[];
}

export function groupKey(x: number, font: string): string {
  return `${Math.round(x)}|${font}`;
}

/**
 * Share of consecutive words in alphabetical order.
 *
 * A column of headwords approaches 1: a Wortliste is alphabetical, and the
 * alphabet runs forward through the whole document, so one column of it is a
 * subsequence of an increasing sequence and stays increasing. A column of
 * example sentences sits near 0.5, because their first words are in no
 * particular order.
 *
 * Non-decreasing rather than strictly increasing, because a real list repeats
 * words legitimately — an entry split across lines, a word listed for two
 * parts of speech, an umlaut variant that German collation treats as equal to
 * its base letter. Requiring a strict increase penalised all of those. The
 * degenerate case this leaves open — a column whose lines all begin with the
 * same word — is caught by `distinctRatio` instead.
 */
export function alphabeticalRate(words: string[]): number {
  if (words.length < 2) return 0;
  let ordered = 0;
  for (let i = 1; i < words.length; i++) {
    if (words[i - 1]!.localeCompare(words[i]!, 'de', { sensitivity: 'base' }) <= 0) ordered += 1;
  }
  return ordered / (words.length - 1);
}

/**
 * Share of the words that are distinct.
 *
 * Running prose is trivially "in order" when every line opens with the same
 * word ("Die …", "Die …"), and so is a repeated label or a page header. A word
 * list is mostly distinct entries; those are not.
 */
export function distinctRatio(words: string[]): number {
  if (words.length === 0) return 0;
  return new Set(words.map((w) => w.toLocaleLowerCase('de-DE'))).size / words.length;
}

/**
 * Picks the columns the headwords are in.
 *
 * Scoring is by alphabetical order, not by how many words the course already
 * knows. The published lists run to thousands of words, most of them outside a
 * 3,000-lemma course vocabulary, so a genuine headword column matches the
 * course only about a third of the time — measuring that picked example
 * sentences instead, whose first words are common and therefore "known".
 *
 * Being sorted is the property that actually distinguishes a word list from
 * running text, and it does not depend on how much of the list we happen to
 * teach.
 */
export function chooseHeadwordColumns(
  lines: PdfLine[],
  isKnownLemma: (word: string) => boolean,
  {
    minWords = 50,
    minAlphabetical = 0.9,
    minDistinct = 0.5,
  }: { minWords?: number; minAlphabetical?: number; minDistinct?: number } = {},
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

    const matched = words.filter((w) => isKnownLemma(w)).length;
    diagnostics.push({
      x: Number(xPart),
      font: fontParts.join('|'),
      lines: group.length,
      words: words.length,
      alphabetical: alphabeticalRate(words),
      distinct: distinctRatio(words),
      knownRate: matched / words.length,
      sample: words.slice(0, 6),
    });
  }
  diagnostics.sort((a, b) => b.alphabetical - a.alphabetical || b.words - a.words);

  const accepted = diagnostics.filter(
    (d) => d.words >= minWords && d.alphabetical >= minAlphabetical && d.distinct >= minDistinct,
  );

  const totalWords = accepted.reduce((n, d) => n + d.words, 0);
  const weighted = accepted.reduce((n, d) => n + d.alphabetical * d.words, 0);

  return {
    keys: new Set(accepted.map((d) => groupKey(d.x, d.font))),
    alphabetical: totalWords > 0 ? weighted / totalWords : 0,
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
