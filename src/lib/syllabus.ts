import type { Level } from './content-types.ts';

/**
 * The 35-unit course plan. Topic ids are stable identifiers: data/grammar
 * files and Exercise.topic reference them, so renaming one breaks content.
 *
 * Ordering follows SYLLABUS.md. Any change belongs there first, with the CEFR
 * or Goethe reference that justifies it.
 */

export interface UnitPlan {
  unit: number;
  level: Level;
  title: string;
  topics: string[];
}

export const UNITS: UnitPlan[] = [
  // ── A1 ──────────────────────────────────────────────────────────────────
  { unit: 1, level: 'A1', title: 'Alphabet, pronouns, sein', topics: ['alphabet-pronunciation', 'personal-pronouns', 'verb-sein-present'] },
  { unit: 2, level: 'A1', title: 'Present tense, haben, questions', topics: ['present-regular', 'verb-haben-present', 'w-questions', 'yes-no-questions'] },
  { unit: 3, level: 'A1', title: 'Nouns: gender, articles, plural', topics: ['noun-gender', 'articles-definite-indefinite', 'plural-patterns'] },
  { unit: 4, level: 'A1', title: 'Accusative, kein, negation', topics: ['case-accusative', 'kein', 'negation-nicht-vs-kein'] },
  { unit: 5, level: 'A1', title: 'Word order: V2 and inversion', topics: ['word-order-v2', 'word-order-inversion'] },
  { unit: 6, level: 'A1', title: 'Stem-changing and separable verbs', topics: ['verbs-stem-changing', 'verbs-separable'] },
  { unit: 7, level: 'A1', title: 'Modal verbs, möchten', topics: ['modals-present', 'moechten'] },
  { unit: 8, level: 'A1', title: 'Possessive articles', topics: ['possessive-articles'] },
  { unit: 9, level: 'A1', title: 'Imperative', topics: ['imperative'] },
  { unit: 10, level: 'A1', title: 'Prepositions, numbers, time, dates', topics: ['prepositions-time-basic', 'prepositions-place-basic', 'numbers', 'clock-time', 'dates'] },
  { unit: 11, level: 'A1', title: 'Dative', topics: ['case-dative', 'dative-pronouns', 'verbs-with-dative'] },
  { unit: 12, level: 'A1', title: 'Perfekt with haben and sein', topics: ['perfekt-intro'] },

  // ── A2 ──────────────────────────────────────────────────────────────────
  { unit: 13, level: 'A2', title: 'Perfekt and Präteritum basics', topics: ['perfekt-full', 'praeteritum-sein-haben-modals'] },
  { unit: 14, level: 'A2', title: 'Two-way prepositions', topics: ['wechselpraepositionen'] },
  { unit: 15, level: 'A2', title: 'Dative and accusative prepositions', topics: ['prepositions-dative', 'prepositions-accusative'] },
  { unit: 16, level: 'A2', title: 'Adjective declension', topics: ['adjective-declension-strong', 'adjective-declension-weak', 'adjective-declension-mixed'] },
  { unit: 17, level: 'A2', title: 'Comparative and superlative', topics: ['comparative', 'superlative'] },
  { unit: 18, level: 'A2', title: 'Subordinate clauses: weil, dass, wenn, ob', topics: ['subordinate-clauses-basic', 'word-order-verb-final'] },
  { unit: 19, level: 'A2', title: 'Reflexive verbs', topics: ['reflexive-verbs'] },
  { unit: 20, level: 'A2', title: 'Verbs with prepositions, da-/wo-', topics: ['verbs-with-prepositions', 'da-wo-compounds'] },
  { unit: 21, level: 'A2', title: 'Konjunktiv II for politeness', topics: ['konjunktiv2-present'] },
  { unit: 22, level: 'A2', title: 'Indefinite pronouns, man', topics: ['indefinite-pronouns', 'man'] },
  { unit: 23, level: 'A2', title: 'zu + infinitive', topics: ['zu-infinitive-intro'] },

  // ── B1 ──────────────────────────────────────────────────────────────────
  { unit: 24, level: 'B1', title: 'Präteritum for reading', topics: ['praeteritum-full'] },
  { unit: 25, level: 'B1', title: 'Plusquamperfekt', topics: ['plusquamperfekt'] },
  { unit: 26, level: 'B1', title: 'Passive voice', topics: ['passive-present', 'passive-praeteritum', 'passive-perfekt', 'passive-with-modals'] },
  { unit: 27, level: 'B1', title: 'Relative clauses', topics: ['relative-clauses', 'relative-clauses-with-prepositions'] },
  { unit: 28, level: 'B1', title: 'Genitive', topics: ['case-genitive', 'prepositions-genitive'] },
  { unit: 29, level: 'B1', title: 'Konjunktiv II past, als ob', topics: ['konjunktiv2-past', 'als-ob'] },
  { unit: 30, level: 'B1', title: 'Subordinate clauses, extended', topics: ['subordinate-clauses-extended', 'um-zu'] },
  { unit: 31, level: 'B1', title: 'Two-part conjunctions', topics: ['two-part-conjunctions'] },
  { unit: 32, level: 'B1', title: 'n-Deklination', topics: ['n-deklination'] },
  { unit: 33, level: 'B1', title: 'Futur I', topics: ['futur-1'] },
  { unit: 34, level: 'B1', title: 'Infinitive constructions, lassen', topics: ['infinitive-ohne-statt-zu', 'lassen'] },
  { unit: 35, level: 'B1', title: 'Level review', topics: ['b1-review'] },
];

export const ALL_TOPICS: string[] = [...new Set(UNITS.flatMap((u) => u.topics))];

export function unitsForTopic(topic: string): number[] {
  return UNITS.filter((u) => u.topics.includes(topic)).map((u) => u.unit);
}

export function levelForUnit(unit: number): Level {
  return UNITS.find((u) => u.unit === unit)?.level ?? 'A1';
}
