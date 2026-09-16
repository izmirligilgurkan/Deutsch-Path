import { describe, expect, it } from 'vitest';
import type { Lemma, Sentence } from '~/lib/content-types.ts';
import {
  genArticleCase,
  genCloze,
  genErrorSpotting,
  genWordOrder,
  withArticle,
  type GenContext,
} from '../../scripts/lib/generators.ts';
import { mulberry32, seedFrom, shuffled } from '../../scripts/lib/random.ts';

const prov = {
  source: 'Wiktionary (English) via kaikki.org',
  sourceUrl: 'https://en.wiktionary.org/wiki/Test#German',
  license: 'CC-BY-SA-4.0',
};

const bruecke: Lemma = {
  id: 'Brücke|noun', lemma: 'Brücke', pos: 'noun', gender: 'f', plural: 'Brücken',
  forms: [{ form: 'Brücke', tags: ['nominative', 'singular'] }], glosses: ['bridge'],
  level: 'A1', ...prov,
};
const mann: Lemma = {
  id: 'Mann|noun', lemma: 'Mann', pos: 'noun', gender: 'm', plural: 'Männer',
  forms: [{ form: 'Mann', tags: ['nominative', 'singular'] }], glosses: ['man'],
  level: 'A1', ...prov,
};
const buch: Lemma = {
  id: 'Buch|noun', lemma: 'Buch', pos: 'noun', gender: 'n', plural: 'Bücher',
  forms: [{ form: 'Buch', tags: ['nominative', 'singular'] }], glosses: ['book'],
  level: 'A1', ...prov,
};

function sentence(id: number, de: string, lemmas: string[]): Sentence {
  return {
    id, de, en: 'translation', lemmas, author: 'someone', license: 'CC-BY-2.0-FR',
    tatoebaId: id, level: 'A1', source: 'Tatoeba',
    sourceUrl: `https://tatoeba.org/en/sentences/show/${id}`,
  };
}

function context(
  sentences: Sentence[],
  lemmas = [bruecke, mann, buch],
  taught = new Set(lemmas.map((l) => l.id)),
): GenContext {
  return { unit: 1, topic: 'case-accusative', lemmas, pool: lemmas, sentences, taught };
}

describe('withArticle', () => {
  it('attaches the article Wiktionary\'s gender implies', () => {
    expect(withArticle(mann)).toBe('der Mann');
    expect(withArticle(bruecke)).toBe('die Brücke');
    expect(withArticle(buch)).toBe('das Buch');
  });

  it('leaves non-nouns alone', () => {
    expect(withArticle({ ...mann, pos: 'verb', id: 'x|verb' })).toBe('Mann');
  });
});

describe('genCloze', () => {
  it('blanks a word that is present verbatim in the source sentence', () => {
    const s = sentence(1, 'Ich sehe den Mann dort.', ['Mann|noun']);
    const [ex] = genCloze(context([s]));
    expect(ex).toBeDefined();
    // The invariant validate-data.ts enforces across the whole corpus.
    expect(s.de).toContain(ex!.answer as string);
    expect(ex!.prompt).toContain('____');
    expect(ex!.refs.sentenceId).toBe(1);
    expect(ex!.generator).toBeTruthy();
  });

  it('restores the original sentence when the blank is filled back in', () => {
    const s = sentence(2, 'Die Brücke ist alt.', ['Brücke|noun']);
    const [ex] = genCloze(context([s]));
    expect(ex!.prompt.replace('____', ex!.answer as string)).toBe(s.de);
  });
});

describe('genWordOrder', () => {
  it('scrambles into a permutation of the original tokens', () => {
    const s = sentence(3, 'Ich gebe dem Mann das Buch.', ['Mann|noun']);
    const [ex] = genWordOrder(context([s]));
    expect(ex).toBeDefined();
    const answer = ex!.answer as string[];
    expect([...answer].sort()).toEqual([...ex!.prompt.split(' ')].sort());
    expect(answer.join(' ')).not.toBe(ex!.prompt);
  });

  it('is deterministic, so a rebuild produces an identical file', () => {
    const s = sentence(4, 'Ich gebe dem Mann das Buch.', ['Mann|noun']);
    expect(genWordOrder(context([s]))[0]!.prompt).toBe(genWordOrder(context([s]))[0]!.prompt);
  });
});

describe('genArticleCase', () => {
  it('takes the answer from the sentence rather than computing one', () => {
    const s = sentence(5, 'Ich sehe den Mann.', ['Mann|noun']);
    const [ex] = genArticleCase(context([s]));
    expect(ex!.answer).toBe('den');
    expect(ex!.prompt).toBe('Ich sehe ____ Mann.');
  });

  it('skips an article after a two-way preposition, where both cases are right', () => {
    // "in dem Haus" and "in das Haus" are both grammatical, so blanking here
    // would have more than one correct answer.
    const s = sentence(6, 'Ich gehe in dem Haus.', ['Mann|noun']);
    expect(genArticleCase(context([s]))).toHaveLength(0);
  });
});

describe('genErrorSpotting', () => {
  it('introduces exactly one article change and names the rule', () => {
    const s = sentence(7, 'Ich sehe den Mann.', ['Mann|noun']);
    const [ex] = genErrorSpotting(context([s]));
    expect(ex).toBeDefined();
    expect(ex!.prompt).not.toBe(s.de);
    expect(ex!.answer).toBe('den');
    // The spec allows generated errors only from a documented rule, logged.
    expect(ex!.generator).toBe('error-spotting-rule:article-case-swap');
  });

  it('leaves two-way prepositions alone, where a swap may still be correct', () => {
    const s = sentence(8, 'Er ist in dem Haus.', ['Mann|noun']);
    expect(genErrorSpotting(context([s]))).toHaveLength(0);
  });
});

describe('seeded shuffle', () => {
  it('gives the same order for the same seed', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    const a = shuffled(items, mulberry32(seedFrom('x')));
    const b = shuffled(items, mulberry32(seedFrom('x')));
    expect(a).toEqual(b);
    expect([...a].sort()).toEqual(items);
  });
});

describe('sentence choice', () => {
  it('prefers the sentence a learner can already read', () => {
    // Every word of both is "level-appropriate"; only one is readable in a
    // unit that has taught three words.
    const easy = sentence(2, 'Der Mann liest das Buch.', ['Mann|noun', 'Buch|noun']);
    const hard = sentence(1, 'Was bringt das dem Mann?', ['Mann|noun', 'bringen|verb', 'was|pron']);
    const [first] = genCloze(context([hard, easy]), 1);
    expect(first?.refs.sentenceId).toBe(2);
  });

  it('falls back to a sentence with unknown words rather than none', () => {
    const only = sentence(7, 'Der Mann bringt es.', ['Mann|noun', 'bringen|verb']);
    expect(genCloze(context([only]), 1)).toHaveLength(1);
  });
});
