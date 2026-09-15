/**
 * Rule-based German tokenization.
 *
 * Deliberately simple and deterministic: the pipeline must never use a
 * statistical tokenizer or ML lemmatizer, because anything it produced would
 * be data with no human source behind it. A token that cannot be resolved
 * against a Wiktionary form table is a reason to drop the sentence, not to
 * guess.
 */

/** Letters that can occur inside a German word. */
const WORD_CHARS = "A-Za-zÄÖÜäöüß";

/**
 * A word is a run of letters, optionally joined by an internal hyphen or
 * apostrophe (`Sauerstoff-Flasche`, `geht's`, `Häus'l`).
 */
const WORD_RE = new RegExp(`[${WORD_CHARS}]+(?:[-'’][${WORD_CHARS}]+)*`, 'g');

export interface Token {
  /** The word exactly as it appears in the source text. */
  text: string;
  /** Character offset into the source string. */
  start: number;
  end: number;
}

/** Word tokens with their offsets. Punctuation and digits are skipped. */
export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (const m of text.matchAll(WORD_RE)) {
    tokens.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  }
  return tokens;
}

/** Just the word strings. */
export function words(text: string): string[] {
  return tokenize(text).map((t) => t.text);
}

/**
 * Lookup key for the form index.
 *
 * Case is folded because a form index cannot know whether a word is
 * capitalized for being a noun or for starting a sentence. `ß` is *not* folded
 * to `ss`: they are different forms in German orthography and Wiktionary lists
 * them separately.
 */
export function formKey(word: string): string {
  return word.toLocaleLowerCase('de-DE').replace(/[’]/g, "'");
}
