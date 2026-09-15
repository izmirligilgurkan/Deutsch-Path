import { describe, expect, it } from 'vitest';
import { matchRoute } from '~/router/hash-router.ts';

describe('matchRoute', () => {
  it('matches a static route', () => {
    expect(matchRoute('/settings', '/settings')).toEqual({});
  });

  it('matches the root route', () => {
    expect(matchRoute('/', '/')).toEqual({});
  });

  it('captures named params', () => {
    expect(matchRoute('/unit/:id', '/unit/3')).toEqual({ id: '3' });
    expect(matchRoute('/unit/:id/test/:kind', '/unit/3/test/final')).toEqual({
      id: '3',
      kind: 'final',
    });
  });

  it('decodes percent-encoded params', () => {
    expect(matchRoute('/word/:lemma', '/word/Br%C3%BCcke')).toEqual({ lemma: 'Brücke' });
  });

  it('rejects a partial match', () => {
    expect(matchRoute('/unit/:id', '/unit')).toBeNull();
    expect(matchRoute('/unit/:id', '/unit/3/extra')).toBeNull();
    expect(matchRoute('/settings', '/course')).toBeNull();
  });

  it('captures the rest of the path with a catch-all', () => {
    expect(matchRoute('/dict/*', '/dict/a/b/c')).toEqual({ '*': 'a/b/c' });
  });
});
