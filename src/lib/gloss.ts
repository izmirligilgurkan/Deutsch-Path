/**
 * Presentation for Wiktionary glosses.
 *
 * A gloss carries its definition plus the qualifiers an editor attached:
 * "[with dative] in, inside, within, at (inside a building)". All of it is
 * useful, but set in one size on a phone the qualifiers compete with the
 * definition and the card becomes a paragraph to read rather than a question
 * to answer.
 *
 * This only splits the string for layout — nothing is dropped, reworded or
 * reordered, and the text that reaches the screen is still Wiktionary's.
 */

export interface SplitGloss {
  /** The definition itself. */
  head: string;
  /** Usage notes and disambiguators, shown smaller. */
  qualifier: string;
}

/** Leading usage note: "[with dative] …", "(transitive) …". */
const LEADING_NOTE = /^\s*[[(]([^\])]{1,40})[\])]\s*/;
/** Trailing disambiguator: "… (inside a building)". */
const TRAILING_NOTE = /\s*\(([^()]*)\)\s*$/;

export function splitGloss(gloss: string): SplitGloss {
  let head = gloss.trim();
  const notes: string[] = [];

  const leading = LEADING_NOTE.exec(head);
  // Only peel the note off when a definition follows it; a gloss that is
  // nothing but a parenthetical would otherwise leave the card blank.
  if (leading && head.slice(leading[0].length).trim().length > 0) {
    notes.push(leading[1]!.trim());
    head = head.slice(leading[0].length);
  }

  const trailing = TRAILING_NOTE.exec(head);
  // Only peel a trailing note off when a definition remains in front of it;
  // a gloss that is *only* a parenthetical stays whole.
  if (trailing && head.slice(0, trailing.index).trim().length > 0) {
    notes.push(trailing[1]!.trim());
    head = head.slice(0, trailing.index);
  }

  return { head: head.trim(), qualifier: notes.filter(Boolean).join(' · ') };
}

/**
 * Wiktionary orders senses by history and breadth, not by what a learner needs
 * first. `sein` leads with "forms the present perfect and past perfect tenses
 * of certain verbs" — true, and useless as the first thing you are asked to
 * produce — and its second entry is the section header "As a copulative verb:".
 * The teachable sense, "to be", is third.
 *
 * This picks which of a word's senses to lead with. Nothing is rewritten and
 * nothing is dropped: the other senses stay, in their original order, behind
 * the one chosen.
 */

/** A section header inside a sense list, not a definition. */
const HEADER = /:\s*$/;

/**
 * A sense that describes what the word *does* grammatically rather than what
 * it means. Real definitions of the same word sit further down the list.
 */
const FUNCTION_SENSE = /^\s*(forms?|used|indicat\w*|introduc\w*|express\w*|denot\w*|mark\w*|refer\w*)\b/i;

export function selectTeachingGloss(glosses: readonly string[]): string | undefined {
  const real = glosses.filter((g) => g.trim() && !HEADER.test(g));
  return real.find((g) => !FUNCTION_SENSE.test(g)) ?? real[0] ?? glosses[0];
}

/** Senses with the teachable one first; the rest keep their order. */
export function orderGlosses(glosses: readonly string[]): string[] {
  const lead = selectTeachingGloss(glosses);
  if (lead === undefined) return [...glosses];
  return [lead, ...glosses.filter((g) => g !== lead)];
}

/**
 * The short form of a sense, for a card front or a multiple-choice option.
 *
 * Wiktionary packs a full explanation into one sense — "school (an institution
 * dedicated to teaching and learning (especially before university))" — which
 * is a paragraph to read rather than an answer to give. This keeps the head of
 * the definition and drops the rest. It only cuts; it never rewrites, and the
 * full sense is still shown on the word's dictionary entry.
 */
const MAX_SHORT = 64;

export function shortGloss(gloss: string): string {
  // Parentheticals nest, so they are stripped by depth rather than by regex.
  let out = '';
  let depth = 0;
  for (const ch of gloss) {
    if (ch === '(' || ch === '[') depth += 1;
    else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    else if (depth === 0) out += ch;
  }

  // Wiktionary separates distinct senses with ";" and synonyms with ",".
  const [firstSense = ''] = out.split(';');
  out = firstSense
    .replace(/\s+/g, ' ')
    // Removing a parenthetical can leave a gap in front of its punctuation:
    // "to be able (to) , to have…" → "to be able, to have…".
    .replace(/\s+([,;:.])/g, '$1')
    .trim()
    .replace(/[.,:;]+$/, '');

  if (out.length > MAX_SHORT) {
    const cut = out.lastIndexOf(',', MAX_SHORT);
    if (cut > 0) out = out.slice(0, cut);
  }

  // A sense that is nothing but a parenthetical is kept whole rather than
  // reduced to nothing.
  return out.length > 0 ? out : gloss.trim();
}
