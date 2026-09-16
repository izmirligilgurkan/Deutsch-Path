import { getDB } from '~/db/index.ts';
import type { Card, Mistake, PracticeMode, ReviewLog, Settings, UnitProgress } from '~/db/types.ts';
import type { Lemma, Level } from '~/lib/content-types.ts';
import { loadCourseLexicon } from '~/db/level-list.ts';
import { updateSettings } from '~/db/settings-store.ts';
import { buildQueue, dayKey, leechQueue, newCard, reviewCard } from './scheduler.ts';
import { cardTypesFor } from './cards.ts';
import { UNITS } from '~/lib/syllabus.ts';

/**
 * Bridges the scheduler and IndexedDB: creating cards for unlocked units,
 * assembling the day's queue, and persisting each answer with its log entry.
 */

const LEVEL_ORDER: Record<Level, number> = { A1: 0, A2: 1, B1: 2 };

/** Lemmas belong to a unit in frequency order, matching build-exercises.ts. */
const LEMMAS_PER_UNIT = 25;

export function assignLemmasToUnits(lexicon: Lemma[]): Map<number, Lemma[]> {
  const byLevel = new Map<Level, Lemma[]>();
  for (const level of ['A1', 'A2', 'B1'] as Level[]) {
    byLevel.set(
      level,
      lexicon
        // A reference lemma is read, not drilled.
        .filter((l) => l.level === level && !l.reference)
        .sort((a, b) => (a.freqRank ?? 0) - (b.freqRank ?? 0)),
    );
  }

  const assigned = new Set<string>();
  const out = new Map<number, Lemma[]>();
  for (const plan of UNITS) {
    const available = (byLevel.get(plan.level) ?? []).filter((l) => !assigned.has(l.id));
    const slice = available.slice(0, LEMMAS_PER_UNIT);
    for (const l of slice) assigned.add(l.id);
    out.set(plan.unit, slice);
  }
  return out;
}

/**
 * Creates the SRS cards for a unit, if they do not exist yet. Idempotent: card
 * ids are derived from the lemma and card type, so re-running never duplicates
 * or resets scheduling.
 */
export async function ensureCardsForUnit(unit: number): Promise<number> {
  const lexicon = await loadCourseLexicon();
  const lemmas = assignLemmasToUnits(lexicon).get(unit) ?? [];
  const db = await getDB();

  const tx = db.transaction('cards', 'readwrite');
  const store = tx.objectStore('cards');
  let created = 0;
  for (const lemma of lemmas) {
    for (const cardType of cardTypesFor(lemma)) {
      const card = newCard(lemma.id, cardType, unit);
      if (await store.get(card.id)) continue;
      await store.put(card);
      created += 1;
    }
  }
  await tx.done;
  return created;
}

export interface DayCounts {
  newCards: number;
  reviews: number;
}

/** What has already been studied today, so daily limits mean a real day. */
export async function countsForToday(now = Date.now()): Promise<DayCounts> {
  const db = await getDB();
  const today = dayKey(now);
  const logs = await db.getAllFromIndex(
    'reviewLogs',
    'by-ts',
    IDBKeyRange.lowerBound(startOfDay(now)),
  );
  let newCards = 0;
  let reviews = 0;
  for (const log of logs) {
    if (dayKey(log.ts) !== today || log.mode !== 'practice') continue;
    if (log.state === 0) newCards += 1;
    else reviews += 1;
  }
  return { newCards, reviews };
}

function startOfDay(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export interface QueueSummary {
  queue: Card[];
  dueCount: number;
  newCount: number;
  leeches: number;
}

export async function buildSession(
  settings: Settings,
  now = Date.now(),
): Promise<QueueSummary> {
  const db = await getDB();
  const cards = await db.getAll('cards');
  const counts = await countsForToday(now);

  const queue = buildQueue(
    cards,
    { newPerDay: settings.newCardsPerDay, reviewsPerDay: settings.reviewsPerDay },
    counts,
    now,
  );

  return {
    queue,
    dueCount: cards.filter((c) => !c.suspended && c.state !== 0 && c.due <= now).length,
    newCount: cards.filter((c) => !c.suspended && c.state === 0).length,
    leeches: leechQueue(cards).length,
  };
}

export async function getLeechQueue(): Promise<Card[]> {
  const db = await getDB();
  return leechQueue(await db.getAll('cards'));
}

export interface AnswerRecord {
  card: Card;
  correct: boolean;
  given: string;
  expected: string;
  mode: PracticeMode;
  topic: string;
  exerciseId: string;
  durationMs?: number;
}

/**
 * Persists one answer: the rescheduled card, its log entry, the mistake if any,
 * and the lemma's "seen" record that feeds the personal dictionary.
 */
export async function recordAnswer(input: AnswerRecord, now = Date.now()): Promise<Card> {
  // Binary right/wrong maps to Again or Good; the review screen can still
  // offer the full four grades, which call reviewCard directly.
  const rating: 1 | 3 = input.correct ? 3 : 1;
  const { card, log } = reviewCard(input.card, rating, input.mode, now, input.durationMs);
  return persist(card, log, input, now);
}

/** Same, with the learner's own grade from the four buttons. */
export async function recordGraded(
  input: AnswerRecord,
  rating: 1 | 2 | 3 | 4,
  now = Date.now(),
): Promise<Card> {
  const { card, log } = reviewCard(input.card, rating, input.mode, now, input.durationMs);
  return persist(card, log, input, now);
}

async function persist(
  card: Card,
  log: ReviewLog,
  input: AnswerRecord,
  now: number,
): Promise<Card> {
  const db = await getDB();
  const tx = db.transaction(['cards', 'reviewLogs', 'mistakes', 'seenLemmas'], 'readwrite');

  await tx.objectStore('cards').put(card);
  await tx.objectStore('reviewLogs').add(log);

  if (!input.correct) {
    const mistake: Mistake = {
      ts: now,
      topic: input.topic,
      unit: card.unit,
      exerciseId: input.exerciseId,
      exerciseType: card.cardType,
      given: input.given,
      expected: input.expected,
      mode: input.mode,
    };
    await tx.objectStore('mistakes').add(mistake);
  }

  const seenStore = tx.objectStore('seenLemmas');
  const seen = await seenStore.get(card.lemmaId);
  await seenStore.put({
    lemmaId: card.lemmaId,
    firstSeenAt: seen?.firstSeenAt ?? now,
    lastSeenAt: now,
    timesCorrect: (seen?.timesCorrect ?? 0) + (input.correct ? 1 : 0),
    timesWrong: (seen?.timesWrong ?? 0) + (input.correct ? 0 : 1),
  });

  await tx.done;
  return card;
}

/**
 * Advances the streak. Studying on consecutive days increments it; a gap
 * resets it to one. Studying twice in a day changes nothing.
 */
export async function touchStreak(settings: Settings, now = Date.now()): Promise<number> {
  const today = dayKey(now);
  if (settings.lastStudyDay === today) return settings.streakCount;

  const yesterday = dayKey(now - 86_400_000);
  const streak = settings.lastStudyDay === yesterday ? settings.streakCount + 1 : 1;
  await updateSettings({ streakCount: streak, lastStudyDay: today });
  return streak;
}

/** A unit test at or above this score unlocks the next unit (spec §4.2). */
export const PASS_MARK = 0.8;

/**
 * Unlock state per unit: linear, gated on the unit test unless the learner
 * turns the gate off. Pure, so the progression rule can be tested directly.
 */
export function computeUnlocked(
  progress: UnitProgress[],
  requireUnitTest: boolean,
): Set<number> {
  const byUnit = new Map(progress.map((p) => [p.unit, p]));

  // Unit 1 is always available; there is nothing to pass before it.
  const unlocked = new Set<number>([1]);
  for (const plan of UNITS) {
    const p = byUnit.get(plan.unit);
    if (p?.unlocked) unlocked.add(plan.unit);

    // Only a unit that is itself reachable can unlock the next one, or turning
    // the gate off would open the whole course at once from unit 1.
    if (!unlocked.has(plan.unit)) continue;
    const passed = (p?.bestScore ?? 0) >= PASS_MARK;
    if (passed || !requireUnitTest) unlocked.add(plan.unit + 1);
  }

  // Never offer a unit past the end of the course.
  unlocked.delete(UNITS.length + 1);
  return unlocked;
}

export async function unlockedUnits(settings: Settings): Promise<Set<number>> {
  const db = await getDB();
  return computeUnlocked(await db.getAll('unitProgress'), settings.requireUnitTestToUnlock);
}

export function levelAtOrBelow(level: Level, other: Level): boolean {
  return LEVEL_ORDER[other] <= LEVEL_ORDER[level];
}
