import type { DBSchema } from 'idb';
import type {
  Card,
  LevelListEntry,
  Mistake,
  ReviewLog,
  SeenLemma,
  SessionState,
  Settings,
  TestResult,
  UnitProgress,
} from './types.ts';

export const DB_NAME = 'deutsch-path';
export const DB_VERSION = 2;

export interface DeutschPathDB extends DBSchema {
  settings: {
    key: 'app';
    value: Settings;
  };
  cards: {
    key: string;
    value: Card;
    indexes: {
      'by-due': number;
      'by-lemma': string;
      'by-unit': number;
      'by-lapses': number;
    };
  };
  reviewLogs: {
    key: number;
    value: ReviewLog;
    indexes: { 'by-card': string; 'by-ts': number };
  };
  unitProgress: {
    key: number;
    value: UnitProgress;
  };
  mistakes: {
    key: number;
    value: Mistake;
    indexes: { 'by-ts': number; 'by-topic': string; 'by-unit': number };
  };
  testResults: {
    key: number;
    value: TestResult;
    indexes: { 'by-ts': number; 'by-kind': string };
  };
  /** A learner-imported level list, overriding the bundled Goethe levels. */
  levelList: {
    key: string;
    value: LevelListEntry;
  };
  seenLemmas: {
    key: string;
    value: SeenLemma;
    indexes: { 'by-last-seen': number };
  };
  /** An unfinished practice session, so it can be picked up where it stopped. */
  sessionState: {
    key: string;
    value: SessionState;
  };
}
