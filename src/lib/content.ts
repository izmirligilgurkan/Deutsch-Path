import type { Exercise, Form, Lemma, Level, Sentence } from './content-types.ts';

/**
 * Loads the course data published alongside the app.
 *
 * Everything is fetched lazily and memoised: `core.json` (~1.4 MB) carries the
 * headwords the app needs everywhere, while inflection tables and sentences
 * load per level only when a screen actually needs them. The service worker
 * caches these, so after the first visit they come from disk and the app works
 * offline.
 */

const BASE = `${import.meta.env.BASE_URL}data/`;

const cache = new Map<string, Promise<unknown>>();

async function loadJson<T>(path: string): Promise<T> {
  const existing = cache.get(path) as Promise<T> | undefined;
  if (existing) return existing;

  const request = fetch(`${BASE}${path}`).then((res) => {
    if (!res.ok) throw new ContentError(`Could not load ${path} (${res.status})`);
    return res.json() as Promise<T>;
  });
  // A failed load must not be cached, or a flaky first request would make the
  // screen permanently broken until a reload.
  request.catch(() => cache.delete(path));
  cache.set(path, request);
  return request;
}

export class ContentError extends Error {}

export async function loadLexicon(): Promise<Lemma[]> {
  return loadJson<Lemma[]>('lexicon/core.json');
}

/** Inflection tables for one level, keyed by lemma id. */
export async function loadForms(level: Level): Promise<Record<string, Form[]>> {
  return loadJson<Record<string, Form[]>>(`lexicon/forms-${level}.json`);
}

export async function loadSentences(level: Level): Promise<Sentence[]> {
  return loadJson<Sentence[]>(`sentences/${level}.json`);
}

export async function loadExercises(unit: number): Promise<Exercise[]> {
  return loadJson<Exercise[]>(`exercises/${unit}.json`);
}

/** Grammar topics are Markdown with a YAML front-matter attribution header. */
export interface GrammarDoc {
  meta: Record<string, string>;
  body: string;
  stub: boolean;
}

export async function loadGrammar(topic: string): Promise<GrammarDoc> {
  const key = `grammar/${topic}.md`;
  const existing = cache.get(key) as Promise<GrammarDoc> | undefined;
  if (existing) return existing;

  const request = fetch(`${BASE}${key}`)
    .then(async (res) => {
      if (!res.ok) throw new ContentError(`Could not load ${topic} (${res.status})`);
      return parseFrontMatter(await res.text());
    });
  request.catch(() => cache.delete(key));
  cache.set(key, request);
  return request;
}

export function parseFrontMatter(text: string): GrammarDoc {
  const meta: Record<string, string> = {};
  let body = text;

  if (text.startsWith('---')) {
    const end = text.indexOf('\n---', 3);
    if (end !== -1) {
      for (const line of text.slice(4, end).split('\n')) {
        const colon = line.indexOf(':');
        if (colon === -1) continue;
        const key = line.slice(0, colon).trim();
        let value = line.slice(colon + 1).trim();
        // Values containing ":" or "#" were written as JSON strings.
        if (value.startsWith('"') && value.endsWith('"')) {
          try {
            value = JSON.parse(value) as string;
          } catch {
            /* keep the raw text */
          }
        }
        meta[key] = value;
      }
      body = text.slice(end + 4);
    }
  }

  return { meta, body: body.trim(), stub: meta['stub'] === 'true' };
}

let lexiconIndex: Map<string, Lemma> | null = null;

/** Lemma lookup by id, built once from the loaded lexicon. */
export async function lemmaIndex(): Promise<Map<string, Lemma>> {
  if (!lexiconIndex) {
    lexiconIndex = new Map((await loadLexicon()).map((l) => [l.id, l]));
  }
  return lexiconIndex;
}

/** Test seam. */
export function _clearContentCache(): void {
  cache.clear();
  lexiconIndex = null;
}
