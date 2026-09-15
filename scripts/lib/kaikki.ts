/**
 * Extraction rules for wiktextract (kaikki.org) German records.
 *
 * Everything here is a *selection* rule over fields Wiktionary editors wrote.
 * Nothing is synthesised: if Wiktionary does not state a gender, a plural or a
 * principal part, the field stays empty and the lemma is dropped by
 * validate-data.ts rather than filled in.
 */
import type { Form, Gender, Pos } from '../../src/lib/content-types.ts';

/** Shape of the wiktextract fields this pipeline reads. */
export interface KaikkiEntry {
  word?: string;
  pos?: string;
  lang_code?: string;
  senses?: {
    glosses?: string[];
    tags?: string[];
    form_of?: { word?: string }[];
  }[];
  forms?: { form?: string; tags?: string[]; source?: string }[];
  head_templates?: { name?: string; expansion?: string }[];
}

/** kaikki POS → our POS. Anything absent here is not course vocabulary. */
const POS_MAP: Record<string, Pos> = {
  noun: 'noun',
  verb: 'verb',
  adj: 'adj',
  adv: 'adv',
  pron: 'pron',
  det: 'det',
  article: 'det',
  prep: 'prep',
  postp: 'prep',
  conj: 'conj',
  num: 'num',
  particle: 'particle',
  intj: 'interj',
  phrase: 'phrase',
  contraction: 'particle',
};

/** Proper nouns: allowed inside sentences, never taught as vocabulary. */
export const NAME_POS = new Set(['name']);

/**
 * Tags that mark a form or sense as not current standard German. Used to keep
 * archaic variants out of the material without discarding the entry.
 */
const NON_STANDARD_LIST = [
  'obsolete',
  'archaic',
  'dated',
  'rare',
  'poetic',
  'dialectal',
  'alternative',
  'nonstandard',
  'pronunciation-spelling',
  'informal',
  'colloquial',
  'Switzerland',
  'Liechtenstein',
  'Austria',
] as const;

const NON_STANDARD: Set<string> = new Set(NON_STANDARD_LIST);

function isClean(tags: string[] | undefined): boolean {
  return !(tags ?? []).some((t) => NON_STANDARD.has(t));
}

export function mapPos(pos: string | undefined): Pos | null {
  return pos ? (POS_MAP[pos] ?? null) : null;
}

/** Senses that define the word, as opposed to senses that inflect another. */
export function lemmaSenses(entry: KaikkiEntry): NonNullable<KaikkiEntry['senses']> {
  return (entry.senses ?? []).filter(
    (s) => (s.glosses?.length ?? 0) > 0 && !(s.tags ?? []).includes('form-of'),
  );
}

/** True when the entry is only an inflected form of some other lemma. */
export function isFormOnlyEntry(entry: KaikkiEntry): boolean {
  return lemmaSenses(entry).length === 0;
}

/** Head-line forms — the lemma's own principal parts, not the full tables. */
function headForms(entry: KaikkiEntry): { form: string; tags: string[] }[] {
  return (entry.forms ?? [])
    .filter((f) => f.source !== 'declension' && f.source !== 'conjugation')
    .filter((f): f is { form: string; tags: string[] } => typeof f.form === 'string')
    .map((f) => ({ form: f.form, tags: f.tags ?? [] }));
}

function senseTags(entry: KaikkiEntry): Set<string> {
  return new Set(lemmaSenses(entry).flatMap((s) => s.tags ?? []));
}

/** Gender as Wiktionary states it in the sense tags. */
export function extractGender(entry: KaikkiEntry): Gender | undefined {
  const tags = senseTags(entry);
  if (tags.has('masculine')) return 'm';
  if (tags.has('feminine')) return 'f';
  if (tags.has('neuter')) return 'n';
  return undefined;
}

export interface NounFacts {
  gender?: Gender;
  plural?: string;
  noPlural: boolean;
  pluralOnly: boolean;
}

export function extractNounFacts(entry: KaikkiEntry): NounFacts {
  const tags = senseTags(entry);
  const pluralOnly = tags.has('plural-only');

  // Prefer a plural with no "rare"/"obsolete"-style qualifier; fall back to
  // the first one Wiktionary lists if every variant carries a tag.
  const plurals = headForms(entry).filter((f) => f.tags.includes('plural'));
  const plural = (plurals.find((f) => isClean(f.tags)) ?? plurals[0])?.form;

  return {
    gender: extractGender(entry),
    plural,
    noPlural: tags.has('no-plural') && plural === undefined,
    pluralOnly,
  };
}

export interface VerbFacts {
  thirdSg?: string;
  praeteritum?: string;
  partizip2?: string;
  auxiliary?: 'haben' | 'sein' | 'haben/sein';
  separable: boolean;
}

export function extractVerbFacts(entry: KaikkiEntry): VerbFacts {
  const forms = headForms(entry).filter((f) => isClean(f.tags));
  const pick = (want: string[], not: string[] = []): string | undefined =>
    forms.find(
      (f) => want.every((t) => f.tags.includes(t)) && !not.some((t) => f.tags.includes(t)),
    )?.form;

  const thirdSg = pick(['present', 'singular', 'third-person']);
  const auxes = forms.filter((f) => f.tags.includes('auxiliary')).map((f) => f.form);
  const hasHaben = auxes.includes('haben');
  const hasSein = auxes.includes('sein');

  return {
    thirdSg,
    // 'past' alone is the Präteritum; with 'subjunctive' it is Konjunktiv II.
    praeteritum: pick(['past'], ['subjunctive', 'participle']),
    partizip2: pick(['participle', 'past']),
    auxiliary:
      hasHaben && hasSein ? 'haben/sein' : hasHaben ? 'haben' : hasSein ? 'sein' : undefined,
    // A separable verb conjugates in two pieces: "steht auf", "ruft an".
    separable: thirdSg !== undefined && thirdSg.includes(' '),
  };
}

/** English glosses, in Wiktionary's own order, deduplicated. */
export function extractGlosses(entry: KaikkiEntry, max = 4): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const sense of lemmaSenses(entry)) {
    for (const gloss of sense.glosses ?? []) {
      const text = gloss.trim();
      if (text.length === 0 || seen.has(text)) continue;
      seen.add(text);
      out.push(text);
      if (out.length >= max) return out;
    }
  }
  return out;
}

/**
 * Every inflected form of the lemma, from the declension/conjugation tables.
 * This is what makes rule-based lemmatization possible.
 */
export function extractForms(entry: KaikkiEntry): Form[] {
  const seen = new Set<string>();
  const out: Form[] = [];
  for (const f of entry.forms ?? []) {
    const form = f.form;
    if (typeof form !== 'string' || form.length === 0) continue;
    // wiktextract uses these as table metadata rows, not as word forms.
    if (form === '-' || form === '—') continue;
    const tags = f.tags ?? [];
    if (tags.includes('table-tags') || tags.includes('inflection-template')) continue;
    const key = `${form}|${tags.join(',')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ form, tags });
  }
  return out;
}

/** A real word: letters, optionally joined by a hyphen or apostrophe. */
export function isPlainWord(form: string): boolean {
  return /^[A-Za-zÄÖÜäöüß]+(?:[-'’][A-Za-zÄÖÜäöüß]+)*$/.test(form);
}

/**
 * Forms that are pointers to another verb rather than inflections of this one.
 * wiktextract lists the perfect auxiliary in the form table, so leaving it in
 * makes every verb inherit the corpus frequency of `haben` or `sein`.
 */
export function isIndexableForm(f: Form): boolean {
  return !f.tags.includes('auxiliary') && isPlainWord(f.form);
}

/** Stable id: lemma plus POS, so `sein` the verb and `sein` the pronoun differ. */
export function lemmaId(word: string, pos: Pos): string {
  return `${word}|${pos}`;
}

export function wiktionaryUrl(word: string): string {
  return `https://en.wiktionary.org/wiki/${encodeURIComponent(word)}#German`;
}

/**
 * Tags marking a form the app never needs to store.
 *
 * `multiword-construction` covers the periphrastic tenses (Perfekt,
 * Plusquamperfekt, Futur) — those are built from the principal parts and the
 * auxiliary, which are already recorded, so storing them would triple the
 * data for no new information. `includes-article` rows repeat the adjective
 * with its article attached; the app composes those itself.
 */
const DROP_FORM_TAGS = new Set([
  'multiword-construction',
  'includes-article',
  'class',
  'error-unknown-tag',
  'diminutive',
  // Konjunktiv I is outside the A1–B1 syllabus.
  'subjunctive-i',
  ...NON_STANDARD_LIST,
]);

/** Tags that only describe the table layout, not the form itself. */
const COSMETIC_FORM_TAGS = new Set(['without-article', 'definite', 'indefinite']);

/**
 * Reduces a wiktextract form table to the forms the drills actually use.
 * Selection only — no form is altered or invented.
 */
export function trimForms(forms: Form[]): Form[] {
  const seen = new Set<string>();
  const out: Form[] = [];
  for (const f of forms) {
    if (f.tags.some((t) => DROP_FORM_TAGS.has(t))) continue;
    // Multi-word forms are kept: a separable verb's main-clause present is
    // genuinely two words ("komme aus"), and dropping it would leave only the
    // subordinate-clause form ("auskomme") to stand in for the whole
    // paradigm. Periphrastic tenses are already excluded by tag above.
    // wiktextract abbreviates long headwords in tables as "..es"/"..en";
    // left in, those resolve to the frequent words "es" and "en".
    if (!f.form.split(' ').every(isPlainWord)) continue;

    const tags = f.tags.filter((t) => !COSMETIC_FORM_TAGS.has(t)).sort();
    const key = `${f.form}|${tags.join(',')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ form: f.form, tags });
  }
  return out;
}

/**
 * True when every sense just points at another word — "alternative form of",
 * "obsolete spelling of", "abbreviation of". wiktextract does not always tag
 * these as form-of, and left in they let rare spellings of common words
 * (`mir` as a variant of `wir`) inherit that word's corpus frequency.
 */
const POINTER_GLOSS =
  /\b(?:alternative (?:form|spelling|letter-case form)|obsolete (?:form|spelling)|archaic (?:form|spelling)|misspelling|abbreviation|initialism|acronym|clipping|contraction|eye dialect|pronunciation spelling|superseded|dated form) of\b/i;

export function isPointerEntry(glosses: string[]): boolean {
  return glosses.length > 0 && glosses.every((g) => POINTER_GLOSS.test(g));
}

/** Headwords that are not words a learner types: abbreviations, numerals. */
export function isTypeableHeadword(word: string): boolean {
  if (/\d/.test(word)) return false;
  if (word.endsWith('.')) return false;
  if (/\s/.test(word)) return false;
  // All-caps headwords of any length are initialisms (IM, EU, DDR).
  if (word.length > 1 && word === word.toUpperCase() && /[A-ZÄÖÜ]/.test(word)) return false;
  return true;
}
