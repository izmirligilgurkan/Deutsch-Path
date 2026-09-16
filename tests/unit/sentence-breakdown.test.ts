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
