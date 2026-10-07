import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('home shows solo play and a primary action within reach', async ({ page }) => {
  await expect(page.getByRole('heading', { name: "Let's Ship It" })).toBeVisible();
  const play = page.getByRole('button', { name: 'Play solo' });
  await expect(play).toBeVisible();
  const box = (await play.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(48);
});

test('a booth run starts Stage 1, resumes after reload, and later stages reach the finale', async ({ page }) => {
  await page.getByRole('button', { name: 'Play solo' }).click();
  await page.getByRole('button', { name: /Booth run/ }).click();
  await expect(page.getByTestId('stage-heading')).toHaveText('Prologue');
  await page.getByRole('button', { name: 'Finish level' }).click(); // → Stage 1 briefing
  await page.getByRole('button', { name: 'Start sorting' }).click();
  await expect(page.getByRole('heading', { name: 'Tutorial', level: 1 })).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: 'Resume run' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'in progress' })).toContainText('Data');

  // Stages 3–4 are still placeholders: booth S3 4 + S4 3 = 7 taps to the finale.
  await page.goto('/?debug=1&stage=3');
  const finish = page.getByRole('button', { name: 'Finish level' });
  for (let i = 0; i < 7; i++) await finish.click();
  await expect(page.getByRole('heading', { name: 'Finale' })).toBeVisible();
});

test('full mode via facilitator param starts a full run', async ({ page }) => {
  await page.goto('/?mode=full&debug=1');
  await page.getByRole('button', { name: 'Play solo' }).click();
  await page.getByText('Debug').click();
  await expect(page.locator('.debug-panel')).toContainText('mode full');
});

test('debug params jump straight to a stage', async ({ page }) => {
  await page.goto('/?debug=1&stage=3');
  await expect(page.getByTestId('stage-heading')).toContainText('Build the Logic');
  await page.getByText('Debug').click();
  await page.getByRole('button', { name: '4', exact: true }).click();
  await expect(page.getByTestId('stage-heading')).toContainText('Keep It Alive');
});

test('settings: dark theme toggles and persists', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Dark').check();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('no horizontal scroll at 360px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

test('at 200% text the strip and settings button stay on screen', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/?debug=1&stage=2');
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  const gear = (await page.getByRole('button', { name: 'Settings' }).boundingBox())!;
  expect(gear.x + gear.width).toBeLessThanOrEqual(360);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

test('focus moves to the new heading after finishing a level', async ({ page }) => {
  await page.getByRole('button', { name: 'Play solo' }).click();
  await page.getByRole('button', { name: /Booth run/ }).click();
  await page.getByRole('button', { name: 'Finish level' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  await expect(page).toHaveTitle(/· Let's Ship It$/);
});
