import { describe, expect, it } from 'vitest';
import { splitGloss } from '~/lib/gloss.ts';

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
