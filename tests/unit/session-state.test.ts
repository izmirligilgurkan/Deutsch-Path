import { describe, expect, it } from 'vitest';
import { resumeFrom, sessionKey } from '~/db/session-state.ts';
import type { Exercise } from '~/lib/content-types.ts';
import type { SessionState } from '~/db/types.ts';

const item = (id: string): Exercise =>
  ({
    id,
    unit: 1,
    topic: 't',
    type: 'mc-de-en',
    prompt: id,
    answer: 'a',
    refs: {},
    generator: 'g',
  }) as Exercise;

const items = [item('a'), item('b'), item('c'), item('d')];

const saved = (over: Partial<SessionState> = {}): SessionState => ({
  key: 'drill:1',
  itemIds: ['a', 'b', 'c', 'd'],
  index: 2,
  correct: 2,
  wrong: [],
  startedAt: 1,
  updatedAt: 2,
  ...over,
});

describe('sessionKey', () => {
  it('is one place per unit', () => {
    expect(sessionKey(3)).toBe('drill:3');
    expect(sessionKey(3)).not.toBe(sessionKey(4));
  });
});

describe('resumeFrom', () => {
  it('picks the session up at the next unanswered item', () => {
    expect(resumeFrom(saved(), items)).toEqual({ index: 2, correct: 2, wrong: [] });
  });

  it('keeps the wrong answers, so a resumed session still reports them', () => {
    const state = saved({ wrong: [{ id: 'a', given: 'nope' }] });
    expect(resumeFrom(state, items)?.wrong).toEqual([{ id: 'a', given: 'nope' }]);
  });

  it('has nothing to restore when the session never got going', () => {
    expect(resumeFrom(saved({ index: 0 }), items)).toBeNull();
    expect(resumeFrom(undefined, items)).toBeNull();
  });

  it('starts fresh when the course data was rebuilt under it', () => {
    // Different items entirely: resuming at index 2 would drop the learner in
    // the middle of a session they never started.
    expect(resumeFrom(saved({ itemIds: ['w', 'x', 'y', 'z'] }), items)).toBeNull();
    // Same ids, different order — the ladder was regenerated.
    expect(resumeFrom(saved({ itemIds: ['b', 'a', 'c', 'd'] }), items)).toBeNull();
    // Same start, but the unit grew or shrank.
    expect(resumeFrom(saved({ itemIds: ['a', 'b', 'c'] }), items)).toBeNull();
  });

  it('does not resume past the end', () => {
    expect(resumeFrom(saved({ index: 4 }), items)).toBeNull();
    expect(resumeFrom(saved({ index: 9 }), items)).toBeNull();
  });
});
