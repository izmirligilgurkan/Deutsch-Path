/**
 * Topic id → the Wikibooks page its explanation is excerpted from.
 *
 * A topic with no `page` is one the open sources do not cover at the depth
 * this course needs. Per the build spec those become stubs with reference
 * links — the gap is never filled in by hand.
 *
 * `section` narrows the excerpt to one heading on a shared page, so that
 * `case-accusative` and `case-dative` do not both ship the whole Cases page.
 */

export interface TopicSource {
  /** Title shown in the app. */
  title: string;
  /** Wikibooks page title, or omitted when the source does not cover it. */
  page?: string;
  /** Heading on that page to excerpt, when the page covers several topics. */
  section?: string;
  /** Proprietary sites linked as further practice. Never copied from. */
  furtherReading?: { label: string; url: string }[];
}

const LINGOLIA = (slug: string, label: string) => ({
  label: `Lingolia: ${label}`,
  url: `https://deutsch.lingolia.com/de/grammatik/${slug}`,
});
const MDB = (slug: string, label: string) => ({
  label: `mein-deutschbuch.de: ${label}`,
  url: `https://mein-deutschbuch.de/grammatik/${slug}`,
});

export const TOPIC_SOURCES: Record<string, TopicSource> = {
  // ── A1 ──────────────────────────────────────────────────────────────────
  'alphabet-pronunciation': { title: 'Alphabet and pronunciation', page: 'German/Grammar/Alphabet and Pronunciation' },
  'personal-pronouns': { title: 'Personal pronouns', page: 'German/Grammar/Personal pronouns', furtherReading: [LINGOLIA('pronomen/personalpronomen', 'Personalpronomen')] },
  'verb-sein-present': { title: 'sein in the present tense', page: 'German/Grammar/Irregular verbs', furtherReading: [LINGOLIA('verben/sein-haben', 'sein und haben')] },
  'present-regular': { title: 'Present tense', page: 'German/Grammar/Verbs', furtherReading: [LINGOLIA('zeitformen/praesens', 'Präsens')] },
  'verb-haben-present': { title: 'haben in the present tense', page: 'German/Grammar/Irregular verbs', furtherReading: [LINGOLIA('verben/sein-haben', 'sein und haben')] },
  'w-questions': { title: 'W-questions', page: 'German/Grammar/Interrogatives', furtherReading: [LINGOLIA('satzbau/fragen', 'Fragen')] },
  'yes-no-questions': { title: 'Yes/no questions', page: 'German/Grammar/Polar questions' },
  'noun-gender': { title: 'Noun gender', page: 'German/Grammar/Noun gender', furtherReading: [LINGOLIA('substantive/genus', 'Genus')] },
  'articles-definite-indefinite': { title: 'Definite and indefinite articles', page: 'German/Grammar/Noun phrases', furtherReading: [LINGOLIA('substantive/artikel', 'Artikel')] },
  'plural-patterns': { title: 'Plural patterns', page: 'German/Grammar/Noun plurals', furtherReading: [LINGOLIA('substantive/plural', 'Plural')] },
  'case-accusative': { title: 'Accusative case', page: 'German/Grammar/Cases', furtherReading: [LINGOLIA('substantive/kasus', 'Kasus')] },
  kein: { title: 'kein', furtherReading: [LINGOLIA('satzbau/verneinung', 'Verneinung')] },
  'negation-nicht-vs-kein': { title: 'nicht vs kein', furtherReading: [LINGOLIA('satzbau/verneinung', 'Verneinung'), MDB('negation.html', 'Negation')] },
  'word-order-v2': { title: 'Word order: the verb second', page: 'German/Grammar/Sentences', furtherReading: [LINGOLIA('satzbau/hauptsatz', 'Hauptsatz')] },
  'word-order-inversion': { title: 'Inversion', page: 'German/Grammar/Sentences', furtherReading: [LINGOLIA('satzbau/hauptsatz', 'Hauptsatz')] },
  'verbs-stem-changing': { title: 'Stem-changing verbs', page: 'German/Grammar/Stem-changing verbs' },
  'verbs-separable': { title: 'Separable verbs', page: 'German/Grammar/Prefixed verbs', furtherReading: [LINGOLIA('verben/trennbare-verben', 'Trennbare Verben')] },
  'modals-present': { title: 'Modal verbs', page: 'German/Grammar/Modal auxiliary verbs', furtherReading: [LINGOLIA('verben/modalverben', 'Modalverben')] },
  moechten: { title: 'möchten', furtherReading: [LINGOLIA('verben/modalverben', 'Modalverben')] },
  'possessive-articles': { title: 'Possessive articles', page: 'German/Grammar/Pronomial possessives', furtherReading: [LINGOLIA('pronomen/possessivpronomen', 'Possessivpronomen')] },
  imperative: { title: 'Imperative', page: 'German/Grammar/Imperatives', furtherReading: [LINGOLIA('verben/imperativ', 'Imperativ')] },
  'prepositions-time-basic': { title: 'Prepositions of time', page: 'German/Grammar/Prepositions and Postpositions', furtherReading: [LINGOLIA('praepositionen/temporal', 'Temporale Präpositionen')] },
  'prepositions-place-basic': { title: 'Prepositions of place', page: 'German/Grammar/Prepositions and Postpositions', furtherReading: [LINGOLIA('praepositionen/lokal', 'Lokale Präpositionen')] },
  numbers: { title: 'Numbers', page: 'German/Appendices/Numbers' },
  'clock-time': { title: 'Telling the time', furtherReading: [MDB('uhrzeit.html', 'Uhrzeit')] },
  dates: { title: 'Dates', furtherReading: [MDB('datum.html', 'Datum')] },
  'case-dative': { title: 'Dative case', page: 'German/Grammar/Cases', furtherReading: [LINGOLIA('substantive/kasus', 'Kasus')] },
  'dative-pronouns': { title: 'Dative pronouns', page: 'German/Grammar/Personal pronouns' },
  'verbs-with-dative': { title: 'Verbs with the dative', page: 'German/Grammar/Ditransitive verbs', furtherReading: [MDB('verben-mit-dativ.html', 'Verben mit Dativ')] },
  'perfekt-intro': { title: 'Perfekt: an introduction', furtherReading: [LINGOLIA('zeitformen/perfekt', 'Perfekt')] },

  // ── A2 ──────────────────────────────────────────────────────────────────
  'perfekt-full': { title: 'Perfekt', furtherReading: [LINGOLIA('zeitformen/perfekt', 'Perfekt'), MDB('perfekt.html', 'Perfekt')] },
  'praeteritum-sein-haben-modals': { title: 'Präteritum of sein, haben and modals', page: 'German/Grammar/The simple past tense', furtherReading: [LINGOLIA('zeitformen/praeteritum', 'Präteritum')] },
  wechselpraepositionen: { title: 'Two-way prepositions', page: 'German/Grammar/Prepositions with accusative and dative', furtherReading: [LINGOLIA('praepositionen/wechselpraepositionen', 'Wechselpräpositionen')] },
  'prepositions-dative': { title: 'Dative prepositions', page: 'German/Grammar/Dative prepositions' },
  'prepositions-accusative': { title: 'Accusative prepositions', page: 'German/Grammar/Prepositions and Postpositions', furtherReading: [LINGOLIA('praepositionen', 'Präpositionen')] },
  'adjective-declension-strong': { title: 'Strong adjective declension', page: 'German/Grammar/Declining adjectives', furtherReading: [LINGOLIA('adjektive/deklination', 'Adjektivdeklination')] },
  'adjective-declension-weak': { title: 'Weak adjective declension', page: 'German/Grammar/Declining adjectives', furtherReading: [LINGOLIA('adjektive/deklination', 'Adjektivdeklination')] },
  'adjective-declension-mixed': { title: 'Mixed adjective declension', page: 'German/Grammar/Declining adjectives', furtherReading: [LINGOLIA('adjektive/deklination', 'Adjektivdeklination')] },
  comparative: { title: 'Comparative', page: 'German/Grammar/Adjectives and Adverbs', furtherReading: [LINGOLIA('adjektive/steigerung', 'Steigerung')] },
  superlative: { title: 'Superlative', page: 'German/Grammar/Adjectives and Adverbs', furtherReading: [LINGOLIA('adjektive/steigerung', 'Steigerung')] },
  'subordinate-clauses-basic': { title: 'Subordinate clauses', page: 'German/Grammar/Subordinating conjunctions', furtherReading: [LINGOLIA('satzbau/nebensatz', 'Nebensatz')] },
  'word-order-verb-final': { title: 'Verb-final word order', page: 'German/Grammar/Subordinating conjunctions', furtherReading: [LINGOLIA('satzbau/nebensatz', 'Nebensatz')] },
  'reflexive-verbs': { title: 'Reflexive verbs', page: 'German/Grammar/Reflexive pronouns', furtherReading: [LINGOLIA('verben/reflexive-verben', 'Reflexive Verben')] },
  'verbs-with-prepositions': { title: 'Verbs with prepositions', furtherReading: [MDB('verben-mit-praepositionen.html', 'Verben mit Präpositionen')] },
  'da-wo-compounds': { title: 'da- and wo- compounds', furtherReading: [MDB('praepositionaladverbien.html', 'Präpositionaladverbien')] },
  'konjunktiv2-present': { title: 'Konjunktiv II', furtherReading: [LINGOLIA('verben/konjunktiv/konjunktiv-2', 'Konjunktiv II')] },
  'indefinite-pronouns': { title: 'Indefinite pronouns', page: 'German/Grammar/Pronouns', furtherReading: [LINGOLIA('pronomen/indefinitpronomen', 'Indefinitpronomen')] },
  man: { title: 'man', furtherReading: [LINGOLIA('pronomen/indefinitpronomen', 'Indefinitpronomen')] },
  'zu-infinitive-intro': { title: 'zu + infinitive', furtherReading: [LINGOLIA('satzbau/infinitivsaetze', 'Infinitivsätze')] },

  // ── B1 ──────────────────────────────────────────────────────────────────
  'praeteritum-full': { title: 'Präteritum', page: 'German/Grammar/The simple past tense', furtherReading: [LINGOLIA('zeitformen/praeteritum', 'Präteritum')] },
  plusquamperfekt: { title: 'Plusquamperfekt', furtherReading: [LINGOLIA('zeitformen/plusquamperfekt', 'Plusquamperfekt')] },
  'passive-present': { title: 'Passive: present', furtherReading: [LINGOLIA('verben/passiv', 'Passiv')] },
  'passive-praeteritum': { title: 'Passive: Präteritum', furtherReading: [LINGOLIA('verben/passiv', 'Passiv')] },
  'passive-perfekt': { title: 'Passive: Perfekt', furtherReading: [LINGOLIA('verben/passiv', 'Passiv')] },
  'passive-with-modals': { title: 'Passive with modal verbs', furtherReading: [LINGOLIA('verben/passiv', 'Passiv')] },
  'relative-clauses': { title: 'Relative clauses', furtherReading: [LINGOLIA('pronomen/relativpronomen', 'Relativpronomen')] },
  'relative-clauses-with-prepositions': { title: 'Relative clauses with prepositions', furtherReading: [LINGOLIA('pronomen/relativpronomen', 'Relativpronomen')] },
  'case-genitive': { title: 'Genitive case', page: 'German/Grammar/Possessives and the genitive case', furtherReading: [LINGOLIA('substantive/kasus', 'Kasus')] },
  'prepositions-genitive': { title: 'Genitive prepositions', furtherReading: [LINGOLIA('praepositionen', 'Präpositionen')] },
  'konjunktiv2-past': { title: 'Konjunktiv II past', furtherReading: [LINGOLIA('verben/konjunktiv/konjunktiv-2', 'Konjunktiv II')] },
  'als-ob': { title: 'als ob', furtherReading: [LINGOLIA('satzbau/nebensatz', 'Nebensatz')] },
  'subordinate-clauses-extended': { title: 'Subordinate clauses, extended', page: 'German/Grammar/Subordinating conjunctions', furtherReading: [LINGOLIA('satzbau/nebensatz', 'Nebensatz')] },
  'um-zu': { title: 'um … zu', furtherReading: [LINGOLIA('satzbau/infinitivsaetze', 'Infinitivsätze')] },
  'two-part-conjunctions': { title: 'Two-part conjunctions', page: 'German/Grammar/Coordinating conjunctions', furtherReading: [LINGOLIA('satzbau/konjunktionen', 'Konjunktionen')] },
  'n-deklination': { title: 'n-Deklination', furtherReading: [MDB('n-deklination.html', 'n-Deklination')] },
  'futur-1': { title: 'Futur I', page: 'German/Grammar/Future tense', furtherReading: [LINGOLIA('zeitformen/futur-1', 'Futur I')] },
  'infinitive-ohne-statt-zu': { title: 'ohne … zu, statt … zu', furtherReading: [LINGOLIA('satzbau/infinitivsaetze', 'Infinitivsätze')] },
  lassen: { title: 'lassen', furtherReading: [LINGOLIA('verben/lassen', 'lassen')] },
  'b1-review': { title: 'B1 review', furtherReading: [LINGOLIA('', 'Grammatik overview')] },
};
