import { describe, expect, it } from 'vitest';
import {
  buildQueue,
  dayKey,
  isDue,
  isLeech,
  leechQueue,
  newCard,
  retentionRate,
  reviewCard,
  LEECH_THRESHOLD,
} from '~/srs/scheduler.ts';
import type { Card, ReviewLog } from '~/db/types.ts';

const T0 = new Date('2026-01-01T09:00:00Z').getTime();
const DAY = 86_400_000;

function card(overrides: Partial<Card> = {}): Card {
  return { ...newCard('Haus|noun', 'gender', 3, T0), ...overrides };
}

describe('newCard', () => {
  it('starts in the New state and due immediately', () => {
    const c = newCard('Haus|noun', 'gender', 3, T0);
    expect(c.state).toBe(0);
    expect(c.reps).toBe(0);
    expect(c.id).toBe('Haus|noun:gender');
    expect(isDue(c, T0)).toBe(true);
  });
});

describe('reviewCard', () => {
  it('schedules further out for Good than for Again', () => {
    const again = reviewCard(card(), 1, 'practice', T0).card;
    const good = reviewCard(card(), 3, 'practice', T0).card;
    expect(good.due).toBeGreaterThan(again.due);
  });

  it('records the state the review was graded from, for later re-optimisation', () => {
    const start = card({ state: 2, stability: 10, difficulty: 5, scheduledDays: 7, elapsedDays: 7 });
    const { log } = reviewCard(start, 3, 'practice', T0, 4200);
    expect(log).toMatchObject({
      cardId: start.id, rating: 3, mode: 'practice',
      state: 2, scheduledDays: 7, durationMs: 4200,
    });
  });

  it('counts a lapse when a learned card is failed', () => {
    const learned = reviewCard(
      reviewCard(card(), 3, 'practice', T0).card, 3, 'practice', T0 + DAY,
    ).card;
    const lapsed = reviewCard(learned, 1, 'practice', T0 + 2 * DAY).card;
    expect(lapsed.lapses).toBeGreaterThan(learned.lapses);
  });

  it('marks the review time so progress survives a reload', () => {
    expect(reviewCard(card(), 3, 'practice', T0).card.lastReview).toBe(T0);
  });
});

describe('leeches', () => {
  it('flags a card at the lapse threshold', () => {
    expect(isLeech(card({ lapses: LEECH_THRESHOLD - 1 }))).toBe(false);
    expect(isLeech(card({ lapses: LEECH_THRESHOLD }))).toBe(true);
  });

  it('keeps leeches out of the main queue and in their own', () => {
    const stuck = card({ id: 'a', lapses: 5, state: 2, due: T0 - DAY });
    const fine = card({ id: 'b', state: 2, due: T0 - DAY });
    const queue = buildQueue([stuck, fine], { newPerDay: 10, reviewsPerDay: 10 }, { newCards: 0, reviews: 0 }, T0);
    expect(queue.map((c) => c.id)).toEqual(['b']);
    expect(leechQueue([stuck, fine]).map((c) => c.id)).toEqual(['a']);
  });
});

describe('buildQueue', () => {
  it('puts due reviews before new cards', () => {
    const fresh = card({ id: 'new' });
    const due = card({ id: 'due', state: 2, due: T0 - DAY });
    const queue = buildQueue([fresh, due], { newPerDay: 5, reviewsPerDay: 5 }, { newCards: 0, reviews: 0 }, T0);
    expect(queue.map((c) => c.id)).toEqual(['due', 'new']);
  });

  it('respects the daily limits', () => {
    const cards = Array.from({ length: 10 }, (_, i) => card({ id: `n${i}` }));
    const queue = buildQueue(cards, { newPerDay: 3, reviewsPerDay: 100 }, { newCards: 0, reviews: 0 }, T0);
    expect(queue).toHaveLength(3);
  });

  it('counts what was already done today against the limit', () => {
    const cards = Array.from({ length: 10 }, (_, i) => card({ id: `n${i}` }));
    const queue = buildQueue(cards, { newPerDay: 5, reviewsPerDay: 100 }, { newCards: 4, reviews: 0 }, T0);
    expect(queue).toHaveLength(1);
  });

  it('leaves out cards that are not due yet', () => {
    const later = card({ id: 'later', state: 2, due: T0 + DAY });
    expect(buildQueue([later], { newPerDay: 5, reviewsPerDay: 5 }, { newCards: 0, reviews: 0 }, T0)).toHaveLength(0);
  });

  it('skips suspended cards', () => {
    const off = card({ id: 'off', suspended: true, state: 2, due: T0 - DAY });
    expect(buildQueue([off], { newPerDay: 5, reviewsPerDay: 5 }, { newCards: 0, reviews: 0 }, T0)).toHaveLength(0);
  });
});

describe('corrupt cards', () => {
  it('survives a card that claims to be learned but has no memory state', () => {
    // An imported backup could hold this; throwing would end the session.
    const broken = card({ state: 2, stability: 0, difficulty: 0 });
    expect(() => reviewCard(broken, 3, 'practice', T0)).not.toThrow();
    expect(reviewCard(broken, 3, 'practice', T0).card.reps).toBe(1);
  });
});

describe('retentionRate', () => {
  it('measures only reviews of already-learned cards', () => {
    const logs: ReviewLog[] = [
      { cardId: 'a', ts: T0, rating: 3, mode: 'practice', state: 2, elapsedDays: 1, scheduledDays: 1, learningSteps: 0 },
      { cardId: 'b', ts: T0, rating: 1, mode: 'practice', state: 2, elapsedDays: 1, scheduledDays: 1, learningSteps: 0 },
      // A new card is not a retention measurement.
      { cardId: 'c', ts: T0, rating: 1, mode: 'practice', state: 0, elapsedDays: 0, scheduledDays: 0, learningSteps: 0 },
    ];
    expect(retentionRate(logs)).toBe(0.5);
  });

  it('is null before there is anything to measure', () => {
    expect(retentionRate([])).toBeNull();
  });
});

describe('dayKey', () => {
  it('is stable within a day and changes across days', () => {
    expect(dayKey(T0)).toBe(dayKey(T0 + 60_000));
    expect(dayKey(T0)).not.toBe(dayKey(T0 + DAY));
  });
});
