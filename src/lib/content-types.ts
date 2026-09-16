/**
 * Types for *content* — the sourced data built by scripts/ into data/.
 *
 * Hard rule from the spec: nothing in here is ever authored by hand or by a
 * model. Every record carries provenance (`source`, `sourceUrl`/`sourceId`,
 * `license`) and scripts/validate-data.ts fails CI if any record is missing it.
 */

export type Level = 'A1' | 'A2' | 'B1';

export type Pos =
  | 'noun'
  | 'verb'
  | 'adj'
  | 'adv'
  | 'pron'
  | 'det'
  | 'prep'
  | 'conj'
  | 'num'
  | 'particle'
  | 'interj'
  | 'phrase';

export type Gender = 'm' | 'f' | 'n';

/** A single inflected form from a Wiktionary form table. */
export interface Form {
  form: string;
  /** Raw Wiktionary/wiktextract tags, e.g. ['nominative','plural']. */
  tags: string[];
}

/** Provenance carried by every content record. */
export interface Provenance {
  source: string;
  sourceUrl: string;
  license: string;
  /** Set when the text was shortened or adapted, per CC BY-SA attribution terms. */
  modified?: string;
}

export interface Lemma extends Provenance {
  id: string;
  lemma: string;
  pos: Pos;
  gender?: Gender;
  plural?: string;
  /** True when Wiktionary explicitly marks the noun as having no plural. */
  noPlural?: boolean;
  /** Pluralia tantum (Eltern, Leute): the lemma itself is the plural. */
  pluralOnly?: boolean;
  forms: Form[];
  glosses: string[];
  /** Verb principal parts, when Wiktionary provides them. */
  principalParts?: {
    thirdSg?: string;
    praeteritum?: string;
    partizip2?: string;
    auxiliary?: 'haben' | 'sein' | 'haben/sein';
  };
  separable?: boolean;
  level?: Level;
  /**
   * How `level` was decided. `goethe-wortliste` comes from the bundled
   * Goethe-Institut lists; `goethe-import` from a list the learner loaded on
   * their own device; `frequency-approx` from corpus frequency, for words no
   * list covers.
   */
  levelSource?: 'goethe-wortliste' | 'goethe-import' | 'frequency-approx';
  /** Rank in the frequency list used for the approximate ordering. */
  freqRank?: number;
}

export interface Sentence {
  id: number;
  de: string;
  en: string;
  /** Lemma ids, resolved by rule-based lookup only (no ML lemmatizer). */
  lemmas: string[];
  author: string;
  license: string;
  tatoebaId: number;
  /** Highest level among the lemmas used, so an A1 sentence stays within A1. */
  level: Level;
  source: string;
  sourceUrl: string;
  /** Tatoeba id of the English translation, for its own attribution. */
  enTatoebaId?: number;
  enAuthor?: string;
  enLicense?: string;
}

export type ExerciseType =
  | 'mc-de-en'
  | 'mc-en-de'
  | 'type-de-en'
  | 'type-en-de'
  | 'gender'
  | 'plural'
  | 'principal-parts'
  | 'cloze'
  | 'article-case'
  | 'conjugation-table'
  | 'declension-table'
  | 'word-order'
  | 'choose-form'
  | 'error-spotting';

export interface Exercise {
  id: string;
  unit: number;
  topic: string;
  type: ExerciseType;
  prompt: string;
  answer: string | string[];
  distractors?: string[];
  refs: { lemmaIds?: string[]; sentenceId?: number };
  /** Id of the deterministic generator that produced this item, for audit. */
  generator: string;
}

/** A sourced grammar explanation, built from Wikibooks/Wiktionary. */
export interface GrammarTopic extends Provenance {
  id: string;
  title: string;
  level: Level;
  units: number[];
  /** Markdown body, excerpted from the source. */
  body: string;
  /** Proprietary sites we link to but never copy from. */
  furtherReading: { label: string; url: string }[];
}

export interface UnitDef {
  unit: number;
  level: Level;
  title: string;
  topics: string[];
  lemmaIds: string[];
}
