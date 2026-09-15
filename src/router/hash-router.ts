/**
 * Minimal hash router.
 *
 * GitHub Pages has no rewrite rules, so a history-API route like
 * /Deutsch-Path/unit/3 404s on a hard refresh. Hash routes (#/unit/3) are
 * never sent to the server, so deep links and offline reloads both work.
 *
 * Patterns use `:param` segments and an optional trailing `*` catch-all.
 */

export type RouteParams = Record<string, string>;

export interface RouteMatch {
  path: string;
  params: RouteParams;
}

/** Reads the current hash as a clean path, e.g. `#/unit/3?x=1` -> `/unit/3`. */
export function currentPath(): string {
  const raw = window.location.hash.replace(/^#/, '');
  const path = raw.split('?')[0] ?? '';
  if (path === '' || path === '/') return '/';
  return path.startsWith('/') ? path : `/${path}`;
}

/** Query params of the current hash, e.g. `#/search?q=Haus` -> `{ q: 'Haus' }`. */
export function currentQuery(): URLSearchParams {
  const raw = window.location.hash.replace(/^#/, '');
  const qs = raw.indexOf('?');
  return new URLSearchParams(qs === -1 ? '' : raw.slice(qs + 1));
}

export function navigate(path: string, replace = false): void {
  const target = `#${path.startsWith('/') ? path : `/${path}`}`;
  if (replace) {
    window.history.replaceState(null, '', target);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = target;
  }
}

/**
 * Matches `path` against `pattern`, returning captured params or null.
 * `/unit/:id` matches `/unit/3` -> `{ id: '3' }`.
 * `/dict/*` matches `/dict/a/b` -> `{ '*': 'a/b' }`.
 */
export function matchRoute(pattern: string, path: string): RouteParams | null {
  const pat = splitSegments(pattern);
  const seg = splitSegments(path);
  const params: RouteParams = {};

  for (let i = 0; i < pat.length; i++) {
    const p = pat[i]!;
    if (p === '*') {
      params['*'] = seg.slice(i).join('/');
      return params;
    }
    const s = seg[i];
    if (s === undefined) return null;
    if (p.startsWith(':')) {
      params[p.slice(1)] = decodeURIComponent(s);
    } else if (p !== s) {
      return null;
    }
  }
  return pat.length === seg.length ? params : null;
}

function splitSegments(path: string): string[] {
  return path.split('/').filter((s) => s.length > 0);
}
