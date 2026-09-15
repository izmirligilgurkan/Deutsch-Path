import type { ExerciseType, Lemma } from '~/lib/content-types.ts';
import { mulberry32, seedFrom } from '~/lib/rng.ts';

/**
 * Turns a lemma into the cards that can be drilled from it (spec §4.3).
 *
 * Which cards exist depends only on what Wiktionary records: a noun with no
 * plural gets no plural card, a verb missing a principal part gets no
 * principal-parts card. Nothing is asked that the data cannot answer.
 */

export const CARD_TYPE_LABELS: Partial<Record<ExerciseType, string>> = {
  'mc-de-en': 'What does this mean?',
  'type-en-de': 'Write it in German',
  gender: 'der, die or das?',
  plural: 'Write the plural',
  'principal-parts': 'Present, Präteritum, Perfekt',
};

export function cardTypesFor(lemma: Lemma): ExerciseType[] {
  const types: ExerciseType[] = ['mc-de-en', 'type-en-de'];
  if (lemma.pos === 'noun') {
    if (lemma.gender && !lemma.pluralOnly) types.push('gender');
    if (lemma.plural) types.push('plural');
  }
  if (lemma.pos === 'verb') {
    const p = lemma.principalParts;
    if (p?.thirdSg && p.praeteritum && p.partizip2 && p.auxiliary) types.push('principal-parts');
  }
  return types;
}

/** The definite article implied by the gender Wiktionary records. */
export function articleFor(lemma: Lemma): string | null {
  if (lemma.pos !== 'noun') return null;
  if (lemma.pluralOnly) return 'die';
  return lemma.gender === 'm' ? 'der' : lemma.gender === 'f' ? 'die' : lemma.gender === 'n' ? 'das' : null;
}

/** `die Brücke` — producing a noun means producing its article too. */
export function withArticle(lemma: Lemma): string {
  const article = articleFor(lemma);
  return article ? `${article} ${lemma.lemma}` : lemma.lemma;
}

export interface Question {
  cardType: ExerciseType;
  /** Instruction shown above the prompt. */
  label: string;
  /** The content being asked about. */
  prompt: string;
  promptLang: 'de' | 'en';
  /** Accepted answers; any one counts as correct. */
  answers: string[];
  /** Present for multiple choice; includes the correct answer. */
  choices?: string[];
  /** Several boxes, for the principal-parts card. */
  fields?: { label: string; answers: string[] }[];
  hint?: string;
}

/**
 * Builds the question for one card. `pool` supplies multiple-choice
 * distractors — other words of the same part of speech, so the choice tests
 * the word and not the grammar.
 */
export function buildQuestion(
  lemma: Lemma,
  cardType: ExerciseType,
  pool: Lemma[],
): Question | null {
  switch (cardType) {
    case 'mc-de-en': {
      const gloss = lemma.glosses[0];
      if (!gloss) return null;
      const rng = mulberry32(seedFrom(`mc:${lemma.id}`));
      const others = pool
        .filter((o) => o.pos === lemma.pos && o.id !== lemma.id && o.glosses[0])
        .map((o) => o.glosses[0]!);
      const distractors = uniqueSample(others, 3, rng, gloss);
      if (distractors.length < 3) return null;
      return {
        cardType,
        label: CARD_TYPE_LABELS[cardType]!,
        prompt: withArticle(lemma),
        promptLang: 'de',
        answers: [gloss],
        choices: shuffle([gloss, ...distractors], mulberry32(seedFrom(`ch:${lemma.id}`))),
      };
    }

    case 'type-en-de': {
      const gloss = lemma.glosses[0];
      if (!gloss) return null;
      return {
        cardType,
        label: CARD_TYPE_LABELS[cardType]!,
        prompt: gloss,
        promptLang: 'en',
        answers: [withArticle(lemma)],
        ...(lemma.pos === 'noun' ? { hint: 'Include the article.' } : {}),
      };
    }

    case 'gender': {
      const article = articleFor(lemma);
      if (!article) return null;
      return {
        cardType,
        label: CARD_TYPE_LABELS[cardType]!,
        prompt: lemma.lemma,
        promptLang: 'de',
        answers: [article],
        choices: ['der', 'die', 'das'],
      };
    }

    case 'plural': {
      if (!lemma.plural) return null;
      return {
        cardType,
        label: CARD_TYPE_LABELS[cardType]!,
        prompt: withArticle(lemma),
        promptLang: 'de',
        answers: [lemma.plural, `die ${lemma.plural}`],
        hint: 'Plural form',
      };
    }

    case 'principal-parts': {
      const p = lemma.principalParts;
      if (!p?.thirdSg || !p.praeteritum || !p.partizip2 || !p.auxiliary) return null;
      // "hat gemacht" / "ist gegangen": the auxiliary belongs to the answer.
      const perfect =
        p.auxiliary === 'haben/sein'
          ? [`hat ${p.partizip2}`, `ist ${p.partizip2}`]
          : [`${p.auxiliary === 'sein' ? 'ist' : 'hat'} ${p.partizip2}`];
      return {
        cardType,
        label: CARD_TYPE_LABELS[cardType]!,
        prompt: lemma.lemma,
        promptLang: 'de',
        answers: [p.thirdSg],
        fields: [
          { label: 'er/sie/es …', answers: [p.thirdSg] },
          { label: 'Präteritum', answers: [p.praeteritum] },
          { label: 'Perfekt', answers: perfect },
        ],
      };
    }

    default:
      return null;
  }
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Distinct samples that never duplicate the correct answer. */
function uniqueSample(items: string[], n: number, rng: () => number, exclude: string): string[] {
  const seen = new Set<string>([exclude]);
  const out: string[] = [];
  for (const item of shuffle(items, rng)) {
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
    if (out.length === n) break;
  }
  return out;
}
