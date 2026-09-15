/**
 * Renders public/icons/*.png from an inline SVG using the Chromium that
 * Playwright already provides. Dev utility — run it when the icon changes:
 *
 *   node scripts/make-icons.mjs
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../public/icons/', import.meta.url));

/** `inset` keeps the glyph inside the maskable safe zone (centre 80%). */
function svg(size, { maskable }) {
  const radius = maskable ? 0 : size * 0.19;
  const fontSize = size * (maskable ? 0.4 : 0.52);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" rx="${radius}" fill="#0f1115"/>
    <text x="50%" y="50%" dy="0.35em" text-anchor="middle"
          font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
          font-size="${fontSize}" font-weight="700" fill="#6d9bff">B1</text>
  </svg>`;
}

const TARGETS = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'icon-512-maskable.png', size: 512, maskable: true },
];

await mkdir(OUT, { recursive: true });
// The sandbox image ships a pinned Chromium that may not match the build id
// this Playwright release expects; PW_CHROMIUM_PATH lets CI point at it.
const executablePath = process.env.PW_CHROMIUM_PATH;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
try {
  for (const { file, size, maskable } of TARGETS) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(
      `<body style="margin:0">${svg(size, { maskable })}</body>`,
      { waitUntil: 'load' },
    );
    await page.screenshot({ path: OUT + file, omitBackground: false });
    await page.close();
    console.log('wrote', file);
  }
} finally {
  await browser.close();
}
