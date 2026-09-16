import type { Form, Lemma } from './content-types.ts';
import { formKey, tokenize } from './tokenize.ts';

/**
 * Word-by-word reading of a sentence: what each word means, and what form it
 * is in.
 *
 * Answering a cloze correctly is not the same as understanding the sentence,
 * and a drill that moves on without explaining it teaches pattern-matching
 * rather than German. Every part of this is derived, not written: the meaning
 * is the word's Wiktionary gloss, and the grammatical role is a plain-English
 * reading of the wiktextract tags on the matching row of its form table. When
 * a word cannot be resolved against the data, it is left blank rather than
 * guessed at.
 */

export interface BrokenWord {
  /** The word as it appears in the sentence. */
  surface: string;
  /** The dictionary form it belongs to, when one matches. */
  lemma?: Lemma;
  /** What form it is in: "1st person singular present", "dative plural". */
  role?: string;
  /** True when the word is its own dictionary form. */
  isLemma?: boolean;
}

/**
 * Wiktionary's tags, in the order they read naturally in English. Tags not
 * listed here are dropped: `indicative` is the unmarked default, and
 * `class-5`, `auxiliary` and the rest describe the word's paradigm rather than
 * this occurrence of it.
 */
const TAG_LABELS: [tag: string, label: string][] = [
  // On an adjective, strong/weak/mixed is the whole reason the ending is what
  // it is; on a verb the same words name the conjugation class, so they are
  // only shown for adjectives.
  ['strong', 'strong'],
  ['weak', 'weak'],
  ['mixed', 'mixed'],
  ['first-person', '1st person'],
  ['second-person', '2nd person'],
  ['third-person', '3rd person'],
  // Case before number, the way a declension table is read aloud:
  // "nominative plural", "dative singular".
  ['nominative', 'nominative'],
  ['accusative', 'accusative'],
  ['dative', 'dative'],
  ['genitive', 'genitive'],
  ['singular', 'singular'],
  ['plural', 'plural'],
  ['masculine', 'masculine'],
  ['feminine', 'feminine'],
  ['neuter', 'neuter'],
  ['present', 'present'],
  ['preterite', 'Präteritum'],
  ['past', 'past'],
  ['future', 'future'],
  ['perfect', 'perfect'],
  ['pluperfect', 'pluperfect'],
  ['subjunctive-ii', 'Konjunktiv II'],
  ['subjunctive', 'subjunctive'],
  ['imperative', 'imperative'],
  ['infinitive-zu', 'zu-infinitive'],
  ['infinitive', 'infinitive'],
  ['participle', 'participle'],
  ['comparative', 'comparative'],
  ['superlative', 'superlative'],
  ['predicative', 'predicative'],
  ['subordinate-clause', 'in a subordinate clause'],
];

const DECLENSION_CLASS = new Set(['strong', 'weak', 'mixed']);

/**
 * Tags of the same kind are alternatives, not a list: *die* carries both
 * `nominative` and `accusative` because the form is either, so it reads
 * "nominative/accusative" rather than "nominative accusative".
 */
const GROUPS: string[][] = [
  ['first-person', 'second-person', 'third-person'],
  ['nominative', 'accusative', 'dative', 'genitive'],
  ['singular', 'plural'],
  ['masculine', 'feminine', 'neuter'],
];

function groupOf(tag: string): number {
  return GROUPS.findIndex((g) => g.includes(tag));
}

export function describeForm(tags: readonly string[], pos?: string): string {
  const held = new Set(tags);
  const shown = TAG_LABELS.filter(
    ([tag]) => held.has(tag) && (pos === 'adj' || !DECLENSION_CLASS.has(tag)),
  );

  const parts: string[] = [];
  for (let i = 0; i < shown.length; i += 1) {
    const group = groupOf(shown[i]![0]);
    if (group === -1) {
      parts.push(shown[i]![1]);
      continue;
    }
    const run = [shown[i]![1]];
    while (i + 1 < shown.length && groupOf(shown[i + 1]![0]) === group) {
      i += 1;
      run.push(shown[i]![1]);
    }
    parts.push(run.join('/'));
  }
  return parts.join(' ');
}

interface Match {
  lemma: Lemma;
  /** Every form row of that lemma whose surface is this word. */
  forms: Form[];
  /** Higher is a better match. */
  rank: number;
}

/**
 * Resolves one word against the lemmas the sentence is already known to
 * contain, then against the rest of the course. The sentence's own lemma list
 * is what keeps a homograph from becoming a guess; the wider pass is only
 * there for the function words — articles, pronouns — whose lemma the sentence
 * record does not name.
 */
function resolve(surface: string, lemmas: readonly Lemma[], formsByLemma: Record<string, Form[]>): Match | undefined {
  const key = formKey(surface);
  let best: Match | undefined;

  const consider = (m: Match) => {
    if (!best || m.rank > best.rank) best = m;
  };

  for (const lemma of lemmas) {
    // The word is the dictionary form itself — the strongest match there is,
    // and stronger when the capitalisation agrees, since German capitalises
    // nouns and not verbs.
    if (formKey(lemma.lemma) === key) {
      consider({ lemma, forms: [], rank: lemma.lemma === surface ? 1000 : 900 });
    }

    const matching = (formsByLemma[lemma.id] ?? []).filter((f) => formKey(f.form) === key);
    if (matching.length > 0) {
      const exact = matching.some((f) => f.form === surface);
      consider({ lemma, forms: matching, rank: exact ? 500 : 400 });
    }
  }

  return best;
}

/** A reading that pins down person, case or number, rather than only tense. */
const SPECIFIC = /person|nominative|accusative|dative|genitive|singular|plural/;

/**
 * What form the word is in. A form can have several readings — *bringt* is
 * both *ihr bringt* and *er bringt* — and nothing in the data says which one
 * this is, so every reading is shown rather than one of them picked.
 */
function rolesOf(forms: readonly Form[], pos?: string): string {
  const all = [...new Set(forms.map((f) => describeForm(f.tags, pos)).filter(Boolean))];

  // A word's head-line forms carry a bare tag or two — *nahm* is listed as
  // "past" as well as in the conjugation table — and a reading that names no
  // person, case or number only dilutes the ones that do.
  const specific = all.filter((r) => SPECIFIC.test(r));
  // Three at most: past that, a form is ambiguous enough that listing every
  // reading says less than the count does. Dropping one silently would be
  // worse — *bringt* is 3rd person singular far more often than it is a
  // 2nd person plural imperative, and nothing in the data knows that.
  const readings = (specific.length > 0 ? specific : all).sort().slice(0, 3);
  if (readings.length < 2) return readings[0] ?? '';
  if (readings.length > 2) return readings.join(' or ');

  // Two readings of the same form usually differ only at the front — *wusste*
  // is 1st or 3rd person singular Präteritum — so the shared tail is said once.
  const [a = [], b = []] = readings.map((r) => r.split(' '));
  let shared = 0;
  while (shared < a.length - 1 && shared < b.length - 1 && a.at(-1 - shared) === b.at(-1 - shared)) {
    shared += 1;
  }
  if (shared === 0) return readings.join(' or ');
  const tail = a.slice(a.length - shared).join(' ');
  const heads = [a.slice(0, a.length - shared), b.slice(0, b.length - shared)].map((w) => w.join(' '));
  return `${heads.join(' or ')} ${tail}`;
}

export function breakDownSentence(
  text: string,
  lemmas: readonly Lemma[],
  formsByLemma: Record<string, Form[]> = {},
  /** The rest of the course, for function words the sentence record omits. */
  fallback: readonly Lemma[] = [],
): BrokenWord[] {
  return tokenize(text).map(({ text: surface }) => {
    const match =
      resolve(surface, lemmas, formsByLemma) ?? resolve(surface, fallback, formsByLemma);
    if (!match) return { surface };

    const role = rolesOf(match.forms, match.lemma.pos);
    const word: BrokenWord = { surface, lemma: match.lemma };
    if (role) word.role = role;
    if (match.forms.length === 0) word.isLemma = true;
    return word;
  });
}
