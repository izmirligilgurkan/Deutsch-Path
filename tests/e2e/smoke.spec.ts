import { expect, test } from '@playwright/test';

/**
 * Mobile smoke test (spec §6): a learner can start from nothing and answer a
 * question, which is the path that must never break.
 */
test('a new learner can start the course and answer a drill', async ({ page }) => {
  await page.goto('./');

  await expect(page.getByRole('heading', { name: 'Deutsch bis B1' })).toBeVisible();

  // Onboarding: one tap to a usable course.
  await page.getByRole('link', { name: /get started/i }).click();
  await page.getByRole('button', { name: /start from zero/i }).click();

  // Home now shows the dashboard rather than the onboarding prompt.
  await expect(page.getByRole('link', { name: /continue unit/i })).toBeVisible({ timeout: 15_000 });

  // The course locks everything past unit 1.
  await page.goto('./#/course');
  await expect(page.locator('.unit-row').first()).toBeVisible();
  expect(await page.locator('.unit-row').count()).toBe(35);
  expect(await page.locator('.unit-row[aria-disabled="true"]').count()).toBe(34);

  // Unit 1 renders its sourced explanation, with attribution.
  await page.goto('./#/unit/1');
  await expect(page.getByRole('heading', { name: 'Alphabet, pronouns, sein' })).toBeVisible();
  await expect(page.locator('.attribution').first()).toContainText('CC-BY-SA');

  // A drill item accepts an answer and moves on.
  await page.goto('./#/unit/1/drill');
  await expect(page.locator('.prompt-text')).toBeVisible({ timeout: 15_000 });

  const choices = page.locator('button.choice, .gender-row button');
  if (await choices.count() > 0) {
    await choices.first().click();
  } else {
    await page.locator('input[type=text]').first().fill('test');
    await page.getByRole('button', { name: 'Check' }).click();
  }
  // Answering must produce a verdict and a way forward.
  await expect(page.locator('.verdict')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('.session-bar')).toContainText('2/');
});

test('typing is not interrupted, and the umlaut keys insert', async ({ page }) => {
  await page.goto('./#/onboarding');
  await page.getByRole('button', { name: /start from zero/i }).click();
  // Onboarding redirects home when the cards are built; navigating before that
  // races the setup.
  await expect(page.getByRole('link', { name: /continue unit/i })).toBeVisible({ timeout: 15_000 });
  await page.goto('./#/unit/1/drill');
  await expect(page.locator('.prompt-text')).toBeVisible({ timeout: 15_000 });

  // Find a typed item rather than a multiple-choice one.
  for (let i = 0; i < 8; i++) {
    if (await page.locator('input[type=text]').count() > 0) break;
    await page.locator('button.choice, .gender-row button').first().click();
    await page.getByRole('button', { name: 'Continue' }).click();
  }

  const input = page.locator('input[type=text]').first();
  await expect(input).toBeVisible();

  // Regression: the question object was rebuilt on every render, so a reset
  // effect cleared the field on each keystroke.
  await input.fill('Haus');
  await expect(input).toHaveValue('Haus');

  await page.getByRole('button', { name: 'ä', exact: true }).click();
  await expect(input).toHaveValue('Hausä');
});

test('deep links and the attributions page survive a reload', async ({ page }) => {
  await page.goto('./#/attributions');
  await expect(page.getByRole('heading', { name: 'Tatoeba Project' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Attributions' })).toBeVisible();

  await page.goto('./#/no-such-route');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});
