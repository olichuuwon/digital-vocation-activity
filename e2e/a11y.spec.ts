import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { boardRow, mockSupabase } from './supabaseMock';

// M7 acceptance: axe clean (WCAG 2.2 AA) on every screen type, in light and dark themes.
test.use({ serviceWorkers: 'block' });

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function axe(page: Page, screen: string) {
  // Let entrance animations settle so colours are measured at rest.
  await page.waitForTimeout(700);
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    const found = r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
    expect(found, `${screen} (${scheme})`).toEqual([]);
  }
}

test.beforeEach(async ({ page }) => {
  test.setTimeout(120_000);
  await mockSupabase(page, { leaderboard_today: () => ({ body: [boardRow(1, 1, 'Swift Kingfisher', 1100)] }), run_rank: () => ({ body: [] }) });
});

test('Home, Settings, Leaderboard, Host', async ({ page }) => {
  await page.goto('/');
  await axe(page, 'Home');
  await page.getByRole('button', { name: 'Settings' }).click();
  await axe(page, 'Settings');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Leaderboard' }).click();
  await expect(page.getByTestId('board-row').first()).toBeVisible();
  await axe(page, 'Leaderboard');
  await page.goto('/host');
  await expect(page.getByTestId('board-row').first()).toBeVisible();
  await axe(page, 'Host');
});

test('Stage 1 and Stage 2 play screens', async ({ page }) => {
  await page.goto('/?debug=1&stage=1');
  await axe(page, 'Stage 1 briefing');
  await page.getByRole('button', { name: 'Start sorting' }).click();
  await axe(page, 'Stage 1 level intro');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await axe(page, 'Stage 1 card');
  await page.goto('/?debug=1&stage=2');
  await page.getByRole('button', { name: 'Start labelling' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  const gotIt = page.getByRole('button', { name: 'Got it' });
  if (await gotIt.count()) await gotIt.click();
  await axe(page, 'Stage 2 label');
});

test('Stage 3 and Stage 4 play screens', async ({ page }) => {
  await page.goto('/?debug=1&stage=3');
  await page.getByRole('button', { name: 'Start building' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  const gotIt = page.getByRole('button', { name: 'Got it' });
  if (await gotIt.count()) await gotIt.click();
  await axe(page, 'Stage 3 editor');
  await page.goto('/?debug=1&stage=4');
  await page.getByRole('button', { name: 'Go live' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.getByRole('button', { name: 'Got it' }).click();
  await page.getByRole('button', { name: 'Pause' }).click();
  await axe(page, 'Stage 4 storm (paused)');
});

test('Finale: reveal, Live Ops, debrief', async ({ page }) => {
  await page.goto('/?debug=1&stage=5');
  await axe(page, 'Finale reveal');
  await page.getByRole('button', { name: 'Go live' }).click();
  await page.getByRole('button', { name: 'Start shift' }).click();
  await axe(page, 'Live Ops');
  for (let guard = 0; guard < 20; guard++) {
    const card = page.getByTestId('incident');
    if (!(await card.count())) break;
    const team = await card.getAttribute('data-team');
    const text = await card.textContent();
    await page.locator(`button[data-team="${team}"]`).click();
    await expect(page.getByTestId('incident').filter({ hasText: text ?? '' })).toHaveCount(0, { timeout: 10_000 });
  }
  await expect(page.getByRole('heading', { name: 'Mission complete' })).toBeVisible();
  await axe(page, 'Debrief');
});

test('Group: create, join, lobby, support card', async ({ page }) => {
  await page.goto('/?debug=1&fakePeers=2');
  await page.getByRole('button', { name: 'Join group' }).click();
  await axe(page, 'Join');
  await page.goto('/?debug=1&fakePeers=2');
  await page.getByRole('button', { name: 'Create group' }).click();
  await axe(page, 'Create');
  await page.getByLabel('Your nickname').fill('Dev');
  await page.getByRole('button', { name: 'Create group' }).click();
  await expect(page.getByTestId('member')).toHaveCount(3);
  await axe(page, 'Lobby');
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('button', { name: 'Start the mission' }).click();
  await page.getByRole('button', { name: 'Support 1', exact: true }).click();
  await expect(page.getByTestId('support-screen')).toBeVisible();
  await axe(page, 'Support stage 1');
});
