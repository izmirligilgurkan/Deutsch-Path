/**
 * Filling the offline cache on purpose.
 *
 * The service worker caches a course file the first time it is fetched, which
 * means a learner who installs the app and gets on a plane has whatever they
 * happened to open and nothing else. "It works offline" has to mean the whole
 * course, so the app downloads it deliberately: the manifest lists every file,
 * ordered so that an interrupted download leaves a usable course rather than
 * half of one shard.
 *
 * Every request goes through the same CacheFirst route the app uses, so a file
 * already cached costs nothing and this is safe to run on every start.
 */

export interface OfflineProgress {
  /** Files already in the cache, including ones just fetched. */
  done: number;
  total: number;
  /** Bytes of the files that are in the cache. */
  bytes: number;
  totalBytes: number;
  /** Set when the download stopped early — usually because the network went. */
  failed?: boolean;
}

interface Manifest {
  files: { path: string; bytes: number }[];
  bytes: number;
}

/** Four at a time: enough to use the connection, few enough to stay polite. */
const CONCURRENCY = 4;

const CACHE_NAME = 'course-data';

function dataUrl(path: string): string {
  return new URL(`data/${path}`, document.baseURI).href;
}

/** The cache the service worker's data route writes to, when there is one. */
async function courseCache(): Promise<Cache | null> {
  if (!('caches' in globalThis)) return null;
  try {
    return await caches.open(CACHE_NAME);
  } catch {
    // Private browsing and a few embedded webviews refuse the Cache API.
    return null;
  }
}

export async function warmOfflineCache(
  onProgress?: (p: OfflineProgress) => void,
  signal?: AbortSignal,
): Promise<OfflineProgress> {
  const manifest = (await (await fetch(dataUrl('manifest.json'))).json()) as Manifest;
  const cache = await courseCache();

  const state: OfflineProgress = {
    done: 0,
    total: manifest.files.length,
    bytes: 0,
    totalBytes: manifest.bytes,
  };

  // Anything already cached counts immediately, so a second run reports the
  // real state rather than starting from zero.
  const pending: { path: string; bytes: number }[] = [];
  for (const file of manifest.files) {
    if (cache && (await cache.match(dataUrl(file.path)))) {
      state.done += 1;
      state.bytes += file.bytes;
    } else {
      pending.push(file);
    }
  }
  onProgress?.({ ...state });
  if (pending.length === 0) return state;

  let next = 0;
  let failed = false;
  const worker = async (): Promise<void> => {
    while (next < pending.length && !failed) {
      if (signal?.aborted) return;
      const file = pending[next++]!;
      try {
        // No-store would defeat the point; the service worker's route is what
        // puts this in the cache.
        const res = await fetch(dataUrl(file.path), signal ? { signal } : {});
        if (!res.ok) throw new Error(String(res.status));
        // The body has to be read for the cache entry to complete.
        await res.arrayBuffer();
        state.done += 1;
        state.bytes += file.bytes;
        onProgress?.({ ...state });
      } catch {
        // One failure means the network went; stop rather than hammering it.
        failed = true;
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker));
  const final: OfflineProgress = { ...state, ...(failed ? { failed: true } : {}) };
  onProgress?.(final);
  return final;
}

/** What is cached right now, without fetching anything. */
export async function offlineState(): Promise<OfflineProgress> {
  const manifest = (await (await fetch(dataUrl('manifest.json'))).json()) as Manifest;
  const cache = await courseCache();
  const state: OfflineProgress = {
    done: 0,
    total: manifest.files.length,
    bytes: 0,
    totalBytes: manifest.bytes,
  };
  if (!cache) return state;
  for (const file of manifest.files) {
    if (await cache.match(dataUrl(file.path))) {
      state.done += 1;
      state.bytes += file.bytes;
    }
  }
  return state;
}

export function formatMB(bytes: number): string {
  return `${(bytes / 1048576).toFixed(1)} MB`;
}
