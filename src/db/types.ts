import type { ExerciseType, Level } from '~/lib/content-types.ts';

/** Everything in this file is *learner state*: local, private, never shipped. */

export type PracticeMode = 'practice' | 'test';

/** FSRS card state, persisted so ts-fsrs can resume scheduling. */
export interface Card {
  /** `${lemmaId}:${cardType}` — stable and derivable, so rebuilds don't orphan. */
  id: string;
  lemmaId: string;
  cardType: ExerciseType;
  unit: number;
  /** ts-fsrs Card fields, stored as plain JSON (dates as epoch ms). */
  due: number;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  state: 0 | 1 | 2 | 3;
  lastReview?: number;
  /** Cards with >= 4 lapses go to the leech queue (spec §4.3). */
  suspended?: boolean;
}

export interface ReviewLog {
  /** autoIncrement */
  id?: number;
  cardId: string;
  ts: number;
  rating: 1 | 2 | 3 | 4;
  mode: PracticeMode;
  /** Snapshot of scheduler state before the review, for later FSRS re-optimization. */
  state: 0 | 1 | 2 | 3;
  elapsedDays: number;
  scheduledDays: number;
  /** ms the learner took to answer. */
  durationMs?: number;
}

export interface UnitProgress {
  unit: number;
  unlocked: boolean;
  /** Best unit-test score as a fraction 0..1. >= 0.8 unlocks the next unit. */
  bestScore?: number;
  completedAt?: number;
  lastOpenedAt?: number;
}

export interface Mistake {
  id?: number;
  ts: number;
  topic: string;
  unit: number;
  exerciseId: string;
  exerciseType: ExerciseType;
  given: string;
  expected: string;
  mode: PracticeMode;
}

export interface TestResult {
  id?: number;
  ts: number;
  kind: 'unit' | 'level' | 'daily' | 'placement';
  unit?: number;
  level?: Level;
  score: number;
  total: number;
  durationMs: number;
  /** Ids of items answered wrong, so they can be re-queued as cards. */
  wrongExerciseIds: string[];
}

/** Lemma -> CEFR level, imported on-device from the learner's own Goethe PDFs. */
export interface LevelListEntry {
  lemma: string;
  level: Level;
}

/** A lemma the learner has encountered, powering the personal dictionary. */
export interface SeenLemma {
  lemmaId: string;
  firstSeenAt: number;
  lastSeenAt: number;
  timesCorrect: number;
  timesWrong: number;
}

export interface Settings {
  id: 'app';
  onboarded: boolean;
  /** null until the learner finishes onboarding or a placement test. */
  startLevel: Level | null;
  newCardsPerDay: number;
  reviewsPerDay: number;
  caseSensitive: boolean;
  /** ae/oe/ue/ss accepted for ä/ö/ü/ß — practice mode only, never in tests. */
  allowTransliteration: boolean;
  /** Lets the learner bypass the 80% unit-test gate (spec §4.2). */
  requireUnitTestToUnlock: boolean;
  theme: 'system' | 'light' | 'dark';
  uiLanguage: 'en';
  showSourceAttribution: boolean;
  timerOnLevelTests: boolean;
  streakCount: number;
  lastStudyDay: string | null;
  levelListImportedAt: number | null;
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'app',
  onboarded: false,
  startLevel: null,
  newCardsPerDay: 15,
  reviewsPerDay: 150,
  caseSensitive: true,
  allowTransliteration: true,
  requireUnitTestToUnlock: true,
  theme: 'system',
  uiLanguage: 'en',
  showSourceAttribution: true,
  timerOnLevelTests: false,
  streakCount: 0,
  lastStudyDay: null,
  levelListImportedAt: null,
};
