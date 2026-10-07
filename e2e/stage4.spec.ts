import { expect, test, type Page } from '@playwright/test';

// simSpeed (debug only) runs the 75 s storms fast so the suite stays quick.
const URL = '/?debug=1&simSpeed=25&stage=4';

async function manualPhase(page: Page) {
  await page.getByRole('button', { name: 'Go live' }).click();
  await expect(page.getByRole('heading', { name: 'Manual Mode', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.getByRole('button', { name: 'Got it' }).click();
  await expect(page.getByTestId('server')).toHaveCount(3);
  // Tap a few things like a player would; the storm finishes on its own.
  await page.getByRole('button', { name: /Boost: Server 1/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click({ timeout: 20_000 });
}

async function kubernetesCards(page: Page) {
  await expect(page.getByRole('heading', { name: 'Meet Kubernetes' })).toBeVisible();
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
}

async function setSensible(page: Page) {
  for (const name of ['Load balancer', 'Self-healing', 'Rolling updates'])
    await page.getByRole('group', { name, exact: true }).getByRole('button', { name: 'On' }).click();
  await page.getByRole('button', { name: 'More: Min pods' }).click(); // 2
  for (let i = 0; i < 7; i++) await page.getByRole('button', { name: 'More: Max pods' }).click(); // 10
  await page.locator('#threshold').fill('65');
}

test('Stage 4: manual storm, Kubernetes, a sensible config beats manual and earns 3 stars', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(URL);
  await manualPhase(page);
  await kubernetesCards(page);
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Set up Kubernetes' })).toBeVisible();
  await expect(page.getByTestId('cost-meter')).toContainText('Budget');
  await setSensible(page);
  await expect(page.getByTestId('cost-meter')).toContainText('Under budget');
  await page.getByRole('button', { name: 'Replay the storm' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByTestId('diagnosis')).toHaveAttribute('data-diagnosis', 'perfect', { timeout: 20_000 });
  const [manual, auto] = await page.getByTestId('compare').locator('strong').allTextContents();
  expect(parseInt(auto!)).toBeGreaterThan(parseInt(manual!));
  await page.getByRole('button', { name: 'Keep this result' }).click();
  await expect(page.getByRole('heading', { name: 'This is a real job' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('3 of 3 stars')).toBeAttached();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Mission live' })).toBeVisible();
});

test('Stage 4: the default config fails in a teachable way, and Tweak goes back with a hint', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(URL);
  await manualPhase(page);
  await kubernetesCards(page);
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.getByRole('button', { name: 'Replay the storm' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByTestId('diagnosis')).not.toHaveAttribute('data-diagnosis', 'perfect', { timeout: 20_000 });
  await page.getByRole('button', { name: 'Tweak settings' }).click();
  // Back on Phase B without repeating the Kubernetes cards; the hint is now shown.
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Set up Kubernetes' })).toBeVisible();
  await expect(page.getByTestId('hint')).toContainText(/Hint/);
});

test('Stage 4: reloading after the replay shows the saved result, not another 75 s storm', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(URL);
  await manualPhase(page);
  await kubernetesCards(page);
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.getByRole('button', { name: 'Replay the storm' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  const diagnosis = page.getByTestId('diagnosis');
  await expect(diagnosis).toBeVisible({ timeout: 20_000 });
  const kind = await diagnosis.getAttribute('data-diagnosis');
  await page.goto('/');
  await page.getByRole('button', { name: 'Resume run' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByTestId('diagnosis')).toHaveAttribute('data-diagnosis', kind ?? '');
  await expect(page.getByTestId('replay-stats')).toHaveCount(0);
});
