import { describe, expect, it } from 'vitest';
import { computeUnlocked, PASS_MARK } from '~/srs/session.ts';
import { UNITS } from '~/lib/syllabus.ts';
import type { UnitProgress } from '~/db/types.ts';

const p = (unit: number, bestScore?: number): UnitProgress => ({
  unit,
  unlocked: true,
  ...(bestScore === undefined ? {} : { bestScore }),
});

describe('computeUnlocked', () => {
  it('opens unit 1 for a brand-new learner and nothing else', () => {
    expect([...computeUnlocked([], true)]).toEqual([1]);
  });

  it('unlocks the next unit at the pass mark', () => {
    const unlocked = computeUnlocked([p(1, PASS_MARK)], true);
    expect(unlocked.has(2)).toBe(true);
  });

  it('keeps the next unit locked below the pass mark', () => {
    // The observed case: a 75% test must not unlock unit 2.
    expect(computeUnlocked([p(1, 0.75)], true).has(2)).toBe(false);
  });

  it('does not skip ahead when a later unit was never passed', () => {
    const unlocked = computeUnlocked([p(1, 1)], true);
    expect(unlocked.has(2)).toBe(true);
    expect(unlocked.has(3)).toBe(false);
  });

  it('unlocks progressively as units are passed', () => {
    const unlocked = computeUnlocked([p(1, 0.9), p(2, 0.85)], true);
    expect([...unlocked].sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });

  it('opens everything when the learner turns the gate off', () => {
    const unlocked = computeUnlocked([], false);
    expect(unlocked.size).toBe(UNITS.length);
    expect(unlocked.has(UNITS.length)).toBe(true);
  });

  it('never offers a unit past the end of the course', () => {
    const last = UNITS.length;
    expect(computeUnlocked([p(last, 1)], true).has(last + 1)).toBe(false);
  });

  it('keeps a unit open once opened, even without a passing score', () => {
    expect(computeUnlocked([p(1), p(2)], true).has(2)).toBe(true);
  });
});
