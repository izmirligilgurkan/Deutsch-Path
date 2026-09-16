import { describe, expect, it } from 'vitest';
import { orderGlosses, selectTeachingGloss, shortGloss, splitGloss } from '~/lib/gloss.ts';

describe('splitGloss', () => {
  it('peels a leading usage note off the definition', () => {
    expect(splitGloss('[with dative] in, inside, within')).toEqual({
      head: 'in, inside, within',
      qualifier: 'with dative',
    });
  });

  it('peels a trailing disambiguator', () => {
    expect(splitGloss('water (H₂O)')).toEqual({ head: 'water', qualifier: 'H₂O' });
  });

  it('handles both at once', () => {
    expect(splitGloss('[with dative] in, inside, at (inside a building)')).toEqual({
      head: 'in, inside, at',
      qualifier: 'with dative · inside a building',
    });
  });

  it('leaves a plain gloss alone', () => {
    expect(splitGloss('bridge')).toEqual({ head: 'bridge', qualifier: '' });
  });

  it('keeps multiple senses together', () => {
    expect(splitGloss('to have; to own').head).toBe('to have; to own');
  });

  it('never leaves the definition empty', () => {
    // A gloss that is only a parenthetical must stay whole, or the card would
    // show nothing to translate.
    expect(splitGloss('(a greeting)').head).toBe('(a greeting)');
  });

  it('keeps nested parentheses out of the qualifier split', () => {
    const { head } = splitGloss('bridge day (a day of leave taken between a holiday and a weekend)');
    expect(head).toBe('bridge day');
  });

  it('does not treat a mid-sentence parenthesis as a trailing note', () => {
    const g = 'to go (somewhere) on foot';
    expect(splitGloss(g).head).toBe(g);
  });

  it('trims surrounding whitespace', () => {
    expect(splitGloss('  bridge  ').head).toBe('bridge');
  });
});

describe('selectTeachingGloss', () => {
  it('skips the grammatical-function sense Wiktionary leads sein with', () => {
    // Regression: unit 1 asked the learner to write the German for "forms the
    // present perfect and past perfect tenses of certain verbs".
    expect(
      selectTeachingGloss([
        'forms the present perfect and past perfect tenses of certain verbs',
        'As a copulative verb:',
        'to be',
      ]),
    ).toBe('to be');
  });

  it('skips a section header, which is not a definition', () => {
    expect(selectTeachingGloss(['As a copulative verb:', 'to be'])).toBe('to be');
  });

  it('keeps a function sense when the word has no other', () => {
    const only = ['Reciprocal pronoun of the third person plural: each other'];
    expect(selectTeachingGloss(only)).toBe(only[0]);
  });

  it('orders the senses without dropping any', () => {
    const glosses = ['forms the perfect aspect (have)', 'to have'];
    expect(orderGlosses(glosses)).toEqual(['to have', 'forms the perfect aspect (have)']);
  });
});

describe('shortGloss', () => {
  it('keeps the head of a sense that carries a whole explanation', () => {
    expect(
      shortGloss('school (an institution dedicated to teaching and learning (especially before university))'),
    ).toBe('school');
  });

  it('cuts at the first sense separator, not at a synonym', () => {
    expect(shortGloss('to please; to appeal to [with dative]')).toBe('to please');
  });

  it('closes the gap a removed parenthetical leaves before punctuation', () => {
    expect(shortGloss('to be able (to), to have the possibility of')).toBe(
      'to be able, to have the possibility of',
    );
  });

  it('keeps a sense that is nothing but a parenthetical', () => {
    expect(shortGloss('(archaic)')).toBe('(archaic)');
  });
});
