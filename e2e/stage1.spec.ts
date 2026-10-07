import { expect, test, type Page } from '@playwright/test';

/** Plays every card correctly using the debug-only data attributes. */
async function playCards(page: Page) {
  for (let guard = 0; guard < 20; guard++) {
    const card = page.getByTestId('record-card');
    if (!(await card.count())) return;
    const gotIt = page.getByRole('button', { name: 'Got it' });
    if (await gotIt.count()) await gotIt.click();
    const status = await card.getAttribute('data-status');
    const id = await card.getAttribute('data-id');
    if (status === 'fixable') {
      const fix = Number(await card.getAttribute('data-fix'));
      await page.getByRole('button', { name: 'Fix', exact: true }).click();
      await page.locator('section[aria-labelledby="fix-heading"] button').nth(fix).click();
    } else {
      await page.getByRole('button', { name: status === 'valid' ? 'Keep' : 'Trash', exact: true }).click();
    }
    await expect(page.locator(`[data-testid="record-card"][data-id="${id}"]`)).toHaveCount(0);
  }
}

test('Stage 1 booth: perfect play earns 3 stars and hands off to Stage 2', async ({ page }) => {
  await page.goto('/?debug=1&stage=1');
  await page.getByRole('button', { name: 'Start sorting' }).click();
  for (const level of ['Tutorial', 'Keep or Trash', 'Keep, Fix or Trash']) {
    await expect(page.getByRole('heading', { name: level, level: 1 })).toBeVisible();
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await playCards(page);
  }
  // Reality Check → automate → stars → hand-off.
  await expect(page.getByRole('heading', { name: 'Clean once, apply everywhere' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: /already/i }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('3 of 3 stars')).toBeAttached();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Ready' }).click();
  await expect(page.getByTestId('stage-heading')).toContainText('Teach the Machine to See');
  await page.getByText('Debug').click();
  await expect(page.locator('.debug-panel')).toContainText('"data": 3');
});

test('Stage 1: every card can be decided with buttons only, and wrong answers lead to a hint', async ({ page }) => {
  await page.goto('/?debug=1&stage=1');
  await page.getByRole('button', { name: 'Start sorting' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await playCards(page); // tutorial
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  // Answer the first two cards wrongly on purpose.
  for (let i = 0; i < 2; i++) {
    const status = await page.getByTestId('record-card').getAttribute('data-status');
    await page.getByRole('button', { name: status === 'valid' ? 'Trash' : 'Keep', exact: true }).click();
  }
  await expect(page.getByTestId('hint')).toContainText(/Hint/);
});

test('Stage 1 full mode includes the Spot the Outlier bonus', async ({ page }) => {
  await page.goto('/?debug=1&mode=full&stage=1');
  await page.getByRole('button', { name: 'Start sorting' }).click();
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await playCards(page);
  }
  await expect(page.getByRole('heading', { name: 'Spot the Outlier', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('heading', { name: 'Clean once, apply everywhere' })).toBeVisible();
});
