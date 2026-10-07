import { expect, test, type Page } from '@playwright/test';

/** Labels every picture correctly using the debug-only data attribute. */
async function playLabels(page: Page) {
  for (let guard = 0; guard < 20; guard++) {
    const img = page.getByTestId('ai-image');
    if (!(await img.count())) return;
    const gotIt = page.getByRole('button', { name: 'Got it' });
    if (await gotIt.count()) await gotIt.click();
    const label = await img.getAttribute('data-label');
    const alt = await img.locator('svg').getAttribute('aria-label');
    await page.locator(`button[data-label="${label}"]`).click();
    await expect(page.locator(`svg[aria-label="${alt}"]`)).toHaveCount(0);
  }
}

async function playCovered(page: Page) {
  for (let guard = 0; guard < 20; guard++) {
    const row = page.getByTestId('covered-label');
    if (!(await row.count())) return;
    const label = await row.getAttribute('data-label');
    const shownBefore = await page.getByTestId('covered').getAttribute('data-shown');
    expect(Number(shownBefore)).toBeLessThan(16);
    const alt = await page.getByTestId('covered').locator('svg').getAttribute('aria-label');
    await page.locator(`button[data-label="${label}"]`).click();
    await expect(page.locator(`svg[aria-label="${alt}"]`)).toHaveCount(0);
  }
}

async function playAudit(page: Page) {
  for (let guard = 0; guard < 20; guard++) {
    const img = page.getByTestId('audit-image');
    if (!(await img.count())) return;
    const wrong = (await img.getAttribute('data-wrong')) === 'true';
    const alt = await img.locator('svg').getAttribute('aria-label');
    await page.getByRole('button', { name: wrong ? /Flag it/ : /Looks right/ }).click();
    await expect(page.locator(`svg[aria-label="${alt}"]`)).toHaveCount(0);
  }
}

test('Stage 2 booth: perfect play earns 3 stars and hands off to Stage 3', async ({ page }) => {
  await page.goto('/?debug=1&stage=2');
  await page.getByRole('button', { name: 'Start labelling' }).click();
  for (const level of ['Tutorial', 'Build the Training Set']) {
    await expect(page.getByRole('heading', { name: level, level: 1 })).toBeVisible();
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await playLabels(page);
  }
  await expect(page.getByRole('heading', { name: 'Covered Up', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await playCovered(page);
  await expect(page.getByRole('heading', { name: 'Audit the AI', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await playAudit(page);

  await expect(page.getByRole('heading', { name: 'Confidence, not certainty' })).toBeVisible();
  await expect(page.getByTestId('labelled-count')).toContainText('20 from you');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('3 of 3 stars').first()).toBeAttached();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Ready' }).click();
  await expect(page.getByRole('heading', { name: 'Build the logic' })).toBeVisible();
  await page.getByText('Debug').click();
  await expect(page.locator('.debug-panel')).toContainText('"ai": 3');
});

test('Stage 2: wrong labels lead to a hint, then the answer is marked', async ({ page }) => {
  await page.goto('/?debug=1&stage=2');
  await page.getByRole('button', { name: 'Start labelling' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await playLabels(page); // tutorial
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  for (let i = 0; i < 3; i++) {
    const label = await page.getByTestId('ai-image').getAttribute('data-label');
    await page.locator(`button[data-label]:not([data-label="${label}"])`).first().click();
  }
  await expect(page.getByTestId('hint')).toContainText(/answer/i);
  await expect(page.locator('button[data-suggested="true"]')).toHaveCount(1);
});

test('Stage 2 Covered Up: tiles lift over time and Reveal uses a charge', async ({ page }) => {
  await page.goto('/?debug=1&stage=2');
  await page.getByRole('button', { name: 'Start labelling' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await playLabels(page);
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await playLabels(page);
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  const board = page.getByTestId('covered');
  const first = Number(await board.getAttribute('data-shown'));
  await page.getByRole('button', { name: /Reveal a tile/ }).click();
  await expect(page.getByRole('button', { name: /Reveal a tile \(1 left\)/ })).toBeVisible();
  await expect.poll(async () => Number(await board.getAttribute('data-shown'))).toBeGreaterThan(first + 1);
});

test('Stage 2 full mode: Draw the Box with buttons only, then the answer outline after 3 misses', async ({ page }) => {
  await page.goto('/?debug=1&mode=full&stage=2');
  await page.getByRole('button', { name: 'Start labelling' }).click();
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await playLabels(page);
  }
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await playCovered(page);
  await expect(page.getByRole('heading', { name: 'Draw the Box', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  // Shrink the box into a corner so it misses, three times.
  for (let i = 0; i < 3; i++) {
    for (let k = 0; k < 6; k++) await page.getByRole('button', { name: 'Narrower' }).click();
    for (let k = 0; k < 6; k++) await page.getByRole('button', { name: 'Shorter' }).click();
    for (let k = 0; k < 8; k++) await page.getByRole('button', { name: 'Move left' }).click();
    for (let k = 0; k < 8; k++) await page.getByRole('button', { name: 'Move up' }).click();
    await page.getByRole('button', { name: 'Lock it in' }).click();
  }
  await expect(page.getByTestId('truth-box')).toBeAttached();
  await expect(page.getByTestId('hint')).toContainText('dashed outline');
});

test('Stage 2: Settings pauses the level timer, and a reload after the last level resumes there', async ({ page }) => {
  await page.goto('/?debug=1&stage=2');
  await page.getByRole('button', { name: 'Start labelling' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await playLabels(page);
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  const clock = page.getByRole('timer');
  const before = await clock.textContent();
  await page.waitForTimeout(2500);
  expect(await clock.textContent()).toBe(before);
  await page.getByRole('button', { name: 'Close' }).first().click();
  await playLabels(page);
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await playCovered(page);
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await playAudit(page);
  await expect(page.getByRole('heading', { name: 'Confidence, not certainty' })).toBeVisible();
  await page.goto('/');
  await page.getByRole('button', { name: 'Resume run' }).click();
  await expect(page.getByRole('heading', { name: 'Confidence, not certainty' })).toBeVisible();
});
