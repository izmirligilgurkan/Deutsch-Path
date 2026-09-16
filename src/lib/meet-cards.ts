import type { Exercise, Lemma, Sentence } from './content-types.ts';
import { withArticle } from './word-form.ts';
import { shortGloss } from './gloss.ts';
import { formKey, tokenize } from './tokenize.ts';

/**
 * The first encounter with a word: shown, not tested.
 *
 * The ladder used to open at recognition, which is still a question — four
 * options for a word the learner has never seen, where the only strategy is to
 * guess and be told. The worked-example research is specific about this: a
 * novice learns more from studying the answer than from attempting the problem,
 * because a problem they have no schema for spends their attention on searching
 * rather than on learning. So every word is presented once, with its article,
 * its meaning and one sentence that uses it, before anything is asked.
 *
 * Built here rather than in the data pipeline on purpose: these are not
 * questions, and a presentation card that found its way into a unit test would
 * be a free mark. They exist only inside a drill.
 */

/** The shortest sentence that uses this word, which is the clearest one. */
function exampleFor(lemma: Lemma, sentences: readonly Sentence[]): Sentence | undefined {
  let best: Sentence | undefined;
  let bestLength = Infinity;
  for (const s of sentences) {
    if (!s.lemmas.includes(lemma.id)) continue;
    const length = tokenize(s.de).length;
    // `<` keeps the lowest id among equals, so the choice is stable.
    if (length < bestLength) {
      best = s;
      bestLength = length;
    }
  }
  return best;
}

export function meetCards(
  unit: number,
  lemmas: readonly Lemma[],
  sentences: readonly Sentence[],
): Exercise[] {
  const out: Exercise[] = [];
  for (const lemma of lemmas) {
    const gloss = lemma.glosses[0];
    if (!gloss) continue;

    const example = exampleFor(lemma, sentences);
    out.push({
      id: `u:${unit}:meet:${lemma.id}`,
      unit,
      topic: 'vocabulary',
      type: 'meet',
      prompt: withArticle(lemma),
      answer: shortGloss(gloss),
      refs: {
        lemmaIds: [lemma.id],
        ...(example ? { sentenceId: example.id } : {}),
      },
      generator: 'meet-card-from-lexicon',
    });
  }
  return out;
}

/** The word's other forms, when they are worth showing on first sight. */
export function principalPartsOf(lemma: Lemma): string {
  if (lemma.pos === 'verb') {
    const p = lemma.principalParts;
    if (!p) return '';
    const perfect = p.partizip2 ? `${p.auxiliary ?? 'haben'} ${p.partizip2}` : '';
    return [p.thirdSg, p.praeteritum, perfect].filter(Boolean).join(' · ');
  }
  if (lemma.pos === 'noun' && lemma.plural && !lemma.pluralOnly) {
    return `plural: die ${lemma.plural}`;
  }
  return '';
}

/** Highlights the word inside its example, as the sentence spells it. */
export function markOccurrence(sentence: string, lemma: Lemma, forms: string[]): [string, string, string] | null {
  const keys = new Set([lemma.lemma, ...forms].map(formKey));
  for (const token of tokenize(sentence)) {
    if (!keys.has(formKey(token.text))) continue;
    return [sentence.slice(0, token.start), token.text, sentence.slice(token.end)];
  }
  return null;
}
