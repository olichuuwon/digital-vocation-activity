import { expect, test, type Page } from '@playwright/test';

const block = (page: Page, name: string) => page.getByRole('group', { name: 'Blocks' }).getByRole('button', { name, exact: false });

async function runAndWait(page: Page) {
  await page.getByRole('button', { name: /▶ Run/ }).click();
  // The truck animates one step at a time; wait until the run ends (Run is clickable again or solved).
  await expect(page.getByRole('button', { name: /Running/ })).toHaveCount(0, { timeout: 15_000 });
}

/** No dead ends: 3 failed runs bring "Show me", which loads a working program (reduced score). */
async function solveWithAnswer(page: Page) {
  if (!(await page.getByTestId('program').getByRole('button').filter({ hasText: /Move|Turn|Drop|Repeat|If|Ask/ }).count()))
    await block(page, 'Turn left').click();
  for (let i = 0; i < 3; i++) {
    if (await page.getByRole('button', { name: 'Show me' }).count()) break;
    await runAndWait(page);
    if (await page.getByRole('button', { name: 'Show me' }).count()) break;
    await page.getByRole('button', { name: 'Reset' }).click();
  }
  await page.getByRole('button', { name: 'Show me' }).click();
  await runAndWait(page);
  await page.getByRole('button', { name: 'Continue' }).click();
}

test('Stage 3 booth: build the tutorial by taps, finish the rest, reach Stage 4', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/?debug=1&stage=3');
  await page.getByRole('button', { name: 'Start building' }).click();
  await expect(page.getByRole('heading', { name: 'Tutorial', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.getByRole('button', { name: 'Got it' }).click();
  for (const b of ['Move forward', 'Turn right', 'Move forward', 'Drop supplies']) await block(page, b).click();
  await expect(page.getByTestId('block-count')).toContainText('4');
  await runAndWait(page);
  await expect(page.getByTestId('truck')).toHaveAttribute('data-pos', '2,3,S');
  await page.getByRole('button', { name: 'Continue' }).click();

  // L1: built by taps.
  await expect(page.getByRole('heading', { name: 'Order the Steps', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  for (const b of ['Move forward', 'Drop supplies', 'Move forward', 'Turn left', 'Move forward', 'Move forward', 'Drop supplies'])
    await block(page, b).click();
  await runAndWait(page);
  await page.getByRole('button', { name: 'Continue' }).click();

  // L2: Repeat ×3 { forward, forward, drop, right } — new Repeat puts the next blocks inside it.
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await block(page, 'Repeat').click();
  for (const b of ['Move forward', 'Move forward', 'Drop supplies', 'Turn right']) await block(page, b).click();
  await expect(page.getByTestId('block-count')).toContainText('5 of 5');
  await runAndWait(page);
  await page.getByRole('button', { name: 'Continue' }).click();

  // L3 via the answer path (no dead ends).
  await expect(page.getByRole('heading', { name: 'Choose the Road', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await solveWithAnswer(page);

  await expect(page.getByRole('heading', { name: 'That was programming' })).toBeVisible();
  await expect(page.getByTestId('python')).toContainText('if road_ahead_is_flooded():');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText(/of 3 stars/)).toBeAttached();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Ready' }).click();
  await expect(page.getByTestId('stage-heading')).toContainText('Keep It Alive');
  await page.getByText('Debug').click();
  await expect(page.locator('.debug-panel')).toContainText('"puzzlesSolved": 3');
});

test('Stage 3: blocks can be selected, moved and removed; the limit blocks extra adds', async ({ page }) => {
  await page.goto('/?debug=1&stage=3');
  await page.getByRole('button', { name: 'Start building' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.getByRole('button', { name: 'Got it' }).click();
  await block(page, 'Turn left').click();
  await block(page, 'Move forward').click();
  const program = page.getByTestId('program');
  await program.getByRole('button', { name: /Move forward/ }).click();
  await page.getByRole('button', { name: 'Move up' }).click();
  await expect(program.locator('[data-op]').first()).toHaveAttribute('data-op', 'forward');
  await program.getByRole('button', { name: /Turn left/ }).click();
  await page.getByTestId('remove-block').click();
  await expect(page.getByTestId('block-count')).toContainText('1');
});

test('Stage 3 full mode: Debug It swaps a block, and Ask the AI levels run', async ({ page }) => {
  test.setTimeout(150_000); // six levels of animated truck runs
  await page.goto('/?debug=1&mode=full&stage=3');
  await page.getByRole('button', { name: 'Start building' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.getByRole('button', { name: 'Got it' }).click();
  await solveWithAnswer(page);
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await solveWithAnswer(page);
  }
  await expect(page.getByRole('heading', { name: 'Debug It', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByTestId('block-count')).toContainText('9');
  const program = page.getByTestId('program');
  await program.locator('[data-op]').nth(2).click();
  await block(page, 'Turn left').click();
  await expect(page.getByText('Swaps left: 1')).toBeVisible();
  await solveWithAnswer(page);
  await expect(page.getByRole('heading', { name: 'Ask the AI', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await solveWithAnswer(page);
  await expect(page.getByRole('heading', { name: 'That was programming' })).toBeVisible();
});
