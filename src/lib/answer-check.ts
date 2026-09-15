/**
 * Answer checking (spec §4.6).
 *
 * German rules that matter here:
 *  - Nouns are capitalised, so case matters by default. The learner can turn
 *    that off, but it is on out of the box.
 *  - `ae/oe/ue/ss` stand in for `ä/ö/ü/ß` when a keyboard has no umlauts.
 *    That is accepted in practice and reported, but never in a test.
 */

export type CheckMode = 'practice' | 'test';

export interface CheckOptions {
  caseSensitive: boolean;
  /** Only consulted in practice mode; tests are always strict. */
  allowTransliteration: boolean;
  mode: CheckMode;
}

export type CheckVerdict = 'correct' | 'correct-transliterated' | 'wrong';

export interface CheckResult {
  verdict: CheckVerdict;
  correct: boolean;
  /** The accepted answer this matched, or the first expected answer. */
  expected: string;
  /** Set when only the capitalisation was wrong, so the UI can say so. */
  caseOnly: boolean;
}

/** Collapses whitespace and drops trailing sentence punctuation. */
export function normalizeWhitespace(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?;:,]+$/u, '')
    .trim();
}

/**
 * Maps the ASCII stand-ins to real umlauts, not the other way round: writing
 * `ss` for `ß` is a valid substitution, while rewriting `ß` to `ss` would also
 * accept genuinely different words.
 */
export function expandTransliteration(text: string): string {
  return text
    .replace(/ae/g, 'ä')
    .replace(/oe/g, 'ö')
    .replace(/ue/g, 'ü')
    .replace(/Ae/g, 'Ä')
    .replace(/Oe/g, 'Ö')
    .replace(/Ue/g, 'Ü')
    .replace(/ss/g, 'ß');
}

function fold(text: string, caseSensitive: boolean): string {
  const base = normalizeWhitespace(text);
  return caseSensitive ? base : base.toLocaleLowerCase('de-DE');
}

/**
 * Checks one typed answer against the accepted answers.
 *
 * `expected` may hold several accepted spellings; any match counts.
 */
export function checkAnswer(
  given: string,
  expected: string | string[],
  options: CheckOptions,
): CheckResult {
  const accepted = (Array.isArray(expected) ? expected : [expected]).filter((e) => e.length > 0);
  const first = accepted[0] ?? '';
  // Tests are strict whatever the practice setting says.
  const allowTranslit = options.mode === 'practice' && options.allowTransliteration;

  const givenNorm = fold(given, options.caseSensitive);

  for (const candidate of accepted) {
    if (givenNorm === fold(candidate, options.caseSensitive)) {
      return { verdict: 'correct', correct: true, expected: candidate, caseOnly: false };
    }
  }

  // A case-only mismatch is reported separately: in German that is usually the
  // learner forgetting that a noun is capitalised, which is worth saying.
  for (const candidate of accepted) {
    if (fold(given, false) === fold(candidate, false)) {
      return { verdict: 'wrong', correct: false, expected: candidate, caseOnly: true };
    }
  }

  if (allowTranslit) {
    const expanded = fold(expandTransliteration(given), options.caseSensitive);
    for (const candidate of accepted) {
      if (expanded === fold(candidate, options.caseSensitive)) {
        return {
          verdict: 'correct-transliterated',
          correct: true,
          expected: candidate,
          caseOnly: false,
        };
      }
    }
  }

  return { verdict: 'wrong', correct: false, expected: first, caseOnly: false };
}

/** Checks an ordered list, used by the conjugation and declension tables. */
export function checkAll(
  given: string[],
  expected: string[],
  options: CheckOptions,
): { results: CheckResult[]; correct: boolean } {
  const results = expected.map((e, i) => checkAnswer(given[i] ?? '', e, options));
  return { results, correct: results.every((r) => r.correct) };
}

export type DiffOp = { type: 'same' | 'added' | 'removed'; text: string };

/**
 * Character diff between what was typed and what was expected, so a wrong
 * answer shows exactly which letters differ rather than just "wrong".
 * Longest-common-subsequence, which is fine at answer length.
 */
export function diffChars(given: string, expected: string): DiffOp[] {
  const a = [...given];
  const b = [...expected];
  const n = a.length;
  const m = b.length;

  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }

  const ops: DiffOp[] = [];
  const push = (type: DiffOp['type'], text: string) => {
    const last = ops[ops.length - 1];
    if (last && last.type === type) last.text += text;
    else ops.push({ type, text });
  };

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push('same', a[i]!);
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      push('removed', a[i]!);
      i++;
    } else {
      push('added', b[j]!);
      j++;
    }
  }
  while (i < n) push('removed', a[i++]!);
  while (j < m) push('added', b[j++]!);

  return ops;
}
