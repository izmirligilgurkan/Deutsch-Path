import { defineConfig, devices } from '@playwright/test';

/**
 * One smoke test at a phone viewport (spec §6). Runs against `vite preview`,
 * which serves the built app under the real GitHub Pages base path.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'list' : 'html',
  use: {
    baseURL: 'http://localhost:4173/Deutsch-Path/',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'mobile-chromium',
      use: {
        ...devices['Pixel 7'],
        // Sandboxes that ship a pinned Chromium can point at it instead of
        // downloading one; CI installs the matching build and leaves this unset.
        ...(process.env.PW_CHROMIUM_PATH
          ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } }
          : {}),
      },
    },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173/Deutsch-Path/',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
