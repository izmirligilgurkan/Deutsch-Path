import { describe, expect, it } from 'vitest';
import {
  buildDailyTest,
  buildLevelTest,
  ladderOrder,
  placementResult,
  sample,
  unitsForLevel,
  unitsUpToLevel,
  stageOf,
  TEST_LENGTHS,
} from '~/lib/test-builder.ts';
import type { Exercise } from '~/lib/content-types.ts';
import type { Mistake } from '~/db/types.ts';

function ex(id: string, topic: string, unit = 1): Exercise {
  return {
    id, unit, topic, type: 'mc-de-en', prompt: `p${id}`, answer: `a${id}`,
    refs: {}, generator: 'test',
  };
}

function mistake(topic: string, ts: number): Mistake {
  return {
    ts, topic, unit: 1, exerciseId: 'x', exerciseType: 'mc-de-en',
    given: 'w', expected: 'r', mode: 'practice',
  };
}

const pool = [
  ...Array.from({ length: 20 }, (_, i) => ex(`case${i}`, 'case-dative')),
  ...Array.from({ length: 20 }, (_, i) => ex(`plural${i}`, 'plural-patterns')),
  ...Array.from({ length: 20 }, (_, i) => ex(`other${i}`, 'imperative')),
];

describe('sample', () => {
  it('is deterministic for a seed, so a reload does not reshuffle a test', () => {
    expect(sample(pool, 10, 's').map((e) => e.id)).toEqual(sample(pool, 10, 's').map((e) => e.id));
  });

  it('differs between seeds', () => {
    expect(sample(pool, 10, 'a').map((e) => e.id)).not.toEqual(sample(pool, 10, 'b').map((e) => e.id));
  });

  it('never returns more than the pool holds', () => {
    expect(sample(pool.slice(0, 3), 10, 's')).toHaveLength(3);
  });
});

describe('buildDailyTest', () => {
  it('returns the requested number of items', () => {
    expect(buildDailyTest(pool, [], 'd')).toHaveLength(TEST_LENGTHS.daily);
  });

  it('leans on topics the learner recently got wrong', () => {
    const mistakes = Array.from({ length: 10 }, (_, i) => mistake('case-dative', 1000 + i));
    const items = buildDailyTest(pool, mistakes, 'd');
    const weak = items.filter((e) => e.topic === 'case-dative').length;
    // Weighted, not exclusive: most of the test, but not all of it.
    expect(weak).toBeGreaterThan(TEST_LENGTHS.daily / 2);
    expect(weak).toBeLessThan(TEST_LENGTHS.daily);
  });

  it('never repeats an item', () => {
    const items = buildDailyTest(pool, [mistake('case-dative', 1)], 'd');
    expect(new Set(items.map((e) => e.id)).size).toBe(items.length);
  });

  it('prefers the most recent mistakes when topics compete', () => {
    const mistakes = [
      ...Array.from({ length: 10 }, (_, i) => mistake('plural-patterns', 1 + i)),
      ...Array.from({ length: 10 }, (_, i) => mistake('case-dative', 9000 + i)),
    ];
    const items = buildDailyTest(pool, mistakes, 'd');
    const dative = items.filter((e) => e.topic === 'case-dative').length;
    const plural = items.filter((e) => e.topic === 'plural-patterns').length;
    expect(dative).toBeGreaterThan(plural);
  });

  it('copes with an empty pool and with a pool smaller than the test', () => {
    expect(buildDailyTest([], [], 'd')).toEqual([]);
    expect(buildDailyTest(pool.slice(0, 4), [], 'd')).toHaveLength(4);
  });

  it('works before the learner has made any mistakes', () => {
    expect(buildDailyTest(pool, [], 'd')).toHaveLength(TEST_LENGTHS.daily);
  });
});

describe('buildLevelTest', () => {
  const byUnit = new Map(
    unitsForLevel('A1').map((u) => [u, Array.from({ length: 30 }, (_, i) => ex(`u${u}i${i}`, 't', u))]),
  );

  it('spreads across the level rather than over-weighting one unit', () => {
    const items = buildLevelTest(byUnit, 'A1', 'L');
    expect(items).toHaveLength(TEST_LENGTHS.level);
    // A1 has 12 units; every one should be represented.
    expect(new Set(items.map((e) => e.unit)).size).toBe(unitsForLevel('A1').length);
  });

  it('skips units with no exercises instead of short-changing the test', () => {
    const sparse = new Map([[1, Array.from({ length: 80 }, (_, i) => ex(`s${i}`, 't', 1))]]);
    const items = buildLevelTest(sparse, 'A1', 'L');
    expect(items).toHaveLength(TEST_LENGTHS.level);
  });

  it('returns nothing when the level has no content at all', () => {
    expect(buildLevelTest(new Map(), 'B1', 'L')).toEqual([]);
  });
});

describe('placementResult', () => {
  it('places at the highest level passed in sequence', () => {
    expect(placementResult([{ level: 'A1', score: 0.9 }, { level: 'A2', score: 0.8 }])).toBe('A2');
  });

  it('stops at the first failed round', () => {
    expect(
      placementResult([{ level: 'A1', score: 0.9 }, { level: 'A2', score: 0.3 }, { level: 'B1', score: 1 }]),
    ).toBe('A1');
  });

  it('places nobody when the first round fails', () => {
    expect(placementResult([{ level: 'A1', score: 0.2 }])).toBeNull();
  });
});

describe('unitsUpToLevel', () => {
  it('unlocks every unit at or below the placed level', () => {
    expect(unitsUpToLevel('A1')).toEqual(unitsForLevel('A1'));
    const a2 = unitsUpToLevel('A2');
    expect(a2).toContain(1);
    expect(a2).toContain(Math.max(...unitsForLevel('A2')));
    expect(a2).not.toContain(Math.max(...unitsForLevel('B1')));
  });
});

describe('ladderOrder', () => {
  const item = (id: string, type: Exercise['type'], word?: string): Exercise =>
    ({
      id,
      unit: 1,
      topic: 't',
      type,
      prompt: id,
      answer: 'a',
      refs: word ? { lemmaIds: [word] } : {},
      generator: 'g',
    }) as Exercise;

  /** Two words, each with a card at every stage, plus a wordless sentence item. */
  const pool = [
    item('type-haus', 'type-en-de', 'Haus|noun'),
    item('mc-haus', 'mc-de-en', 'Haus|noun'),
    item('cloze-haus', 'cloze', 'Haus|noun'),
    item('type-gehen', 'type-en-de', 'gehen|verb'),
    item('mc-gehen', 'mc-de-en', 'gehen|verb'),
    item('conj-gehen', 'conjugation-table', 'gehen|verb'),
    item('order1', 'word-order'),
  ];

  const stages = ['recognise', 'complete', 'produce'];

  it('never asks a learner to produce a word before they have recognised it', () => {
    // Regression: a drill dealt the unit at random, so "write this in German"
    // could be the first thing after the explanation.
    const order = ladderOrder(pool, 'drill:1');
    for (const word of ['Haus|noun', 'gehen|verb']) {
      const positions = order
        .map((e, i) => ({ i, word: e.refs.lemmaIds?.[0], stage: stageOf(e.type) }))
        .filter((x) => x.word === word);
      const recognise = positions.find((x) => x.stage === 'recognise')!.i;
      const produce = positions.find((x) => x.stage === 'produce')!.i;
      expect(recognise).toBeLessThan(produce);
    }
  });

  it('runs each stage in turn inside a cycle', () => {
    const order = ladderOrder(pool, 'drill:1').map((e) => stages.indexOf(stageOf(e.type)));
    // Two words fit one cycle, so this pool is a single ladder pass.
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i]).toBeGreaterThanOrEqual(order[i - 1]!);
    }
  });

  it('cycles rather than running one long block of each stage', () => {
    // Thirty-five multiple-choice cards before anything else is not a lesson.
    const many = Array.from({ length: 12 }, (_, w) => [
      item(`mc${w}`, 'mc-de-en', `w${w}`),
      item(`type${w}`, 'type-en-de', `w${w}`),
    ]).flat();
    const order = ladderOrder(many, 'drill:1').map((e) => stageOf(e.type));
    // 12 words at 5 per cycle is three cycles, so production comes round more
    // than once.
    const returns = order.filter((s, i) => i > 0 && s === 'recognise' && order[i - 1] === 'produce');
    expect(returns.length).toBeGreaterThan(0);
  });

  it('keeps every item', () => {
    const ids = ladderOrder(pool, 'drill:1').map((e) => e.id).sort();
    expect(ids).toEqual(pool.map((e) => e.id).sort());
  });

  it('is the same every time for the same unit', () => {
    expect(ladderOrder(pool, 'drill:1').map((e) => e.id)).toEqual(
      ladderOrder(pool, 'drill:1').map((e) => e.id),
    );
  });
});
