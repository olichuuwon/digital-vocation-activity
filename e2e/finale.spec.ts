import { expect, test, type Page } from '@playwright/test';

async function playLiveOps(page: Page, correct: boolean) {
  for (let guard = 0; guard < 20; guard++) {
    const card = page.getByTestId('incident');
    if (!(await card.count())) return;
    const team = await card.getAttribute('data-team');
    const text = await card.textContent();
    const pick = correct ? team : team === 'data' ? 'ai' : 'data';
    await page.locator(`button[data-team="${pick}"]`).click();
    // Next incident (or the debrief) replaces this one after the feedback gap.
    await expect(page.getByTestId('incident').filter({ hasText: text ?? '' })).toHaveCount(0, { timeout: 10_000 });
  }
}

test('Finale: reveal, route every incident, debrief card fits one screen, then chapter select', async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/?debug=1&stage=5');
  await expect(page.getByRole('heading', { name: 'Mission live' })).toBeVisible();
  await expect(page.getByTestId('pipeline')).toContainText('Model accuracy');
  await page.getByRole('button', { name: 'Go live' }).click();
  await page.getByRole('button', { name: 'Start shift' }).click();
  const before = await page.getByTestId('live-families').textContent();
  await playLiveOps(page, true);

  await expect(page.getByRole('heading', { name: 'Mission complete' })).toBeVisible();
  await expect(page.getByTestId('families')).toContainText('of 1,200');
  // §12 M6: the screenshot card fits 360×740.
  const box = (await page.getByTestId('end-card').boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(740);
  expect(box.width).toBeLessThanOrEqual(360);
  // Live Ops added families (8 right × reward).
  const n = (s: string | null) => Number(/[\d,]+/.exec(s ?? '')?.[0]?.replace(/,/g, '') ?? NaN);
  expect(n(await page.getByTestId('families').textContent())).toBeGreaterThan(n(before));
  await expect(page.getByText(/Solo runs aren't ranked/)).toBeVisible();

  // Reload keeps the same result (no replaying Live Ops for a better score).
  const families = await page.getByTestId('families').textContent();
  await page.reload();
  await expect(page.getByTestId('families')).toHaveText(families ?? '');

  await page.getByRole('button', { name: 'Replay a stage' }).click();
  await expect(page.getByRole('heading', { name: 'Pick a stage' })).toBeVisible();
  await page.getByRole('button', { name: /Teach the Machine to See/ }).click();
  await expect(page.getByRole('heading', { name: 'Teach the machine to see' })).toBeVisible();
});

test('Finale: wrong routes cost families; Play again goes Home with no Resume', async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto('/?debug=1&stage=5');
  await page.getByRole('button', { name: 'Go live' }).click();
  await page.getByRole('button', { name: 'Start shift' }).click();
  const before = await page.getByTestId('live-families').textContent();
  await playLiveOps(page, false);
  const n = (s: string | null) => Number(/[\d,]+/.exec(s ?? '')?.[0]?.replace(/,/g, '') ?? NaN);
  expect(n(await page.getByTestId('families').textContent())).toBeLessThan(n(before));
  await page.getByRole('button', { name: 'Play again' }).click();
  await expect(page.getByRole('button', { name: 'Play solo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resume run' })).toHaveCount(0);
});

test('Finale: a reload right after the last incident still reaches the debrief (no dead end)', async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto('/?debug=1&stage=5');
  await page.getByRole('button', { name: 'Go live' }).click();
  await page.getByRole('button', { name: 'Start shift' }).click();
  for (let i = 0; i < 8; i++) {
    const card = page.getByTestId('incident');
    const team = await card.getAttribute('data-team');
    await page.locator(`button[data-team="${team}"]`).click();
    if (i < 7) await expect(page.getByTestId('feedback')).toHaveCount(0, { timeout: 10_000 });
  }
  // Reload inside the final feedback gap.
  await page.goto('/');
  await page.getByRole('button', { name: 'Resume run' }).click();
  await expect(page.getByRole('heading', { name: 'Mission complete' })).toBeVisible();
  // Home now offers chapter select (§8.3).
  await page.getByRole('button', { name: 'Play again' }).click();
  await expect(page.getByRole('button', { name: 'Replay a stage' })).toBeVisible();
});
