import type { Exercise, Lemma, Sentence } from './content-types.ts';
import type { Question } from '~/srs/cards.ts';
import { mulberry32, seedFrom, shuffled } from './rng.ts';

/**
 * Turns a pre-generated exercise into the shape the card UI renders.
 *
 * The exercise files already hold the prompt and answer; this only decides how
 * to present them and, for multiple choice, fixes a stable option order so the
 * choices do not reshuffle on every render.
 */

const LABELS: Record<string, string> = {
  meet: 'New word',
  'mc-de-en': 'What does this mean?',
  'type-en-de': 'Write it in German',
  gender: 'der, die or das?',
  plural: 'Write the plural',
  'principal-parts': 'Present, Präteritum, Perfekt',
  cloze: 'Fill the gap',
  'article-case': 'Which article fits?',
  'word-order': 'Put the words in order',
  'choose-form': 'Choose the correct form',
  'error-spotting': 'One word is wrong — write the correct one',
  'conjugation-table': 'Complete the table',
  'declension-table': 'Complete the table',
};

export function exerciseToQuestion(exercise: Exercise): Question | null {
  const answers = Array.isArray(exercise.answer) ? exercise.answer : [exercise.answer];
  const label = LABELS[exercise.type] ?? 'Answer';

  switch (exercise.type) {
    case 'meet':
      // Nothing to answer: the prompt is the word, the "answer" is what it
      // means, and the card shows both.
      return {
        cardType: 'meet',
        label: 'New word',
        prompt: exercise.prompt,
        promptLang: 'de',
        answers,
      };

    case 'conjugation-table':
    case 'declension-table': {
      // The prompt is "headword — cell, cell, cell"; split it into boxes.
      const [head, cells] = splitPrompt(exercise.prompt);
      const labels = cells.split(',').map((c) => c.trim());
      if (labels.length !== answers.length) return null;
      return {
        cardType: exercise.type,
        label,
        prompt: head,
        promptLang: 'de',
        answers: [answers[0] ?? ''],
        fields: labels.map((l, i) => ({ label: l, answers: [answers[i] ?? ''] })),
      };
    }

    case 'word-order': {
      return {
        cardType: exercise.type,
        label,
        prompt: exercise.prompt,
        promptLang: 'de',
        answers: [answers.join(' ')],
        hint: 'Type the sentence in the right order.',
      };
    }

    case 'choose-form': {
      const [head, cell] = splitPrompt(exercise.prompt);
      return {
        cardType: exercise.type,
        label: cell ? `${label} — ${cell}` : label,
        prompt: head,
        promptLang: 'de',
        answers,
        choices: stableChoices(exercise.id, answers[0] ?? '', exercise.distractors ?? []),
      };
    }

    case 'mc-de-en':
    case 'gender':
    case 'article-case': {
      return {
        cardType: exercise.type,
        label,
        prompt: exercise.prompt,
        promptLang: exercise.type === 'mc-de-en' ? 'de' : 'de',
        answers,
        choices: stableChoices(exercise.id, answers[0] ?? '', exercise.distractors ?? []),
      };
    }

    case 'type-en-de':
      return {
        cardType: exercise.type,
        label,
        prompt: exercise.prompt,
        promptLang: 'en',
        answers,
      };

    default:
      return {
        cardType: exercise.type,
        label,
        prompt: exercise.prompt,
        promptLang: 'de',
        answers,
      };
  }
}

function splitPrompt(prompt: string): [string, string] {
  const dash = prompt.indexOf('—');
  return dash === -1 ? [prompt, ''] : [prompt.slice(0, dash).trim(), prompt.slice(dash + 1).trim()];
}

/** Seeded by exercise id so the option order is the same every time. */
function stableChoices(id: string, answer: string, distractors: string[]): string[] {
  const options = [...new Set([answer, ...distractors])];
  return options.length > 1 ? shuffled(options, mulberry32(seedFrom(id))) : options;
}

/** Sentence-based exercises show their source under the answer. */
export function attributionFor(
  exercise: Exercise,
  sentences: Map<number, Sentence>,
  lemmas: Map<string, Lemma>,
): { text: string; url: string; license: string } | null {
  const sentenceId = exercise.refs.sentenceId;
  if (sentenceId !== undefined) {
    const s = sentences.get(sentenceId);
    if (s) {
      return {
        text: `Tatoeba #${s.tatoebaId} by ${s.author}`,
        url: s.sourceUrl,
        license: s.license,
      };
    }
  }
  const lemmaId = exercise.refs.lemmaIds?.[0];
  if (lemmaId) {
    const l = lemmas.get(lemmaId);
    if (l) return { text: l.source, url: l.sourceUrl, license: l.license };
  }
  return null;
}
