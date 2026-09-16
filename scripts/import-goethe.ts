/**
 * Learner-only, run locally: Goethe Wortlisten PDFs → goethe-levels.json.
 *
 * The Goethe-Institut word lists are copyrighted compilations. This script
 * never runs in CI, its output is gitignored, and the JSON is loaded straight
 * into IndexedDB on the learner's own device through the "Import level list"
 * screen. Nothing it produces may be committed or served.
 *
 * Usage:
 *   npm run data:goethe -- ~/Downloads/Goethe-Zertifikat_B1_Wortliste.pdf
 *   npm run data:goethe -- A1.pdf A2.pdf B1.pdf        # all three at once
 *   npm run data:goethe -- --preview B1.pdf            # report, write nothing
 *   npm run data:goethe -- --text B1.pdf | head -40    # dump the raw layout
 *   npm run data:goethe -- --level A2 wortliste.pdf    # name says nothing
 *
 * Importing all three lists is better than importing only B1: the B1 list
 * repeats the A1 and A2 vocabulary, so on its own it marks every word B1.
 */
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import type { Lemma, Level } from '../src/lib/content-types.ts';
import { formKey } from '../src/lib/tokenize.ts';
import { DATA_DIR, ROOT } from './lib/io.ts';
import {
  chooseHeadwordColumns,
  extractHeadwords,
  groupKey,
  levelFromFilename,
  mergeLevels,
  type PdfLine,
} from './lib/goethe-parse.ts';

const argv = process.argv.slice(2);
const preview = argv.includes('--preview');
const dumpText = argv.includes('--text');
const levelFlagIndex = argv.indexOf('--level');
const levelFlag = levelFlagIndex === -1 ? null : (argv[levelFlagIndex + 1] as Level | undefined);
const outIndex = argv.indexOf('--out');
const outPath = resolve(
  outIndex === -1 ? `${ROOT}goethe-levels.json` : argv[outIndex + 1] ?? `${ROOT}goethe-levels.json`,
);

const files = argv.filter(
  (a, i) =>
    !a.startsWith('--') &&
    argv[i - 1] !== '--level' &&
    argv[i - 1] !== '--out',
);

if (files.length === 0) {
  console.error(
    'Give me at least one Wortliste PDF.\n\n' +
      '  npm run data:goethe -- ~/Downloads/Goethe-Zertifikat_B1_Wortliste.pdf\n\n' +
      'Import all three lists if you have them — the B1 list repeats the A1 and\n' +
      'A2 vocabulary, so on its own everything comes out as B1.',
  );
  process.exit(1);
}

// ── The course vocabulary, used both to filter and to find the columns ──────

const lexiconPath = `${DATA_DIR}lexicon/core.json`;
if (!existsSync(lexiconPath)) {
  console.error(`missing ${lexiconPath}\nRun: npm run data:lexicon`);
  process.exit(1);
}
const lexicon = JSON.parse(await readFile(lexiconPath, 'utf8')) as Lemma[];
/** Case-folded, because a list may print a headword differently. */
const byKey = new Map(lexicon.map((l) => [formKey(l.lemma), l.lemma]));
const isKnownLemma = (word: string) => byKey.has(formKey(word));

// ── PDF text, with the position of every line ──────────────────────────────

/**
 * Horizontal gap, in points, that means "different column" rather than a wide
 * word space. A Wortliste's gutter is far wider than any inter-word gap.
 */
const COLUMN_GUTTER = 24;

async function readPdfLines(path: string): Promise<PdfLine[]> {
  // pdfjs is a dev-only dependency: it never reaches the browser bundle.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(await readFile(path)),
    // The list is text; skipping the rest keeps this fast and quiet.
    disableFontFace: true,
    useSystemFonts: false,
  }).promise;

  const lines: PdfLine[] = [];
  for (let pageNo = 1; pageNo <= doc.numPages; pageNo++) {
    const page = await doc.getPage(pageNo);
    const content = await page.getTextContent();

    // Group items into visual lines by their y position; a Wortliste's
    // headwords and examples sit on separate lines.
    const rows = new Map<number, { x: number; width: number; text: string; font: string }[]>();
    for (const item of content.items) {
      if (!('str' in item) || item.str.trim().length === 0) continue;
      const x = item.transform[4] as number;
      const y = Math.round((item.transform[5] as number) * 2) / 2;
      const row = rows.get(y);
      const entry = { x, width: item.width ?? 0, text: item.str, font: item.fontName ?? '' };
      if (row) row.push(entry);
      else rows.set(y, [entry]);
    }

    for (const [, row] of [...rows.entries()].sort((a, b) => b[0] - a[0])) {
      row.sort((a, b) => a.x - b.x);

      // A y position is shared by every column on the page, so a row has to be
      // split at the gutters — otherwise the columns merge into one line and
      // everything but the leftmost column is lost.
      let group: typeof row = [];
      const flush = () => {
        if (group.length === 0) return;
        const first = group[0]!;
        lines.push({
          text: group.map((r) => r.text).join(' ').replace(/\s+/g, ' ').trim(),
          x: first.x,
          page: pageNo,
          font: first.font,
        });
        group = [];
      };

      for (const item of row) {
        const previous = group[group.length - 1];
        if (previous && item.x - (previous.x + previous.width) > COLUMN_GUTTER) flush();
        group.push(item);
      }
      flush();
    }
  }

  await doc.cleanup();
  return lines;
}

// ── Run ────────────────────────────────────────────────────────────────────

const collected: { lemma: string; level: Level }[] = [];
const perFileFound: { level: Level; found: number }[] = [];
let sawTrouble = false;

for (const file of files) {
  const path = resolve(file);
  if (!existsSync(path)) {
    console.error(`✗ no such file: ${path}`);
    process.exit(1);
  }

  const level = levelFlag ?? levelFromFilename(basename(path));
  if (!level || !['A1', 'A2', 'B1'].includes(level)) {
    console.error(
      `✗ cannot tell which level ${basename(path)} is.\n` +
        '  Pass it explicitly:  npm run data:goethe -- --level B1 <pdf>',
    );
    process.exit(1);
  }

  console.log(`\n${basename(path)} → ${level}`);
  const lines = await readPdfLines(path);
  console.log(`  ${lines.length.toLocaleString()} lines of text`);

  if (dumpText) {
    // Escape hatch: if the columns come out wrong, this shows the real layout.
    for (const line of lines.slice(0, 400)) {
      console.log(`    p${line.page} x=${line.x.toFixed(1)} ${line.font}  ${line.text}`);
    }
    continue;
  }

  const choice = chooseHeadwordColumns(lines, isKnownLemma);

  if (choice.keys.size === 0) {
    sawTrouble = true;
    console.error(
      '  ✗ no column yielded a long ascending run of words, so nothing was\n' +
        '    taken from this file. The columns with the longest runs were:',
    );
    console.error('      x     font           lines  words  headw  ratio  known  sample');
    for (const d of choice.diagnostics.slice(0, 12)) {
      console.error(
        `      ${String(d.x).padStart(4)}  ${d.font.padEnd(13)} ` +
          `${String(d.lines).padStart(5)}  ${String(d.words).padStart(5)}  ` +
          `${String(d.headwords).padStart(5)}  ${(d.ratio * 100).toFixed(0).padStart(4)}%  ` +
          `${(d.knownRate * 100).toFixed(0).padStart(4)}%  ${d.sample.slice(0, 5).join(', ')}`,
      );
    }
    console.error(
      '    Run the same command with --text to dump the raw lines, and send\n' +
        '    the first ~60 of them so the parser can be taught this layout.',
    );
    continue;
  }

  const { known, unknown } = extractHeadwords(choice, isKnownLemma);
  console.log(`  ${choice.keys.size} headword column(s), ${choice.headwords} headwords`);
  for (const d of choice.diagnostics.filter((g) => choice.keys.has(groupKey(g.x, g.font)))) {
    console.log(
      `    x=${String(d.x).padStart(4)} ${d.font.padEnd(12)} ` +
        `${String(d.headwords).padStart(5)} of ${String(d.words).padStart(5)} lines  ` +
        `${d.sample.slice(0, 4).join(', ')}`,
    );
  }
  console.log(`  ${known.length.toLocaleString()} words matched the course vocabulary`);
  console.log(
    `  ${unknown.length.toLocaleString()} not in the course and skipped` +
      (unknown.length > 0 ? ` (e.g. ${unknown.slice(0, 6).join(', ')})` : ''),
  );
  if (known.length > 0) console.log(`  sample: ${known.slice(0, 10).join(', ')}`);

  if (known.length < 50) {
    sawTrouble = true;
    console.error('  ! that looks too low — check the sample above before trusting it.');
  }

  // Counted before the course filter: coverage is about how much of the
  // published list was read, not how much of it this course happens to teach.
  perFileFound.push({ level, found: known.length + unknown.length });

  for (const word of known) {
    // Store the course's own spelling, which is what the app matches on.
    collected.push({ lemma: byKey.get(formKey(word)) ?? word, level });
  }
}

if (dumpText) process.exit(0);

const merged = mergeLevels(collected);
const counts = { A1: 0, A2: 0, B1: 0 };
for (const level of Object.values(merged)) counts[level] += 1;

console.log(
  `\n${Object.keys(merged).length.toLocaleString()} words total — ` +
    `A1 ${counts.A1}, A2 ${counts.A2}, B1 ${counts.B1}`,
);

/**
 * The published lists are cumulative: the B1 Wortliste repeats the A1 and A2
 * vocabulary. A word's level is therefore the lowest list it appears in — so
 * when extraction misses a word in the A1 file but catches it in the B1 file,
 * it comes out labelled B1 rather than A1.
 *
 * The A1 foreword states its list holds about 650 words, A2 about 1,300 and
 * B1 about 2,400. Comparing against those says how much of each list was read,
 * which is what decides whether the levels can be trusted.
 */
const EXPECTED: Record<Level, number> = { A1: 650, A2: 1300, B1: 2400 };
const coverage = perFileFound.map(
  (f) => ({ ...f, share: f.found / EXPECTED[f.level] }),
);
if (coverage.length > 0) {
  console.log('\ncoverage against the published list sizes:');
  for (const c of coverage) {
    console.log(
      `  ${c.level}  ${String(c.found).padStart(5)} of ~${EXPECTED[c.level]}  ` +
        `${(c.share * 100).toFixed(0).padStart(3)}%`,
    );
  }
  const weakest = Math.min(...coverage.map((c) => c.share));
  if (weakest < 0.85) {
    console.log(
      '\n! These lists are cumulative — the B1 list repeats A1 and A2 — so a\n' +
        '  level is only as good as the *lower* list it was checked against.\n' +
        '  With a lower list partly read, some words that belong to it come out\n' +
        '  one or two levels too high, which would place common words late in\n' +
        '  the course. The levels the app already uses come from corpus\n' +
        '  frequency; importing this trades one approximation for another.\n' +
        '  You can clear an imported list at any time from the same screen.',
    );
  }
}

if (Object.keys(merged).length === 0) {
  console.error('\nNothing to write. See the notes above.');
  process.exit(1);
}

if (preview) {
  console.log('\n--preview: nothing written. Drop the flag to write the file.');
  process.exit(sawTrouble ? 1 : 0);
}

// A half-read list is worse than none: it would relabel levels with whatever
// the example sentences happened to start with.
if (sawTrouble && !argv.includes('--force')) {
  console.error(
    '\n✗ not writing the file — the results above do not look like a word list.\n' +
      '  Re-run with --text to see the layout, or --force to write anyway.',
  );
  process.exit(1);
}

await writeFile(outPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
console.log(`\n✓ ${outPath}`);
console.log('  This file is gitignored. Load it in the app:');
console.log('  Settings → Import level list → Choose goethe-levels.json');
if (files.length < 3) {
  console.log(
    '\nNote: you imported ' + files.length + ' list(s). The B1 Wortliste repeats the\n' +
      'A1 and A2 vocabulary, so importing all three gives more accurate levels.',
  );
}
