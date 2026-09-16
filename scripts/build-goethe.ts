/**
 * Goethe-Institut Wortlisten (PDF) → data/goethe-levels.json
 *
 * Maps each headword to the level of the lowest list it appears in. The
 * committed output is what gives the course its CEFR levels; without it the
 * app falls back to corpus frequency and labels levels "approximate".
 *
 * These lists are the Goethe-Institut's copyrighted compilations. Bundling
 * them here is the repository owner's decision — see DATA_LICENSES.md, which
 * records what is included and under whose terms.
 *
 *   npm run data:goethe -- A1.pdf A2.pdf B1.pdf
 *   npm run data:goethe -- --preview A1.pdf       # report, write nothing
 *   npm run data:goethe -- --level A2 list.pdf    # name says nothing
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import type { Level } from '../src/lib/content-types.ts';
import { DATA_DIR, writeJson } from './lib/io.ts';
import {
  detectColumns,
  extractArticleEntries,
  levelFromFilename,
  mergeLevels,
  readColumns,
  toColumnLines,
  type PdfItem,
} from './lib/goethe-parse.ts';

/** Sizes the documents state for themselves, used to report coverage. */
const PUBLISHED_SIZE: Record<Level, number> = { A1: 650, A2: 1300, B1: 2400 };

const argv = process.argv.slice(2);
const preview = argv.includes('--preview');
const levelFlagIndex = argv.indexOf('--level');
const levelFlag = levelFlagIndex === -1 ? null : (argv[levelFlagIndex + 1] as Level | undefined);
const files = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--level');

if (files.length === 0) {
  console.error('Give me the Wortliste PDFs:\n  npm run data:goethe -- A1.pdf A2.pdf B1.pdf');
  process.exit(1);
}

async function readItems(path: string): Promise<PdfItem[]> {
  // pdfjs is a dev-only dependency; it never reaches the browser bundle.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(await readFile(path)),
    disableFontFace: true,
    useSystemFonts: false,
  }).promise;

  const items: PdfItem[] = [];
  for (let page = 1; page <= doc.numPages; page++) {
    const content = await (await doc.getPage(page)).getTextContent();
    for (const item of content.items) {
      if (!('str' in item) || item.str.trim().length === 0) continue;
      items.push({
        x: item.transform[4] as number,
        // Halves are enough to group a row, and tolerate sub-point jitter.
        y: Math.round((item.transform[5] as number) * 2) / 2,
        text: item.str,
        page,
      });
    }
  }
  await doc.cleanup();
  return items;
}

const collected: { lemma: string; level: Level }[] = [];
const coverage: { level: Level; found: number }[] = [];

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

  const items = await readItems(path);
  const columns = detectColumns(items);
  const lines = toColumnLines(items, columns);
  const reports = readColumns(lines, columns);

  console.log(`\n${basename(path)} → ${level}`);
  console.log(`  ${items.length.toLocaleString()} text items, columns at ${columns.join(', ')}`);
  for (const r of reports) {
    console.log(
      `    x=${String(r.column).padStart(4)}  ${String(r.lines).padStart(5)} lines  ` +
        `${String(r.candidates).padStart(5)} cand  run=${String(r.headwords).padStart(5)}  ` +
        `${(r.ratio * 100).toFixed(0).padStart(3)}%  ${r.kept ? 'keep' : 'skip'}  ` +
        `${r.sample.slice(0, 4).join(', ')}`,
    );
  }

  // The alphabetical list, plus the thematic Wortgruppenliste, which is a
  // grid of article-and-noun entries rather than a sorted list.
  const grouped = extractArticleEntries(lines);
  const words = [...reports.flatMap((r) => r.extracted), ...grouped];
  // Deduplicated case-sensitively: German capitalisation is semantic, so
  // "essen" (to eat) and "Essen" (the meal) are different words and the course
  // teaches both. Folding case dropped one of every such pair.
  const unique = [...new Set(words)];
  coverage.push({ level, found: unique.length });

  console.log(`    thematic word groups contributed ${grouped.length} article entries`);

  const share = unique.length / PUBLISHED_SIZE[level];
  console.log(
    `  ${unique.length.toLocaleString()} headwords — ` +
      `${(share * 100).toFixed(0)}% of the ~${PUBLISHED_SIZE[level]} this list states`,
  );
  if (share < 0.85) {
    console.log('  ! that is well short; check the kept columns above before trusting it.');
  }

  for (const lemma of unique) collected.push({ lemma, level });
}

const merged = mergeLevels(collected);
const counts: Record<Level, number> = { A1: 0, A2: 0, B1: 0 };
for (const level of Object.values(merged)) counts[level] += 1;

console.log(
  `\n${Object.keys(merged).length.toLocaleString()} words — ` +
    `A1 ${counts.A1}, A2 ${counts.A2}, B1 ${counts.B1}`,
);
if (files.length < 3) {
  console.log(
    '\nNote: these lists are cumulative, so a word takes the lowest level it\n' +
      'appears at. Pass all three to get the levels right.',
  );
}

if (preview) {
  console.log('\n--preview: nothing written.');
  process.exit(0);
}

// Sorted, so a rebuild is a readable diff rather than a reshuffle.
const sorted: Record<string, Level> = {};
for (const lemma of Object.keys(merged).sort((a, b) => a.localeCompare(b, 'de'))) {
  sorted[lemma] = merged[lemma]!;
}
await writeJson(`${DATA_DIR}goethe-levels.json`, sorted);
console.log(`\n✓ data/goethe-levels.json — ${Object.keys(sorted).length} words`);
console.log('  Rebuild the lexicon so the course picks them up:  npm run data:lexicon');
