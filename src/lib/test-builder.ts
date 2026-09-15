import type { Exercise, Level } from './content-types.ts';
import type { Mistake } from '~/db/types.ts';
import { UNITS } from './syllabus.ts';
import { mulberry32, seedFrom, shuffled } from './rng.ts';

/**
 * Assembles the item sets for the four kinds of test (spec §4.5).
 *
 * All pure: given the same pools and seed they return the same items, so a
 * test survives a reload mid-session instead of reshuffling under the learner.
 */

export const TEST_LENGTHS = {
  /** 20 mixed items covering the unit's grammar and vocabulary. */
  unit: 20,
  /** 60 items covering a whole level, styled like an exam. */
  level: 60,
  /** 10 items weighted toward recent mistakes. */
  daily: 10,
  /** About 30 adaptive items. */
  placement: 30,
} as const;

export function unitsForLevel(level: Level): number[] {
  return UNITS.filter((u) => u.level === level).map((u) => u.unit);
}

/** A fixed-length sample, seeded so it is stable across reloads. */
export function sample(pool: Exercise[], count: number, seed: string): Exercise[] {
  return shuffled(pool, mulberry32(seedFrom(seed))).slice(0, count);
}

/**
 * The daily quick test: 10 items leaning on what the learner recently got
 * wrong, topped up from the rest so a good run is not all repeats.
 *
 * Weighting is by topic rather than by exact item — re-asking the identical
 * question mostly tests recall of that card, not of the topic behind it.
 */
export function buildDailyTest(
  pool: Exercise[],
  mistakes: Mistake[],
  seed: string,
  count: number = TEST_LENGTHS.daily,
): Exercise[] {
  if (pool.length === 0) return [];

  // Most-recent mistakes first, so today's weak spots outrank last month's.
  const weight = new Map<string, number>();
  const recent = [...mistakes].sort((a, b) => b.ts - a.ts).slice(0, 50);
  recent.forEach((m, i) => {
    weight.set(m.topic, (weight.get(m.topic) ?? 0) + (recent.length - i));
  });

  const rng = mulberry32(seedFrom(seed));
  const shuffledPool = shuffled(pool, rng);

  const weak = shuffledPool.filter((e) => weight.has(e.topic));
  weak.sort((a, b) => (weight.get(b.topic) ?? 0) - (weight.get(a.topic) ?? 0));

  // Aim for two thirds from weak topics, but never pad with duplicates.
  const target = Math.min(weak.length, Math.ceil(count * 0.6));
  const chosen: Exercise[] = weak.slice(0, target);
  const taken = new Set(chosen.map((e) => e.id));

  for (const item of shuffledPool) {
    if (chosen.length >= count) break;
    if (taken.has(item.id)) continue;
    taken.add(item.id);
    chosen.push(item);
  }

  return shuffled(chosen, mulberry32(seedFrom(`${seed}:order`)));
}

/**
 * A level test spreads its items across the level's units rather than taking a
 * flat sample, which would over-weight whichever unit has the most exercises.
 */
export function buildLevelTest(
  byUnit: Map<number, Exercise[]>,
  level: Level,
  seed: string,
  count: number = TEST_LENGTHS.level,
): Exercise[] {
  const units = unitsForLevel(level).filter((u) => (byUnit.get(u)?.length ?? 0) > 0);
  if (units.length === 0) return [];

  const perUnit = Math.ceil(count / units.length);
  const picked: Exercise[] = [];
  for (const unit of units) {
    picked.push(...sample(byUnit.get(unit) ?? [], perUnit, `${seed}:${unit}`));
  }

  return shuffled(picked, mulberry32(seedFrom(`${seed}:order`))).slice(0, count);
}

/**
 * Placement runs in rounds, one level at a time, starting at A1.
 *
 * Passing a round moves up a level; failing stops the test. The learner is
 * placed at the highest level they passed, which is what unlocks their units.
 */
export const PLACEMENT_ROUND_SIZE = 10;
export const PLACEMENT_PASS = 0.7;
export const PLACEMENT_LEVELS: Level[] = ['A1', 'A2', 'B1'];

export function buildPlacementRound(
  byUnit: Map<number, Exercise[]>,
  level: Level,
  seed: string,
): Exercise[] {
  return buildLevelTest(byUnit, level, `${seed}:${level}`, PLACEMENT_ROUND_SIZE);
}

/** The level a learner is placed at, given how each round went. */
export function placementResult(rounds: { level: Level; score: number }[]): Level | null {
  let placed: Level | null = null;
  for (const round of rounds) {
    if (round.score >= PLACEMENT_PASS) placed = round.level;
    else break;
  }
  return placed;
}

/** Units to unlock for a placement result: everything up to that level. */
export function unitsUpToLevel(level: Level): number[] {
  const order: Level[] = ['A1', 'A2', 'B1'];
  const limit = order.indexOf(level);
  return UNITS.filter((u) => order.indexOf(u.level) <= limit).map((u) => u.unit);
}
