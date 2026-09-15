import { expect, test } from '@playwright/test';

/** One mobile smoke test (spec §6): the shell loads and routing works. */
test('loads and navigates at a phone viewport', async ({ page }) => {
  await page.goto('./');

  await expect(page.getByRole('heading', { name: 'Deutsch bis B1' })).toBeVisible();

  // Bottom tab bar is the primary navigation.
  const nav = page.getByRole('navigation', { name: 'Primary' });
  await expect(nav).toBeVisible();

  await nav.getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/#\/settings$/);
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

  // Attributions must be reachable — every piece of German needs its source.
  await page.getByRole('link', { name: 'Attributions' }).click();
  await expect(page).toHaveURL(/#\/attributions$/);
  await expect(page.getByRole('heading', { name: 'Tatoeba Project' })).toBeVisible();

  // Hash deep links survive a hard reload, which is the point of hash routing.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Attributions' })).toBeVisible();

  // Unknown routes render the 404 screen rather than a blank page.
  await page.goto('./#/no-such-route');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});
