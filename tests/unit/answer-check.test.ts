import { describe, expect, it } from 'vitest';
import { checkAnswer, diffChars, expandTransliteration, normalizeWhitespace } from '~/lib/answer-check.ts';

const practice = { caseSensitive: true, allowTransliteration: true, mode: 'practice' as const };
const test_ = { caseSensitive: true, allowTransliteration: true, mode: 'test' as const };

describe('normalizeWhitespace', () => {
  it('collapses spaces and drops trailing punctuation', () => {
    expect(normalizeWhitespace('  die   Brücke . ')).toBe('die Brücke');
  });

  it('keeps punctuation inside the answer', () => {
    expect(normalizeWhitespace("Wie geht's?")).toBe("Wie geht's");
  });
});

describe('checkAnswer', () => {
  it('accepts an exact answer', () => {
    expect(checkAnswer('die Brücke', 'die Brücke', practice).correct).toBe(true);
  });

  it('is case-sensitive by default, because German capitalises nouns', () => {
    const r = checkAnswer('die brücke', 'die Brücke', practice);
    expect(r.correct).toBe(false);
    // The UI needs to say "capitalisation" rather than just "wrong".
    expect(r.caseOnly).toBe(true);
  });

  it('accepts lower case when the learner turns case-sensitivity off', () => {
    expect(
      checkAnswer('die brücke', 'die Brücke', { ...practice, caseSensitive: false }).correct,
    ).toBe(true);
  });

  it('accepts ae/oe/ue/ss in practice and says so', () => {
    const r = checkAnswer('die Bruecke', 'die Brücke', practice);
    expect(r.correct).toBe(true);
    expect(r.verdict).toBe('correct-transliterated');
    expect(checkAnswer('gross', 'groß', practice).verdict).toBe('correct-transliterated');
  });

  it('refuses transliteration in a test, whatever the practice setting', () => {
    expect(checkAnswer('die Bruecke', 'die Brücke', test_).correct).toBe(false);
  });

  it('refuses transliteration when the learner turned it off', () => {
    expect(
      checkAnswer('die Bruecke', 'die Brücke', { ...practice, allowTransliteration: false }).correct,
    ).toBe(false);
  });

  it('accepts any of several correct spellings', () => {
    const r = checkAnswer('Wasser', ['Wässer', 'Wasser'], practice);
    expect(r.correct).toBe(true);
    expect(r.expected).toBe('Wasser');
  });

  it('does not let transliteration collapse genuinely different words', () => {
    // "Masse" (mass) and "Maße" (measurements) are different words; typing the
    // first must not be accepted for the second.
    expect(checkAnswer('Maße', 'Masse', practice).correct).toBe(false);
  });

  it('ignores trailing punctuation and stray spaces', () => {
    expect(checkAnswer('  die Brücke.  ', 'die Brücke', practice).correct).toBe(true);
  });
});

describe('expandTransliteration', () => {
  it('maps the ASCII stand-ins to real umlauts', () => {
    expect(expandTransliteration('Bruecke')).toBe('Brücke');
    expect(expandTransliteration('gross')).toBe('groß');
  });
});

describe('diffChars', () => {
  it('marks the differing letters', () => {
    const ops = diffChars('Bruecke', 'Brücke');
    expect(ops.filter((o) => o.type === 'removed').map((o) => o.text).join('')).toBe('ue');
    expect(ops.filter((o) => o.type === 'added').map((o) => o.text).join('')).toBe('ü');
  });

  it('reports no change for identical strings', () => {
    expect(diffChars('Haus', 'Haus')).toEqual([{ type: 'same', text: 'Haus' }]);
  });

  it('reconstructs both sides', () => {
    const ops = diffChars('gehen', 'gegangen');
    expect(ops.filter((o) => o.type !== 'added').map((o) => o.text).join('')).toBe('gehen');
    expect(ops.filter((o) => o.type !== 'removed').map((o) => o.text).join('')).toBe('gegangen');
  });
});
