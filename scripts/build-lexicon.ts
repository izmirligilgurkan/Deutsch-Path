/**
 * kaikki German JSONL → data/lexicon.json
 *
 * Vocabulary is *selected*, never written. Every field on every lemma comes
 * straight from a Wiktionary entry; if Wiktionary does not state a gender, a
 * plural or a verb's principal parts, the lemma is dropped rather than filled
 * in from anywhere else.
 *
 * Ordering: no openly licensed German frequency list was found whose licence
 * clearly permits redistribution, so rank comes from how often a lemma's forms
 * occur across the Tatoeba German corpus — CC-BY data we already bundle. Levels
 * derived this way are marked `levelSource: 'frequency-approx'` and the UI
 * labels them approximate. Importing a Goethe list on-device overrides them.
 *
 *   npm run data:lexicon
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Form, Lemma } from '../src/lib/content-types.ts';
import { formKey, words } from '../src/lib/tokenize.ts';
import {
  extractForms,
  extractGlosses,
  extractNounFacts,
  extractVerbFacts,
  isFormOnlyEntry,
  isIndexableForm,
  isPointerEntry,
  isTypeableHeadword,
  lemmaId,
  trimForms,
  mapPos,
  wiktionaryUrl,
  type KaikkiEntry,
  type NounFacts,
  type VerbFacts,
} from './lib/kaikki.ts';
import { DATA_DIR, RAW_DIR, progress, readBz2Lines, readLines, writeJson } from './lib/io.ts';

const SOURCE_NAME = 'Wiktionary (English) via kaikki.org';
const LICENSE = 'CC-BY-SA-4.0';

/**
 * Level bands by frequency rank. Sized to match the scale of the Goethe
 * Wortlisten (roughly 650 / 1300 / 2400 cumulative) so that importing a real
 * list later shifts words between levels rather than changing the course size.
 */
const BANDS: { level: 'A1' | 'A2' | 'B1'; upTo: number }[] = [
  { level: 'A1', upTo: 650 },
  { level: 'A2', upTo: 1650 },
  { level: 'B1', upTo: 3000 },
];
const TOTAL_LEMMAS = BANDS[BANDS.length - 1]!.upTo;

/**
 * Facts are extracted during the single pass over the dump rather than by
 * retaining parsed entries: holding 370k raw wiktextract objects costs several
 * GB and sends the build into GC thrash.
 */
interface Candidate {
  id: string;
  word: string;
  pos: Exclude<ReturnType<typeof mapPos>, null>;
  forms: Form[];
  glosses: string[];
  noun?: NounFacts;
  verb?: VerbFacts;
  score: number;
}

// ── Pass 1: read every German lemma entry out of the dump ───────────────────

console.log('reading kaikki dump…');
const kaikkiPath = join(RAW_DIR, 'kaikki-german.jsonl');
if (!existsSync(kaikkiPath)) {
  console.error(`missing ${kaikkiPath}\nRun: npm run data:fetch`);
  process.exit(1);
}

const candidates = new Map<string, Candidate>();
/**
 * Two indexes over the same forms:
 *  - `exactIndex` keys on the surface form as written. Scoring uses it so that
 *    the capitalized noun `Ich` ("ego") cannot inherit the frequency of the
 *    pronoun `ich`.
 *  - `formIndex` is case-folded, and is what resolves tokens in a real
 *    sentence, where the first word is capitalized regardless of its class.
 */
const exactIndex = new Map<string, string[]>();
const formIndex = new Map<string, string[]>();
/** Surface forms of proper nouns — allowed inside sentences, never taught. */
const properNames = new Set<string>();

const p1 = progress('entries');
for await (const line of readLines(kaikkiPath)) {
  p1.tick();
  let entry: KaikkiEntry;
  try {
    entry = JSON.parse(line) as KaikkiEntry;
  } catch {
    continue; // A truncated final line is not worth failing the build over.
  }
  if (entry.lang_code !== 'de') continue;

  const word = entry.word;
  if (typeof word !== 'string' || word.length === 0) continue;

  if (entry.pos === 'name') {
    properNames.add(formKey(word));
    for (const f of extractForms(entry)) properNames.add(formKey(f.form));
    continue;
  }

  const pos = mapPos(entry.pos);
  if (!pos) continue;
  if (isFormOnlyEntry(entry)) continue; // an inflection of some other lemma

  const glosses = extractGlosses(entry);
  if (glosses.length === 0) continue;
  // "alternative form of wir" and friends would otherwise inherit the
  // frequency of the word they point at.
  if (isPointerEntry(glosses)) continue;
  if (!isTypeableHeadword(word)) continue;

  const id = lemmaId(word, pos);
  if (candidates.has(id)) continue; // keep the first etymology only

  const entryForms = trimForms(extractForms(entry));
  const candidate: Candidate = { id, word, pos, forms: entryForms, glosses, score: 0 };
  if (pos === 'noun') candidate.noun = extractNounFacts(entry);
  if (pos === 'verb') candidate.verb = extractVerbFacts(entry);
  candidates.set(id, candidate);

  // Index the lemma and every inflected form Wiktionary lists for it.
  const add = (map: Map<string, string[]>, key: string) => {
    if (key.length === 0) return;
    const ids = map.get(key);
    if (ids) {
      if (!ids.includes(id)) ids.push(id);
    } else {
      map.set(key, [id]);
    }
  };
  const register = (surface: string) => {
    add(formIndex, formKey(surface));
    add(exactIndex, surface);
  };
  register(word);
  for (const f of entryForms.filter(isIndexableForm)) {
    // Only single-token forms are indexed. Splitting multi-word forms into
    // their parts ("am schönsten", "steht auf") would register "am" against
    // every adjective and every particle against its verb, which swamps the
    // frequency signal with constants. A separated separable verb still
    // resolves through its base verb ("steht" → stehen); it is attributed to
    // the base rather than guessed at.
    const parts = words(f.form);
    if (parts.length === 1) register(parts[0]!);
  }
}
console.log(
  `  ${p1.count.toLocaleString()} entries → ${candidates.size.toLocaleString()} lemmas, ` +
    `${formIndex.size.toLocaleString()} distinct forms, ${properNames.size.toLocaleString()} proper-noun forms`,
);

// ── Pass 2: score lemmas by how often their forms occur in Tatoeba ──────────

console.log('scoring against the Tatoeba German corpus…');
const deuPath = join(RAW_DIR, 'deu_sentences_detailed.tsv.bz2');
if (!existsSync(deuPath)) {
  console.error(`missing ${deuPath}\nRun: npm run data:fetch`);
  process.exit(1);
}

// Counting surface forms first and distributing once per *distinct* form —
// rather than once per occurrence — keeps this linear. A form like "die"
// resolves to thousands of lemmas, so per-occurrence distribution is
// quadratic and does not finish.
const formCounts = new Map<string, number>();
const p2 = progress('sentences');
for await (const line of readBz2Lines(deuPath)) {
  p2.tick();
  const text = line.split('\t')[2];
  if (!text) continue;
  // The first token is skipped: German capitalises it whatever its word
  // class, so it cannot distinguish a noun from a like-spelled function word.
  const tokens = words(text);
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i]!;
    // Tatoeba leans hard on a few placeholder names (Tom, Maria). Counting
    // them would say more about the corpus than about German.
    if (properNames.has(formKey(token))) continue;
    formCounts.set(token, (formCounts.get(token) ?? 0) + 1);
  }
}

/**
 * Ambiguous surface forms are allocated in proportion to the evidence each
 * lemma has from forms that are *not* ambiguous.
 *
 * An even split lets a rare word inherit half the frequency of a common
 * homograph — it is why "haten" (to hate) scored like "haben". Weighting by
 * unambiguous evidence sends "hat" almost entirely to "haben", which has
 * plenty of unique forms of its own, while "haten" keeps only its own rare
 * ones. This is a single deterministic allocation step over counts, not a
 * trained model.
 */
const unique = new Map<string, number>();
const ambiguous: [string[], number][] = [];
for (const [key, count] of formCounts) {
  const ids = exactIndex.get(key);
  if (!ids) continue;
  if (ids.length === 1) {
    const id = ids[0]!;
    unique.set(id, (unique.get(id) ?? 0) + count);
  } else {
    ambiguous.push([ids, count]);
  }
}

for (const [id, score] of unique) {
  const c = candidates.get(id);
  if (c) c.score += score;
}

// A small floor keeps a lemma with no unambiguous form in the running.
const PRIOR = 1;
for (const [ids, count] of ambiguous) {
  let total = 0;
  for (const id of ids) total += (unique.get(id) ?? 0) + PRIOR;
  for (const id of ids) {
    const c = candidates.get(id);
    if (c) c.score += (count * ((unique.get(id) ?? 0) + PRIOR)) / total;
  }
}
console.log(
  `  scored over ${p2.count.toLocaleString()} sentences, ` +
    `${formCounts.size.toLocaleString()} distinct surface forms`,
);

// ── Select: rank by score, keep what Wiktionary describes completely ────────

function isTeachable(c: Candidate): boolean {
  if (c.score <= 0) return false;
  // Multi-word headwords make poor drill targets; separable verbs are still
  // single words in the infinitive ("aufstehen"), so nothing needed is lost.
  if (/\s/.test(c.word)) return false;

  if (c.noun) {
    if (!c.noun.gender && !c.noun.pluralOnly) return false;
    if (!c.noun.plural && !c.noun.noPlural && !c.noun.pluralOnly) return false;
  }
  if (c.verb) {
    // B1 drills conjugate and build the Perfekt, so all four parts are needed.
    const { thirdSg, praeteritum, partizip2, auxiliary } = c.verb;
    if (!thirdSg || !praeteritum || !partizip2 || !auxiliary) return false;
  }
  return true;
}

/**
 * One headword, one entry. Wiktionary splits `nicht` into an adverb and an
 * interjection and `zu` into four parts of speech; drilling each separately
 * would just ask the same question repeatedly. The highest-scoring reading
 * wins, and a second part of speech is kept only when it is substantial in
 * its own right rather than a marginal sense of the same word.
 */
const SECOND_SENSE_THRESHOLD = 0.4;

/**
 * Parts of speech that are never worth a second card for a word already
 * taught: Wiktionary's interjection reading of `nicht` ("right?") and particle
 * reading of `zu` are marginal senses of words the learner meets as an adverb
 * and a preposition.
 */
const NEVER_A_SECOND_SENSE = new Set(['interj', 'particle']);

const byScore = [...candidates.values()]
  .filter(isTeachable)
  .sort((a, b) => b.score - a.score || a.word.localeCompare(b.word, 'de'));

const keptPerWord = new Map<string, { top: number; count: number }>();
const ranked: Candidate[] = [];
for (const c of byScore) {
  const key = formKey(c.word);
  const seen = keptPerWord.get(key);
  if (!seen) {
    keptPerWord.set(key, { top: c.score, count: 1 });
  } else if (
    seen.count < 2 &&
    c.score >= seen.top * SECOND_SENSE_THRESHOLD &&
    !NEVER_A_SECOND_SENSE.has(c.pos)
  ) {
    seen.count += 1;
  } else {
    continue;
  }
  ranked.push(c);
  if (ranked.length >= TOTAL_LEMMAS) break;
}

function bandFor(rank: number): 'A1' | 'A2' | 'B1' {
  for (const band of BANDS) if (rank <= band.upTo) return band.level;
  return 'B1';
}

const lexicon: Lemma[] = ranked.map((c, i) => {
  const rank = i + 1;
  const lemma: Lemma = {
    id: c.id,
    lemma: c.word,
    pos: c.pos,
    forms: c.forms,
    glosses: c.glosses,
    level: bandFor(rank),
    levelSource: 'frequency-approx',
    freqRank: rank,
    source: SOURCE_NAME,
    sourceUrl: wiktionaryUrl(c.word),
    license: LICENSE,
    modified: 'Filtered to this course; fields trimmed. No text rewritten.',
  };

  if (c.noun) {
    if (c.noun.gender) lemma.gender = c.noun.gender;
    if (c.noun.plural) lemma.plural = c.noun.plural;
    if (c.noun.noPlural) lemma.noPlural = true;
    if (c.noun.pluralOnly) lemma.pluralOnly = true;
  }
  if (c.verb) {
    lemma.principalParts = {
      thirdSg: c.verb.thirdSg,
      praeteritum: c.verb.praeteritum,
      partizip2: c.verb.partizip2,
      auxiliary: c.verb.auxiliary,
    };
    if (c.verb.separable) lemma.separable = true;
  }
  return lemma;
});

/**
 * Output is split so a phone downloads only what it needs.
 *
 * `core.json` carries every field the app uses on most screens — headword,
 * gender, plural, glosses, principal parts — but not the inflection tables,
 * which are 80% of the bytes and are only needed by the declension and
 * conjugation drills. Those load per level, on demand.
 */
const core: Lemma[] = lexicon.map(({ forms: _forms, ...rest }) => ({ ...rest, forms: [] }));
await writeJson(join(DATA_DIR, 'lexicon', 'core.json'), core);

for (const level of ['A1', 'A2', 'B1'] as const) {
  const forms: Record<string, Form[]> = {};
  for (const l of lexicon) {
    if (l.level === level) forms[l.id] = l.forms;
  }
  await writeJson(join(DATA_DIR, 'lexicon', `forms-${level}.json`), forms);
}

// The form index is an intermediate for build-sentences, not shipped content:
// it is large and fully derivable from lexicon.json plus the kaikki dump.
const selected = new Set(lexicon.map((l) => l.id));
const shippedIndex: Record<string, string[]> = {};
for (const [key, ids] of formIndex) {
  const keep = ids.filter((id) => selected.has(id));
  if (keep.length > 0) shippedIndex[key] = keep;
}
await writeJson(join(RAW_DIR, 'form-index.json'), {
  forms: shippedIndex,
  properNames: [...properNames].sort(),
});

// ── Report ─────────────────────────────────────────────────────────────────

const byLevel = new Map<string, number>();
const byPos = new Map<string, number>();
for (const l of lexicon) {
  byLevel.set(l.level!, (byLevel.get(l.level!) ?? 0) + 1);
  byPos.set(l.pos, (byPos.get(l.pos) ?? 0) + 1);
}
console.log(`\n✓ data/lexicon.json — ${lexicon.length.toLocaleString()} lemmas`);
console.log(`  by level: ${[...byLevel].map(([k, v]) => `${k} ${v}`).join(', ')}`);
console.log(
  `  by pos:   ${[...byPos].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}`,
);
console.log(`  top 15:   ${lexicon.slice(0, 15).map((l) => l.lemma).join(', ')}`);
