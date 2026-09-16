import { describe, expect, it } from 'vitest';
import { markOccurrence, meetCards, principalPartsOf } from '~/lib/meet-cards.ts';
import { stageOf } from '~/lib/test-builder.ts';
import type { Lemma, Sentence } from '~/lib/content-types.ts';

const base = {
  forms: [],
  source: 'Wiktionary',
  sourceUrl: 'https://en.wiktionary.org/',
  license: 'CC-BY-SA-4.0',
};

const buch: Lemma = {
  ...base,
  id: 'Buch|noun',
  lemma: 'Buch',
  pos: 'noun',
  gender: 'n',
  plural: 'Bücher',
  glosses: ['book (a collection of sheets of paper bound together)'],
};

const gehen: Lemma = {
  ...base,
  id: 'gehen|verb',
  lemma: 'gehen',
  pos: 'verb',
  glosses: ['to go'],
  principalParts: { thirdSg: 'geht', praeteritum: 'ging', partizip2: 'gegangen', auxiliary: 'sein' },
  forms: [{ form: 'geht', tags: ['third-person', 'singular', 'present'] }],
};

const sentence = (id: number, de: string, lemmas: string[]): Sentence => ({
  id,
  de,
  en: 'translation',
  lemmas,
  author: 'someone',
  license: 'CC-BY-2.0-FR',
  tatoebaId: id,
  level: 'A1',
  source: 'Tatoeba',
  sourceUrl: `https://tatoeba.org/en/sentences/show/${id}`,
});

describe('meetCards', () => {
  it('shows a noun with the article that goes with it', () => {
    const [card] = meetCards(1, [buch], []);
    expect(card?.prompt).toBe('das Buch');
    // The meaning is the head of the sense, not the whole entry.
    expect(card?.answer).toBe('book');
  });

  it('is a presentation, so it sits at the head of the ladder', () => {
    const [card] = meetCards(1, [buch], []);
    expect(card?.type).toBe('meet');
    expect(stageOf('meet')).toBe('meet');
  });

  it('picks the shortest sentence using the word, which is the clearest', () => {
    const long = sentence(1, 'Ich habe gestern ein sehr gutes Buch gelesen.', ['Buch|noun']);
    const short = sentence(2, 'Das Buch ist gut.', ['Buch|noun']);
    const [card] = meetCards(1, [buch], [long, short]);
    expect(card?.refs.sentenceId).toBe(2);
  });

  it('leaves out the example when no sentence uses the word', () => {
    const [card] = meetCards(1, [buch], [sentence(3, 'Er geht.', ['gehen|verb'])]);
    expect(card?.refs.sentenceId).toBeUndefined();
  });

  it('is stable: the same unit builds the same cards', () => {
    const once = meetCards(1, [buch, gehen], []);
    const twice = meetCards(1, [buch, gehen], []);
    expect(once.map((c) => c.id)).toEqual(twice.map((c) => c.id));
  });
});

describe('principalPartsOf', () => {
  it('gives a verb its four parts', () => {
    expect(principalPartsOf(gehen)).toBe('geht · ging · sein gegangen');
  });

  it('gives a noun its plural', () => {
    expect(principalPartsOf(buch)).toBe('plural: die Bücher');
  });

  it('says nothing when Wiktionary does not', () => {
    expect(principalPartsOf({ ...buch, plural: undefined })).toBe('');
  });
});

describe('markOccurrence', () => {
  it('finds the word in its example, in the form the sentence uses', () => {
    expect(markOccurrence('Er geht nach Hause.', gehen, ['geht'])).toEqual([
      'Er ',
      'geht',
      ' nach Hause.',
    ]);
  });

  it('matches across capitalisation, since a sentence capitalises its first word', () => {
    expect(markOccurrence('Buch lesen.', buch, [])).toEqual(['', 'Buch', ' lesen.']);
  });

  it('marks nothing rather than the wrong word', () => {
    expect(markOccurrence('Er kommt nach Hause.', gehen, ['geht'])).toBeNull();
  });
});
