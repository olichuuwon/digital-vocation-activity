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

test('a solo run starts Stage 1, resumes after reload, and later stages reach the finale', async ({ page }) => {
  await page.getByRole('button', { name: 'Play solo' }).click();
  await expect(page.getByTestId('prologue-heading')).toContainText('Mission: flood relief');
  await page.getByRole('button', { name: 'Start the mission' }).click(); // → Stage 1 briefing
  await page.getByRole('button', { name: 'Start sorting' }).click();
  // The tutorial starts straight away: first card and the people counter.
  await expect(page.getByTestId('people-reached')).toContainText('0 people reached');

  await page.reload();
  await page.getByRole('button', { name: 'Resume run' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'in progress' })).toContainText('Data');

  // Every stage is playable now; the finale placeholder is reachable via debug.
  await page.goto('/?debug=1&stage=5');
  await expect(page.getByRole('heading', { name: 'Mission live' })).toBeVisible();
});

test('debug params jump straight to a stage', async ({ page }) => {
  await page.goto('/?debug=1&stage=4');
  await expect(page.getByRole('heading', { name: 'Keep it alive' })).toBeVisible();
  await page.getByText('Debug').click();
  await page.getByRole('button', { name: '3', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Build the logic' })).toBeVisible();
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
  await page.getByRole('button', { name: 'Start the mission' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  await expect(page).toHaveTitle(/· Let's Ship It$/);
});

test('solo goes straight into the mission; replay only appears after a finished run', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Replay a stage' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Play solo' }).click();
  await expect(page.getByTestId('prologue-heading')).toBeVisible();
});

test('Play as a team offers Create and Join', async ({ page }) => {
  await page.getByRole('button', { name: 'Play as a team' }).click();
  await expect(page.getByRole('heading', { name: 'Play as a team' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create a team' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Join a team' })).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('button', { name: 'Play solo' })).toBeVisible();
});
