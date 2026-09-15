import { describe, expect, it } from 'vitest';
import {
  extractGlosses,
  extractNounFacts,
  extractVerbFacts,
  isFormOnlyEntry,
  isPlainWord,
  isPointerEntry,
  isTypeableHeadword,
  trimForms,
} from '../../scripts/lib/kaikki.ts';

describe('extractNounFacts', () => {
  it('reads gender from the sense tags and plural from the head forms', () => {
    const facts = extractNounFacts({
      pos: 'noun',
      senses: [{ glosses: ['bridge'], tags: ['feminine'] }],
      forms: [
        { form: 'Brücke', tags: ['genitive'] },
        { form: 'Brücken', tags: ['plural'] },
      ],
    });
    expect(facts.gender).toBe('f');
    expect(facts.plural).toBe('Brücken');
    expect(facts.pluralOnly).toBe(false);
  });

  it('prefers a plural with no "rare"/"obsolete" qualifier', () => {
    const facts = extractNounFacts({
      pos: 'noun',
      senses: [{ glosses: ['man'], tags: ['masculine'] }],
      forms: [
        { form: 'Mannen', tags: ['plural', 'poetic', 'rare'] },
        { form: 'Männer', tags: ['plural'] },
      ],
    });
    expect(facts.plural).toBe('Männer');
  });

  it('marks pluralia tantum, which have no singular and so no gender', () => {
    const facts = extractNounFacts({
      pos: 'noun',
      senses: [{ glosses: ['parents'], tags: ['plural', 'plural-only'] }],
      forms: [],
    });
    expect(facts.pluralOnly).toBe(true);
    expect(facts.gender).toBeUndefined();
  });
});

describe('extractVerbFacts', () => {
  it('reads all four principal parts', () => {
    const facts = extractVerbFacts({
      pos: 'verb',
      senses: [{ glosses: ['to go'] }],
      forms: [
        { form: 'geht', tags: ['present', 'singular', 'third-person'] },
        { form: 'ging', tags: ['past'] },
        { form: 'gegangen', tags: ['participle', 'past'] },
        { form: 'sein', tags: ['auxiliary'] },
      ],
    });
    expect(facts).toMatchObject({
      thirdSg: 'geht',
      praeteritum: 'ging',
      partizip2: 'gegangen',
      auxiliary: 'sein',
      separable: false,
    });
  });

  it('does not mistake the Konjunktiv II for the Präteritum', () => {
    const facts = extractVerbFacts({
      pos: 'verb',
      senses: [{ glosses: ['to have'] }],
      forms: [
        { form: 'hätte', tags: ['past', 'subjunctive'] },
        { form: 'hatte', tags: ['past'] },
      ],
    });
    expect(facts.praeteritum).toBe('hatte');
  });

  it('detects a separable verb from its two-part present form', () => {
    const facts = extractVerbFacts({
      pos: 'verb',
      senses: [{ glosses: ['to get by'] }],
      forms: [{ form: 'kommt aus', tags: ['present', 'singular', 'third-person'] }],
    });
    expect(facts.separable).toBe(true);
  });
});

describe('trimForms', () => {
  it('drops periphrastic tenses, which are derivable from the principal parts', () => {
    const kept = trimForms([
      { form: 'gehe', tags: ['first-person', 'singular', 'present', 'indicative'] },
      { form: 'bin gegangen', tags: ['perfect', 'multiword-construction', 'first-person'] },
    ]);
    expect(kept.map((f) => f.form)).toEqual(['gehe']);
  });

  it("keeps a separable verb's two-word main-clause form", () => {
    const kept = trimForms([
      { form: 'komme aus', tags: ['first-person', 'singular', 'present', 'indicative'] },
    ]);
    expect(kept.map((f) => f.form)).toEqual(['komme aus']);
  });

  it('drops wiktextract\'s "..es" table abbreviations', () => {
    // Left in, these resolve to the very frequent words "es" and "en".
    const kept = trimForms([
      { form: '..es', tags: ['genitive'] },
      { form: '..en', tags: ['plural'] },
      { form: 'Zinses', tags: ['genitive'] },
    ]);
    expect(kept.map((f) => f.form)).toEqual(['Zinses']);
  });

  it('drops Konjunktiv I, which is outside the A1–B1 syllabus', () => {
    const kept = trimForms([
      { form: 'gehe', tags: ['subjunctive', 'subjunctive-i', 'first-person'] },
      { form: 'ginge', tags: ['subjunctive', 'subjunctive-ii', 'first-person'] },
    ]);
    expect(kept.map((f) => f.form)).toEqual(['ginge']);
  });
});

describe('isPointerEntry', () => {
  it('catches senses that only redirect to another word', () => {
    expect(isPointerEntry(['alternative form of wir (“we”)'])).toBe(true);
    expect(isPointerEntry(['obsolete spelling of dass'])).toBe(true);
    expect(isPointerEntry(['abbreviation of derselbe'])).toBe(true);
  });

  it('leaves real definitions alone', () => {
    expect(isPointerEntry(['bridge'])).toBe(false);
    // A real sense must not be dropped just for mentioning another word.
    expect(isPointerEntry(['to think highly of someone'])).toBe(false);
  });
});

describe('isTypeableHeadword', () => {
  it('rejects what a learner would never be asked to type', () => {
    expect(isTypeableHeadword('68er')).toBe(false);
    expect(isTypeableHeadword('ders.')).toBe(false);
    expect(isTypeableHeadword('IM')).toBe(false);
  });

  it('accepts ordinary words, umlauts included', () => {
    expect(isTypeableHeadword('Brücke')).toBe(true);
    expect(isTypeableHeadword('groß')).toBe(true);
  });
});

describe('isFormOnlyEntry / isPlainWord', () => {
  it('treats an inflection-only entry as not a lemma', () => {
    expect(isFormOnlyEntry({ senses: [{ glosses: ['plural of Haus'], tags: ['form-of'] }] })).toBe(true);
  });

  it('accepts hyphenated and apostrophed words', () => {
    expect(isPlainWord('Sauerstoff-Flasche')).toBe(true);
    expect(isPlainWord("geht's")).toBe(true);
    expect(isPlainWord('..es')).toBe(false);
  });

  it('returns glosses in Wiktionary order without duplicates', () => {
    expect(
      extractGlosses({ senses: [{ glosses: ['a'] }, { glosses: ['a'] }, { glosses: ['b'] }] }),
    ).toEqual(['a', 'b']);
  });
});
