import { expect, test, type Page } from '@playwright/test';
import { seedRun, startReplay } from './replay';

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
  // Debug It doesn't count a stop at a new block as a fail, so allow a couple more runs.
  for (let i = 0; i < 6; i++) {
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
  // Guided tutorial: each step names the block to tap and highlights it in the palette.
  for (const [n, b] of [['1', 'Move forward'], ['2', 'Turn right'], ['3', 'Move forward'], ['4', 'Drop supplies']] as const) {
    await expect(page.getByTestId('coach')).toContainText(`Step ${n} of 4`);
    await expect(block(page, b)).toHaveAttribute('data-guide', 'true');
    await block(page, b).click();
  }
  await expect(page.getByTestId('block-count')).toContainText('4');
  await expect(page.getByTestId('coach')).toContainText('Tap ▶ Run');
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
  // Repeat starts at ×2; the route needs ×3.
  await page.getByTestId('program').locator('[data-op="repeat"]').click();
  await page.getByRole('button', { name: 'More times' }).click();
  await expect(page.getByTestId('program')).toContainText('Repeat ×3');
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
  await expect(page.getByText(/of 3 stars/).first()).toBeAttached();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Keep it alive' })).toBeVisible();
  await page.getByText('Debug').click();
  await expect(page.locator('.debug-panel')).toContainText('"puzzlesSolved": 3');
});

test('Stage 3: blocks can be selected, moved and removed; the limit blocks extra adds', async ({ page }) => {
  await page.goto('/?debug=1&stage=3');
  await page.getByRole('button', { name: 'Start building' }).click();
  await block(page, 'Turn left').click();
  await block(page, 'Move forward').click();
  const program = page.getByTestId('program');
  await program.locator('[data-op="forward"]').click();
  await page.getByRole('button', { name: 'Move up' }).click();
  await expect(program.locator('[data-op]').first()).toHaveAttribute('data-op', 'forward');
  await program.locator('[data-op="left"]').click();
  await page.getByTestId('remove-block').click();
  await expect(page.getByTestId('block-count')).toContainText('1');
});

test('Stage 3 replay: Bonus: Debug It swaps a block, and Bonus: Ask the AI runs', async ({ page }) => {
  test.setTimeout(150_000); // six levels of animated truck runs
  await startReplay(page, 3);
  await page.getByRole('button', { name: 'Start building' }).click();
  await solveWithAnswer(page);
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await solveWithAnswer(page);
  }
  await expect(page.getByRole('heading', { name: 'Bonus: Debug It', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByTestId('block-count')).toContainText('9');
  const program = page.getByTestId('program');
  await program.locator('[data-op]').nth(2).click();
  await block(page, 'Turn left').click();
  await expect(page.getByText('Swaps left: 1')).toBeVisible();
  await solveWithAnswer(page);
  await expect(page.getByRole('heading', { name: 'Bonus: Ask the AI', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await solveWithAnswer(page);
  await expect(page.getByRole('heading', { name: 'That was programming' })).toBeVisible();
});

test('Stage 3: one failed run brings the 💡 ghost step, and tapping it builds the program', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/?debug=1&stage=3');
  await page.getByRole('button', { name: 'Start building' }).click();
  for (const b of ['Move forward', 'Turn right', 'Move forward', 'Drop supplies']) await block(page, b).click();
  await runAndWait(page);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByTestId('ghost')).toHaveCount(0);
  await block(page, 'Turn left').click();
  await runAndWait(page);
  // Hint after 1 failed run: the ghost suggests the next change; following it solves the level.
  const ghost = page.getByTestId('ghost');
  await expect(ghost).toBeVisible();
  for (let i = 0; i < 12 && (await ghost.count()); i++) await ghost.click();
  await runAndWait(page);
  await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
});

test('Stage 3: Choose the Road starts with the If block in place, with 120 s', async ({ page }) => {
  await seedRun(page, { stage: 3, levelIndex: 3 });
  await expect(page.getByRole('heading', { name: 'Choose the Road', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByTestId('program').locator('[data-op="ifFlooded"]')).toHaveCount(1);
  await expect(page.getByRole('timer')).toContainText('2:00');
});
