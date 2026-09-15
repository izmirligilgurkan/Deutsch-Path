import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';
import { cp, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join, normalize } from 'node:path';

/**
 * GitHub Pages serves this project from https://<user>.github.io/Deutsch-Path/,
 * so every asset URL needs that prefix. Routing is hash-based (see src/router)
 * which keeps deep links working without Pages 404 rewrites.
 */
const BASE = '/Deutsch-Path/';

const DATA_SRC = fileURLToPath(new URL('./data', import.meta.url));

/**
 * Serves and ships the built course data.
 *
 * `data/` is written by the pipeline at the repo root rather than in
 * `public/`, so Vite does not pick it up on its own. This serves it in dev and
 * copies it into `dist/data/` on build — without it the deployed site would
 * load with no content at all. The service worker runtime-caches this path,
 * which is what makes the course work offline.
 */
function courseData(): Plugin {
  const prefix = `${BASE}data/`;
  return {
    name: 'deutsch-path:course-data',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? '';
        if (!url.startsWith(prefix)) return next();
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
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith(`${BASE}data/`),
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
