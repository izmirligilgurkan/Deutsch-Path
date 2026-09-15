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
