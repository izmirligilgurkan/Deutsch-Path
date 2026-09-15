import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  type Card as FsrsCard,
  type FSRS,
  type Grade,
} from 'ts-fsrs';
import type { Card, PracticeMode, ReviewLog } from '~/db/types.ts';
import type { ExerciseType } from '~/lib/content-types.ts';

/**
 * FSRS scheduling (spec §4.3).
 *
 * Every review is written to a log with the scheduler state *before* it, so
 * the parameters can be re-optimised later against the learner's own history.
 * Cards are stored as plain JSON with epoch-millisecond dates; conversion to
 * and from ts-fsrs happens only here.
 */

/** Cards failed this many times are leeches and go to a separate queue. */
export const LEECH_THRESHOLD = 4;

let engine: FSRS | null = null;

function scheduler(): FSRS {
  // Fuzz would make scheduling non-reproducible in tests for no learner gain
  // at this scale.
  engine ??= fsrs(generatorParameters({ enable_fuzz: false }));
  return engine;
}

export function cardId(lemmaId: string, cardType: ExerciseType): string {
  return `${lemmaId}:${cardType}`;
}

export function newCard(
  lemmaId: string,
  cardType: ExerciseType,
  unit: number,
  now = Date.now(),
): Card {
  const empty = createEmptyCard(new Date(now));
  return {
    id: cardId(lemmaId, cardType),
    lemmaId,
    cardType,
    unit,
    due: empty.due.getTime(),
    stability: empty.stability,
    difficulty: empty.difficulty,
    elapsedDays: empty.elapsed_days,
    scheduledDays: empty.scheduled_days,
    reps: empty.reps,
    lapses: empty.lapses,
    state: empty.state as Card['state'],
    learningSteps: empty.learning_steps,
  };
}

/**
 * FSRS rejects a card that claims to be learned but carries no memory state
 * (difficulty or stability of zero). That combination should never occur
 * normally, but an imported backup or a half-written record could hold one,
 * and throwing here would break the whole review session. Such a card is
 * treated as new, which costs one repetition and keeps the session alive.
 */
function repaired(card: Card): Card {
  if (card.state !== 0 && (card.difficulty <= 0 || card.stability <= 0)) {
    return { ...card, state: 0, difficulty: 0, stability: 0, learningSteps: 0 };
  }
  return card;
}

function toFsrs(card: Card): FsrsCard {
  return {
    due: new Date(card.due),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsedDays,
    scheduled_days: card.scheduledDays,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    learning_steps: card.learningSteps,
    ...(card.lastReview === undefined ? {} : { last_review: new Date(card.lastReview) }),
  } as FsrsCard;
}

export interface ReviewOutcome {
  card: Card;
  log: ReviewLog;
}

/**
 * Applies a grade and returns the updated card plus the log entry to persist.
 * Pure: the caller decides when to write.
 */
export function reviewCard(
  card: Card,
  rating: 1 | 2 | 3 | 4,
  mode: PracticeMode,
  now = Date.now(),
  durationMs?: number,
): ReviewOutcome {
  const safe = repaired(card);
  const result = scheduler().next(toFsrs(safe), new Date(now), rating as Grade);
  const next = result.card;

  const updated: Card = {
    ...safe,
    due: next.due.getTime(),
    stability: next.stability,
    difficulty: next.difficulty,
    elapsedDays: next.elapsed_days,
    scheduledDays: next.scheduled_days,
    reps: next.reps,
    lapses: next.lapses,
    state: next.state as Card['state'],
    learningSteps: next.learning_steps,
    lastReview: now,
  };

  const log: ReviewLog = {
    cardId: safe.id,
    ts: now,
    rating,
    mode,
    // Snapshot of the state this review was graded from.
    state: safe.state,
    elapsedDays: safe.elapsedDays,
    scheduledDays: safe.scheduledDays,
    learningSteps: safe.learningSteps,
    ...(durationMs === undefined ? {} : { durationMs }),
  };

  return { card: updated, log };
}

/** Human-readable next intervals, for the four grade buttons. */
export function previewIntervals(card: Card, now = Date.now()): Record<1 | 2 | 3 | 4, string> {
  const scheduled = scheduler().repeat(toFsrs(repaired(card)), new Date(now));
  const label = (due: Date): string => {
    const minutes = Math.round((due.getTime() - now) / 60000);
    if (minutes < 60) return `${Math.max(1, minutes)}m`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.round(hours / 24);
    if (days < 30) return `${days}d`;
    const months = Math.round(days / 30);
    return months < 12 ? `${months}mo` : `${Math.round(months / 12)}y`;
  };
  return {
    1: label(scheduled[Rating.Again].card.due),
    2: label(scheduled[Rating.Hard].card.due),
    3: label(scheduled[Rating.Good].card.due),
    4: label(scheduled[Rating.Easy].card.due),
  };
}

export function isLeech(card: Card): boolean {
  return card.lapses >= LEECH_THRESHOLD;
}

export function isDue(card: Card, now = Date.now()): boolean {
  return !card.suspended && card.due <= now;
}

/**
 * Builds a review session: due cards first, then new ones, each capped by the
 * learner's daily limits. Leeches are held back for their own queue so a
 * handful of stuck cards cannot crowd out the day's reviews.
 */
export function buildQueue(
  cards: Card[],
  limits: { newPerDay: number; reviewsPerDay: number },
  reviewedToday: { newCards: number; reviews: number },
  now = Date.now(),
): Card[] {
  const fresh: Card[] = [];
  const due: Card[] = [];

  for (const card of cards) {
    if (card.suspended || isLeech(card)) continue;
    if (card.state === 0) fresh.push(card);
    else if (card.due <= now) due.push(card);
  }

  due.sort((a, b) => a.due - b.due);
  fresh.sort((a, b) => a.unit - b.unit || a.id.localeCompare(b.id));

  const reviewRoom = Math.max(0, limits.reviewsPerDay - reviewedToday.reviews);
  const newRoom = Math.max(0, limits.newPerDay - reviewedToday.newCards);

  return [...due.slice(0, reviewRoom), ...fresh.slice(0, newRoom)];
}

export function leechQueue(cards: Card[]): Card[] {
  return cards.filter((c) => isLeech(c) && !c.suspended).sort((a, b) => b.lapses - a.lapses);
}

/** Retention: share of reviews on already-learned cards that were not lapses. */
export function retentionRate(logs: ReviewLog[]): number | null {
  const mature = logs.filter((l) => l.state === 2);
  if (mature.length === 0) return null;
  return mature.filter((l) => l.rating > 1).length / mature.length;
}

/** Local calendar day key, so "today" follows the learner's timezone. */
export function dayKey(ts = Date.now()): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
