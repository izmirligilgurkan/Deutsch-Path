import type { Lemma } from './content-types.ts';

/**
 * A noun is only half a word without its article — the gender is not
 * predictable and has to be learnt with it — so it is shown and drilled as
 * "das Buch", never as "Buch".
 */
export function withArticle(lemma: Lemma): string {
  if (lemma.pos !== 'noun') return lemma.lemma;
  if (lemma.pluralOnly) return `die ${lemma.lemma}`;
  const article = lemma.gender === 'm' ? 'der' : lemma.gender === 'f' ? 'die' : 'das';
  return `${article} ${lemma.lemma}`;
}
