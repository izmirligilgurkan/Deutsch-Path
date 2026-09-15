/**
 * Tatoeba exports → data/sentences.json
 *
 * Sentence text is never edited — only selected. Each record keeps the Tatoeba
 * id, the author's username and the sentence's own licence so the app can
 * attribute it, as CC BY requires.
 *
 * Selection rules, all deterministic:
 *   - the sentence has an English translation on Tatoeba;
 *   - every one of its tokens resolves, by Wiktionary form-table lookup, to a
 *     lemma in data/lexicon.json (or to a proper noun). A sentence that cannot
 *     be fully lemmatized is dropped rather than guessed at;
 *   - its level is the highest level among the lemmas it uses, so an A1
 *     sentence contains nothing above A1;
 *   - sentences by users who declare German as a native language are preferred.
 *
 *   npm run data:sentences
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Lemma, Level, Sentence } from '../src/lib/content-types.ts';
import { formKey, words } from '../src/lib/tokenize.ts';
import {
  DATA_DIR,
  RAW_DIR,
  progress,
  readBz2Lines,
  readTarBz2Lines,
  writeJson,
} from './lib/io.ts';
import { readFile } from 'node:fs/promises';

const CC_BY = 'CC-BY-2.0-FR';
const CC0 = 'CC0-1.0';

/** Keeps the corpus varied without letting one lemma dominate the data file. */
const MAX_SENTENCES_PER_LEMMA = 4;
const MIN_TOKENS = 3;
const MAX_TOKENS = 14;

function need(path: string): string {
  if (!existsSync(path)) {
    console.error(`missing ${path}\nRun: npm run data:fetch`);
    process.exit(1);
  }
  return path;
}

// ── Inputs ─────────────────────────────────────────────────────────────────

const lexiconPath = join(DATA_DIR, 'lexicon.json');
if (!existsSync(lexiconPath)) {
  console.error('missing data/lexicon.json\nRun: npm run data:lexicon');
  process.exit(1);
}
const lexicon = JSON.parse(await readFile(lexiconPath, 'utf8')) as Lemma[];
const levelOf = new Map(lexicon.map((l) => [l.id, l.level ?? 'B1']));

const indexPath = join(RAW_DIR, 'form-index.json');
if (!existsSync(indexPath)) {
  console.error('missing raw/form-index.json\nRun: npm run data:lexicon');
  process.exit(1);
}
const index = JSON.parse(await readFile(indexPath, 'utf8')) as {
  forms: Record<string, string[]>;
  properNames: string[];
};
const forms = new Map(Object.entries(index.forms));
const properNames = new Set(index.properNames);

console.log(
  `lexicon: ${lexicon.length.toLocaleString()} lemmas, ` +
    `${forms.size.toLocaleString()} resolvable forms`,
);

// Native speakers, as users declare themselves (level 5 = native).
const nativeSpeakers = new Set<string>();
for await (const line of readTarBz2Lines(need(join(RAW_DIR, 'user_languages.tar.bz2')))) {
  const [lang, level, username] = line.split('\t');
  if (lang === 'deu' && level === '5' && username) nativeSpeakers.add(username);
}
console.log(`native German contributors: ${nativeSpeakers.size.toLocaleString()}`);

// Sentences whose authors released them under CC0 rather than CC BY.
const cc0Ids = new Set<number>();
for await (const line of readTarBz2Lines(need(join(RAW_DIR, 'sentences_CC0.tar.bz2')))) {
  const id = Number(line.split('\t')[0]);
  if (Number.isFinite(id)) cc0Ids.add(id);
}
console.log(`CC0 sentences: ${cc0Ids.size.toLocaleString()}`);

// German → English translation links.
const linkMap = new Map<number, number[]>();
for await (const line of readBz2Lines(need(join(RAW_DIR, 'deu-eng_links.tsv.bz2')))) {
  const [a, b] = line.split('\t');
  const de = Number(a);
  const en = Number(b);
  if (!Number.isFinite(de) || !Number.isFinite(en)) continue;
  const list = linkMap.get(de);
  if (list) list.push(en);
  else linkMap.set(de, [en]);
}
console.log(`translation links: ${linkMap.size.toLocaleString()} German sentences`);

// ── Candidate German sentences ─────────────────────────────────────────────

const LEVEL_ORDER: Record<Level, number> = { A1: 0, A2: 1, B1: 2 };

interface Candidate {
  id: number;
  de: string;
  author: string;
  lemmas: string[];
  level: Level;
  native: boolean;
  tokenCount: number;
}

const candidates: Candidate[] = [];
const neededEnglish = new Set<number>();

const p = progress('german sentences');
for await (const line of readBz2Lines(need(join(RAW_DIR, 'deu_sentences_detailed.tsv.bz2')))) {
  p.tick();
  const cols = line.split('\t');
  const id = Number(cols[0]);
  const text = cols[2];
  const author = cols[3];
  if (!Number.isFinite(id) || !text || !author || author === '\\N') continue;
  if (!linkMap.has(id)) continue;

  const tokens = words(text);
  if (tokens.length < MIN_TOKENS || tokens.length > MAX_TOKENS) continue;

  // Every token must resolve. Anything unresolved drops the sentence.
  const lemmaIds = new Set<string>();
  let level: Level = 'A1';
  let resolved = true;
  for (const token of tokens) {
    const key = formKey(token);
    const ids = forms.get(key);
    if (!ids) {
      if (properNames.has(key)) continue; // a name is allowed, but not taught
      resolved = false;
      break;
    }
    // An ambiguous form is as easy as its easiest reading.
    let best: Level = 'B1';
    for (const lid of ids) {
      const l = levelOf.get(lid) ?? 'B1';
      if (LEVEL_ORDER[l] < LEVEL_ORDER[best]) best = l;
      lemmaIds.add(lid);
    }
    if (LEVEL_ORDER[best] > LEVEL_ORDER[level]) level = best;
  }
  if (!resolved || lemmaIds.size === 0) continue;

  candidates.push({
    id,
    de: text,
    author,
    lemmas: [...lemmaIds],
    level,
    native: nativeSpeakers.has(author),
    tokenCount: tokens.length,
  });
  for (const en of linkMap.get(id) ?? []) neededEnglish.add(en);
}
console.log(
  `  ${p.count.toLocaleString()} read → ${candidates.length.toLocaleString()} fully lemmatized`,
);

// ── English translations, fetched only for sentences we might keep ─────────

const english = new Map<number, { text: string; author: string }>();
for await (const line of readBz2Lines(need(join(RAW_DIR, 'eng_sentences_detailed.tsv.bz2')))) {
  const cols = line.split('\t');
  const id = Number(cols[0]);
  if (!neededEnglish.has(id)) continue;
  const text = cols[2];
  const author = cols[3];
  if (!text) continue;
  english.set(id, { text, author: author && author !== '\\N' ? author : 'unknown' });
}
console.log(`english translations: ${english.size.toLocaleString()}`);

// ── Select, favouring native authors and short sentences ───────────────────

/**
 * Preferred sentence length per level. Sorting by "shortest first" would fill
 * the corpus with three-word sentences, which are useless for word-order and
 * cloze drills; aiming at a length per level keeps enough structure to blank
 * a word or shuffle the clause.
 */
const TARGET_TOKENS: Record<Level, number> = { A1: 5, A2: 7, B1: 9 };

candidates.sort(
  (a, b) =>
    Number(b.native) - Number(a.native) ||
    Math.abs(a.tokenCount - TARGET_TOKENS[a.level]) -
      Math.abs(b.tokenCount - TARGET_TOKENS[b.level]) ||
    a.id - b.id,
);

const perLemma = new Map<string, number>();
const chosen: Sentence[] = [];

for (const c of candidates) {
  const enId = (linkMap.get(c.id) ?? []).find((id) => english.has(id));
  if (enId === undefined) continue;

  // Keep the sentence only while it still adds examples for a lemma that
  // needs them; this spreads coverage instead of over-sampling common words.
  const useful = c.lemmas.some(
    (id) => (perLemma.get(id) ?? 0) < MAX_SENTENCES_PER_LEMMA,
  );
  if (!useful) continue;
  for (const id of c.lemmas) perLemma.set(id, (perLemma.get(id) ?? 0) + 1);

  const en = english.get(enId)!;
  chosen.push({
    id: c.id,
    de: c.de,
    en: en.text,
    lemmas: c.lemmas,
    author: c.author,
    license: cc0Ids.has(c.id) ? CC0 : CC_BY,
    tatoebaId: c.id,
    enTatoebaId: enId,
    enAuthor: en.author,
    enLicense: cc0Ids.has(enId) ? CC0 : CC_BY,
    level: c.level,
    source: 'Tatoeba',
    sourceUrl: `https://tatoeba.org/en/sentences/show/${c.id}`,
  });
}

chosen.sort((a, b) => a.id - b.id);
await writeJson(join(DATA_DIR, 'sentences.json'), chosen);

// ── Report ─────────────────────────────────────────────────────────────────

const byLevel = new Map<string, number>();
for (const s of chosen) byLevel.set(s.level, (byLevel.get(s.level) ?? 0) + 1);
const covered = [...perLemma.keys()].filter((id) => levelOf.has(id)).length;

console.log(`\n✓ data/sentences.json — ${chosen.length.toLocaleString()} sentences`);
console.log(`  by level: ${[...byLevel].sort().map(([k, v]) => `${k} ${v}`).join(', ')}`);
console.log(
  `  lemma coverage: ${covered.toLocaleString()}/${lexicon.length.toLocaleString()} ` +
    `(${((covered / lexicon.length) * 100).toFixed(1)}%)`,
);
console.log(`  native-authored: ${chosen.filter((s) => nativeSpeakers.has(s.author)).length.toLocaleString()}`);
