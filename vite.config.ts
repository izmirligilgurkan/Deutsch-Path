import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';
import { cp, readdir, stat, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join, normalize } from 'node:path';

/**
 * GitHub Pages serves this project from https://<user>.github.io/Deutsch-Path/,
 * so every asset URL needs that prefix. Routing is hash-based (see src/router)
 * which keeps deep links working without Pages 404 rewrites.
 */
const BASE = '/Deutsch-Path/';

const DATA_SRC = fileURLToPath(new URL('./data', import.meta.url));

/** Everything under the base path's data/ directory, as a self-contained literal. */
const DATA_URL_PATTERN = new RegExp(`${BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}data/`);

/**
 * Serves and ships the built course data.
 *
 * `data/` is written by the pipeline at the repo root rather than in
 * `public/`, so Vite does not pick it up on its own. This serves it in dev and
 * copies it into `dist/data/` on build — without it the deployed site would
 * load with no content at all. The service worker runtime-caches this path,
 * which is what makes the course work offline.
 */
/**
 * Every course file, so the app can fill its offline cache deliberately
 * instead of hoping the learner happens to visit each screen while online.
 *
 * Ordered by what a session needs first — the words, then what a unit drills,
 * then the form tables a breakdown wants — so an interrupted download leaves
 * the course usable rather than leaving the first alphabetical shard.
 */
const PRIORITY = ['lexicon/core.json', 'goethe-levels.json', 'exercises/', 'grammar/', 'sentences/', 'lexicon/forms-'];

async function dataManifest(): Promise<{ files: { path: string; bytes: number }[]; bytes: number }> {
  const files: { path: string; bytes: number }[] = [];
  const walk = async (dir: string, rel: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const next = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(join(dir, entry.name), next);
      // manifest.json lists the others and would be stale inside itself.
      else if (entry.isFile() && next !== 'manifest.json') {
        files.push({ path: next, bytes: (await stat(join(dir, entry.name))).size });
      }
    }
  };
  await walk(DATA_SRC, '');

  const rank = (path: string) => {
    const i = PRIORITY.findIndex((p) => path.startsWith(p));
    return i === -1 ? PRIORITY.length : i;
  };
  files.sort((a, b) => rank(a.path) - rank(b.path) || a.path.localeCompare(b.path));
  return { files, bytes: files.reduce((t, f) => t + f.bytes, 0) };
}

function courseData(): Plugin {
  const prefix = `${BASE}data/`;
  return {
    name: 'deutsch-path:course-data',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? '';
        if (!url.startsWith(prefix)) return next();
        if (url.slice(prefix.length).split('?')[0] === 'manifest.json') {
          void dataManifest().then((m) => {
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify(m));
          });
          return;
        }
        // normalize() collapses any ../ before it can escape data/.
        const rel = normalize(decodeURIComponent(url.slice(prefix.length).split('?')[0] ?? ''));
        if (rel.startsWith('..')) return next();
        const file = join(DATA_SRC, rel);
        void stat(file)
          .then((s) => {
            if (!s.isFile()) return next();
            res.setHeader(
              'content-type',
              file.endsWith('.json') ? 'application/json' : 'text/plain; charset=utf-8',
            );
            createReadStream(file).pipe(res);
          })
          .catch(() => next());
      });
    },
    async writeBundle(options) {
      const outDir = options.dir ?? fileURLToPath(new URL('./dist', import.meta.url));
      await cp(DATA_SRC, join(outDir, 'data'), { recursive: true });
      await writeFile(
        join(outDir, 'data', 'manifest.json'),
        JSON.stringify(await dataManifest(), null, 0),
      );
    },
  };
}

export default defineConfig({
  base: BASE,
  resolve: {
    alias: { '~': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  plugins: [
    preact(),
    courseData(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        id: BASE,
        name: 'Deutsch bis B1',
        short_name: 'Deutsch B1',
        description:
          'Offline German grammar and vocabulary trainer, A0 to CEFR B1. Reading, writing, drilling and testing only.',
        lang: 'en',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0f1115',
        theme_color: '#0f1115',
        categories: ['education'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Course data is versioned JSON; precache the shell, runtime-cache the data.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: `${BASE}index.html`,
        cleanupOutdatedCaches: true,
        /**
         * Without this the worker installs but does not control the page that
         * installed it, so nothing that page fetches — every byte of the
         * course — goes through the runtime cache. The app reported itself
         * ready to work offline and then had no content offline at all.
         *
         * `skipWaiting` stays off, which is what registerType 'prompt' is
         * for: a new build still waits to be accepted rather than swapping
         * out mid-drill.
         */
        clientsClaim: true,
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            /**
             * A regular expression, not a function.
             *
             * workbox serialises this config into sw.js as source text, so a
             * matcher written as `({ url }) => url.pathname.startsWith(
             * `${BASE}data/`)` reached the worker still referring to BASE —
             * a build-time constant that does not exist there. The matcher
             * threw on every request, the route never matched, and nothing
             * was ever cached: the app said it was ready to work offline and
             * then had no course data offline at all. A RegExp serialises to
             * a literal and cannot capture anything it should not.
             */
            urlPattern: DATA_URL_PATTERN,
            handler: 'CacheFirst',
            options: {
              cacheName: 'course-data',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
});
