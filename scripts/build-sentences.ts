/**
 * Tatoeba CSV -> data/sentences.json.
 *
 * Phase 2 of the build plan. Not implemented yet — this stub exists so the
 * pipeline's shape is fixed and scripts/validate-data.ts has something to
 * validate against.
 *
 * Keeps the per-sentence id, author and licence for attribution. Prefers
 * sentences whose owner self-declares German as a native language, and keeps
 * only sentences whose tokens all resolve against the lexicon for that level.
 * Lemmatisation is a rule-based lookup in the Wiktionary form tables; a
 * sentence that cannot be fully lemmatised is dropped rather than guessed at.
 * */
console.error(
  'build-sentences.ts is not implemented yet (phase 2: data pipeline).\n' +
    'See README.md "Data pipeline" for what it will do.',
);
process.exit(1);
