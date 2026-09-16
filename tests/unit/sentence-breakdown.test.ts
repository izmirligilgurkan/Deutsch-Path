import { describe, expect, it } from 'vitest';
import { breakDownSentence, describeForm } from '~/lib/sentence-breakdown.ts';
import type { Form, Lemma } from '~/lib/content-types.ts';

const lemma = (id: string, word: string, pos: Lemma['pos'], gloss: string): Lemma =>
  ({
    id,
    lemma: word,
    pos,
    glosses: [gloss],
    forms: [],
    source: 'Wiktionary',
    sourceUrl: 'https://en.wiktionary.org/',
    license: 'CC-BY-SA-4.0',
  }) as Lemma;

const wissen = lemma('wissen|verb', 'wissen', 'verb', 'to know');
const ich = lemma('ich|pron', 'ich', 'pron', 'I');
const Antwort = lemma('Antwort|noun', 'Antwort', 'noun', 'answer');

const forms: Record<string, Form[]> = {
  'wissen|verb': [
    { form: 'wusste', tags: ['first-person', 'singular', 'preterite', 'indicative'] },
    { form: 'wusste', tags: ['third-person', 'singular', 'preterite', 'indicative'] },
    { form: 'weiß', tags: ['first-person', 'singular', 'present', 'indicative'] },
  ],
  'Antwort|noun': [{ form: 'Antworten', tags: ['nominative', 'plural'] }],
};

describe('describeForm', () => {
  it('reads wiktextract tags in an order that makes an English phrase', () => {
    expect(describeForm(['singular', 'first-person', 'present', 'indicative'])).toBe(
      '1st person singular present',
    );
  });

  it('drops indicative, which is the unmarked default', () => {
    expect(describeForm(['indicative'])).toBe('');
  });

  it('keeps the declension class on an adjective and drops it on a verb', () => {
    expect(describeForm(['strong', 'dative', 'singular'], 'adj')).toBe('strong dative singular');
    expect(describeForm(['strong', 'past', 'participle'], 'verb')).toBe('past participle');
  });
});

describe('describeForm alternations', () => {
  it('reads tags of the same kind as alternatives', () => {
    // *die* is nominative or accusative, not both at once.
    expect(describeForm(['accusative', 'feminine', 'nominative', 'singular'])).toBe(
      'nominative/accusative singular feminine',
    );
    expect(describeForm(['dative', 'masculine', 'neuter', 'singular'])).toBe(
      'dative singular masculine/neuter',
    );
  });
});

describe('breakDownSentence', () => {
  it('names the form a word is in', () => {
    const [, second] = breakDownSentence('Ich weiß es.', [ich, wissen], forms);
    expect(second?.surface).toBe('weiß');
    expect(second?.lemma?.id).toBe('wissen|verb');
    expect(second?.role).toBe('1st person singular present');
  });

  it('gives both readings of an ambiguous form rather than picking one', () => {
    // Nothing in the data says which reading this is, and guessing would teach
    // the wrong one half the time.
    const [, second] = breakDownSentence('Ich wusste es.', [ich, wissen], forms);
    expect(second?.role).toBe('1st or 3rd person singular Präteritum');
  });

  it('resolves the definite article, which has no form table of its own', () => {
    // Regression: kaikki files der/die/das as separate entries rather than one
    // paradigm, so the commonest word in German used to come out blank.
    const der = lemma('der|det', 'der', 'det', 'the');
    const article: Record<string, Form[]> = {
      'der|det': [{ form: 'das', tags: ['nominative', 'accusative', 'neuter', 'singular'] }],
    };
    const [first] = breakDownSentence('das Buch', [], article, [der]);
    expect(first?.lemma?.id).toBe('der|det');
    expect(first?.role).toBe('nominative/accusative singular neuter');
  });

  it('ignores a head-line row that names only the tense', () => {
    // *nahm* is listed as "past" as well as in the conjugation table; that
    // reading adds nothing next to "1st or 3rd person singular Präteritum".
    const nehmen = lemma('nehmen|verb', 'nehmen', 'verb', 'to take');
    const table: Record<string, Form[]> = {
      'nehmen|verb': [
        { form: 'nahm', tags: ['first-person', 'singular', 'preterite'] },
        { form: 'nahm', tags: ['third-person', 'singular', 'preterite'] },
        { form: 'nahm', tags: ['past'] },
      ],
    };
    const [, second] = breakDownSentence('Er nahm es.', [nehmen], table);
    expect(second?.role).toBe('1st or 3rd person singular Präteritum');
  });

  it('marks a word that is already its dictionary form', () => {
    const [first] = breakDownSentence('Ich weiß es.', [ich, wissen], forms);
    expect(first?.lemma?.id).toBe('ich|pron');
    expect(first?.isLemma).toBe(true);
  });

  it('leaves a word it cannot resolve blank instead of guessing', () => {
    // A proper name has no entry; inventing one would be data with no source.
    const words = breakDownSentence('Ich weiß Lemberg.', [ich, wissen], forms);
    expect(words.at(-1)?.surface).toBe('Lemberg');
    expect(words.at(-1)?.lemma).toBeUndefined();
  });

  it('falls back to the wider course for a word the sentence does not list', () => {
    const words = breakDownSentence('Antworten', [], forms, [Antwort]);
    expect(words[0]?.lemma?.id).toBe('Antwort|noun');
    expect(words[0]?.role).toBe('nominative plural');
  });

  it('prefers the sentence’s own lemmas over the wider course', () => {
    // "weiß" is also the adjective white; the sentence says which one it is.
    const weiss = lemma('weiß|adj', 'weiß', 'adj', 'white');
    const [, second] = breakDownSentence('Ich weiß es.', [ich, wissen], forms, [weiss]);
    expect(second?.lemma?.id).toBe('wissen|verb');
  });
});

describe('prepositions', () => {
  const prep = (id: string, word: string, gloss: string): Lemma =>
    lemma(id, word, 'prep', gloss);
  const der = lemma('der|det', 'der', 'det', 'the');
  const article: Record<string, Form[]> = {
    'der|det': [
      { form: 'dem', tags: ['dative', 'masculine', 'neuter', 'singular'] },
      { form: 'den', tags: ['accusative', 'masculine', 'singular'] },
      { form: 'die', tags: ['nominative', 'accusative', 'feminine', 'singular'] },
    ],
  };

  it('says which case the preposition is used with here', () => {
    const inP = prep('in|prep', 'in', 'in, inside');
    const words = breakDownSentence('Er ist in dem Haus.', [inP, der], article);
    expect(words.find((w) => w.surface === 'in')?.role).toBe('with the dative here');
  });

  it('reads the case off this sentence, not off a rule', () => {
    // *auf* is two-way, and Wiktionary calls it dative. The sentence decides.
    const auf = prep('auf|prep', 'auf', 'on, upon');
    const words = breakDownSentence('Er legt es auf den Tisch.', [auf, der], article);
    expect(words.find((w) => w.surface === 'auf')?.role).toBe('with the accusative here');
  });

  it('says nothing when the following form is ambiguous', () => {
    const fuer = prep('für|prep', 'für', 'for');
    // "die" is nominative or accusative; claiming either would be a guess.
    const words = breakDownSentence('Das ist für die Frau.', [fuer, der], article);
    expect(words.find((w) => w.surface === 'für')?.role).toBeUndefined();
  });

  it('says nothing when the following word has two cases at once', () => {
    // *den* is accusative singular masculine and also dative plural.
    const mit = prep('mit|prep', 'mit', 'with');
    const both: Record<string, Form[]> = {
      'der|det': [
        { form: 'den', tags: ['accusative', 'masculine', 'singular'] },
        { form: 'den', tags: ['dative', 'plural'] },
      ],
    };
    const words = breakDownSentence('Er spricht mit den Leuten.', [mit, der], both);
    expect(words.find((w) => w.surface === 'den')?.role).toBe(
      'accusative singular masculine or dative plural',
    );
    expect(words.find((w) => w.surface === 'mit')?.role).toBeUndefined();
  });

  it('says nothing when no case-marked word follows', () => {
    const nach = prep('nach|prep', 'nach', 'after, to');
    const words = breakDownSentence('Ich gehe nach Hause.', [nach, der], article);
    expect(words.find((w) => w.surface === 'nach')?.role).toBeUndefined();
  });
});
