/**
 * templates × lexicon × sentences → data/exercises/<unit>.json
 *
 * Nothing here writes German. Each generator selects from a Wiktionary form
 * table or a Tatoeba sentence and records which rule produced the item, so
 * every exercise traces back to a source record. Generation is seeded, so a
 * rebuild produces identical files and shows up as an empty diff.
 *
 *   npm run data:exercises
 */
import { join } from 'node:path';
import type { Exercise, Lemma, Level, Sentence } from '../src/lib/content-types.ts';
import { UNITS } from '../src/lib/syllabus.ts';
import { DATA_DIR, loadAllSentences, loadFullLexicon, writeJson } from './lib/io.ts';
import {
  genArticleCase,
  genChooseForm,
  genCloze,
  genConjugationTable,
  genDeclensionTable,
  genErrorSpotting,
  genGender,
  genPlural,
  genPrincipalParts,
  genVocabMc,
  genVocabTyped,
  genWordOrder,
  type GenContext,
} from './lib/generators.ts';

/** Spec §4.2: a unit introduces 8–25 lemmas. The rest arrive through the SRS. */
const LEMMAS_PER_UNIT = 25;

const LEVEL_ORDER: Record<Level, number> = { A1: 0, A2: 1, B1: 2 };

let lexicon: Lemma[];
let sentences: Sentence[];
try {
  lexicon = await loadFullLexicon();
  sentences = await loadAllSentences();
} catch {
  console.error('missing built data\nRun: npm run data:lexicon && npm run data:sentences');
  process.exit(1);
}

console.log(`lexicon ${lexicon.length}, sentences ${sentences.length}`);

/**
 * Each unit introduces a slice of its level's vocabulary, in frequency order,
 * biased towards the part of speech its grammar topic drills: the nouns unit
 * gets nouns, the verb units get verbs.
 */
const POS_BIAS: Record<number, string> = {
  3: 'noun', 4: 'noun', 6: 'verb', 7: 'verb', 9: 'verb', 11: 'noun',
  12: 'verb', 13: 'verb', 16: 'adj', 17: 'adj', 19: 'verb', 21: 'verb',
  24: 'verb', 25: 'verb', 26: 'verb', 28: 'noun', 32: 'noun', 33: 'verb',
};

const byLevel = new Map<Level, Lemma[]>();
for (const level of ['A1', 'A2', 'B1'] as Level[]) {
  byLevel.set(
    level,
    lexicon.filter((l) => l.level === level).sort((a, b) => (a.freqRank ?? 0) - (b.freqRank ?? 0)),
  );
}

const assigned = new Set<string>();
let totalExercises = 0;
const perUnitCounts: string[] = [];

for (const plan of UNITS) {
  const levelLemmas = byLevel.get(plan.level) ?? [];
  const bias = POS_BIAS[plan.unit];

  // Take the most frequent unassigned lemmas, preferring the unit's word class.
  const available = levelLemmas.filter((l) => !assigned.has(l.id));
  const preferred = bias ? available.filter((l) => l.pos === bias) : [];
  const unitLemmas = [...preferred, ...available.filter((l) => !preferred.includes(l))].slice(
    0,
    LEMMAS_PER_UNIT,
  );
  for (const l of unitLemmas) assigned.add(l.id);

  // Distractors and examples may use anything up to this unit's level.
  const pool = lexicon.filter((l) => LEVEL_ORDER[l.level ?? 'B1'] <= LEVEL_ORDER[plan.level]);
  const levelSentences = sentences.filter(
    (s) => LEVEL_ORDER[s.level] <= LEVEL_ORDER[plan.level],
  );

  const ctx: GenContext = {
    unit: plan.unit,
    topic: plan.topics[0] ?? 'general',
    lemmas: unitLemmas,
    pool,
    sentences: levelSentences,
  };

  const exercises: Exercise[] = [
    ...genGender(ctx),
    ...genPlural(ctx),
    ...genPrincipalParts(ctx),
    ...genVocabMc(ctx),
    ...genVocabTyped(ctx),
    ...genCloze(ctx),
    ...genWordOrder(ctx),
    ...genArticleCase(ctx),
    ...genErrorSpotting(ctx),
    ...genConjugationTable(ctx),
    ...genDeclensionTable(ctx),
    ...genChooseForm(ctx),
  ];

  await writeJson(join(DATA_DIR, 'exercises', `${plan.unit}.json`), exercises);
  totalExercises += exercises.length;
  perUnitCounts.push(`${plan.unit}:${exercises.length}`);
}

console.log(`\n✓ data/exercises/ — ${totalExercises.toLocaleString()} items across ${UNITS.length} units`);
console.log(`  per unit: ${perUnitCounts.join(' ')}`);
console.log(`  unit vocabulary assigned: ${assigned.size.toLocaleString()} lemmas`);
