import { describe, expect, it } from 'vitest';
import { formKey, tokenize, words } from '~/lib/tokenize.ts';

describe('tokenize', () => {
  it('splits a plain sentence', () => {
    expect(words('Ich gehe nach Hause.')).toEqual(['Ich', 'gehe', 'nach', 'Hause']);
  });

  it('keeps umlauts and eszett inside words', () => {
    expect(words('Die Brücke ist groß.')).toEqual(['Die', 'Brücke', 'ist', 'groß']);
  });

  it('keeps internal hyphens and apostrophes together', () => {
    expect(words("Wie geht's dir, Sauerstoff-Flasche?")).toEqual([
      'Wie', "geht's", 'dir', 'Sauerstoff-Flasche',
    ]);
  });

  it('skips digits and punctuation', () => {
    expect(words('Um 8 Uhr, bitte!')).toEqual(['Um', 'Uhr', 'bitte']);
  });

  it('reports offsets that index back into the source', () => {
    const text = 'Ich gebe dem Mann das Buch.';
    const token = tokenize(text).find((t) => t.text === 'Mann');
    expect(token).toBeDefined();
    expect(text.slice(token!.start, token!.end)).toBe('Mann');
  });
});

describe('formKey', () => {
  it('folds case so sentence-initial words match', () => {
    expect(formKey('Gehen')).toBe(formKey('gehen'));
  });

  it('does not fold eszett to ss — they are distinct forms', () => {
    expect(formKey('groß')).not.toBe(formKey('gross'));
  });

  it('normalises the typographic apostrophe', () => {
    expect(formKey('geht’s')).toBe("geht's");
  });
});
