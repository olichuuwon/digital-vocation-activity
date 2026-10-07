import { expect, test } from '@playwright/test';
import { boardRow, mockSupabase } from './supabaseMock';

test.use({ serviceWorkers: 'block' });

const todayRows = [boardRow(1, 101, 'Swift Kingfisher', 1100), boardRow(2, 42, 'Bold Merlion', 950, { group_size: 4 })];

async function openBoard(page: import('@playwright/test').Page, query = '') {
  await page.goto(`/${query}`);
  await page.getByRole('button', { name: 'Leaderboard' }).click();
  await expect(page.getByRole('heading', { name: 'Leaderboard' })).toBeFocused();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
});

test('Today tab shows ranked rows with size, families and HH:MM SGT', async ({ page }) => {
  const calls = await mockSupabase(page, { leaderboard_today: () => ({ body: todayRows }) });
  await openBoard(page);
  const today = page.getByRole('tab', { name: 'Today' });
  await expect(today).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel')).toBeVisible();
  const rows = page.getByTestId('board-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('1');
  await expect(rows.nth(0)).toContainText('Swift Kingfisher');
  await expect(rows.nth(0)).toContainText('1,100 families');
  await expect(rows.nth(0)).toContainText('14:05');
  await expect(rows.nth(1)).toContainText('4');
  expect(calls.map((c) => c.name)).toEqual(['leaderboard_today']);
  await expect(page).toHaveTitle(/Leaderboard · Let's Ship It/);
});

test('own group is highlighted, or pinned below when outside the top 20', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('ship-it-own-runs', '[42]'));
  await mockSupabase(page, { leaderboard_today: () => ({ body: todayRows }) });
  await openBoard(page);
  const own = page.locator('[data-own]');
  await expect(own).toHaveCount(1);
  await expect(own).toContainText('Bold Merlion');
  await expect(own).toContainText('Your group');

  await page.evaluate(() => localStorage.setItem('ship-it-own-runs', '[777]'));
  await page.unrouteAll();
  const calls = await mockSupabase(page, {
    leaderboard_today: () => ({ body: todayRows }),
    run_rank: () => ({ body: [boardRow(23, 777, 'Late Otters', 120)] }),
  });
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Leaderboard' }).click();
  const pinned = page.getByTestId('board-pinned');
  await expect(pinned).toContainText('Your group today');
  await expect(pinned).toContainText('23');
  await expect(pinned).toContainText('Late Otters');
  expect(calls.find((c) => c.name === 'run_rank')?.args).toEqual({ p_id: 777 });
});

test('tabs work with arrow keys; View all has an all-time list and a day filter', async ({ page }) => {
  const calls = await mockSupabase(page, {
    leaderboard_today: () => ({ body: todayRows }),
    leaderboard_all: (args) =>
      args.p_date
        ? { body: [] }
        : { body: [boardRow(1, 5, 'Legends', 1200, { board_date: '2026-09-30' }), ...todayRows.map((r, i) => ({ ...r, rank: i + 2 }))] },
  });
  await openBoard(page);
  await page.getByRole('tab', { name: 'Today' }).focus();
  await page.keyboard.press('ArrowRight');
  const all = page.getByRole('tab', { name: 'View all' });
  await expect(all).toBeFocused();
  await expect(all).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Top 50 of all time')).toBeVisible();
  await expect(page.getByTestId('board-row').first()).toContainText('30 Sep 2026');
  expect(calls.at(-1)).toEqual({ name: 'leaderboard_all', args: { p_date: null } });

  await page.getByLabel('Day').fill('2026-10-01');
  await expect(page.getByText('No groups on this day.')).toBeVisible();
  await expect(page.getByText('Top 50 on 1 Oct 2026')).toBeVisible();
  expect(calls.at(-1)).toEqual({ name: 'leaderboard_all', args: { p_date: '2026-10-01' } });

  await page.getByRole('button', { name: 'All time' }).click();
  await expect(page.getByTestId('board-row')).toHaveCount(3);
  await page.getByRole('tab', { name: 'View all' }).focus();
  await page.keyboard.press('Home');
  await expect(page.getByRole('tab', { name: 'Today' })).toHaveAttribute('aria-selected', 'true');
});

test('empty state invites the first group', async ({ page }) => {
  await mockSupabase(page, { leaderboard_today: () => ({ body: [] }) });
  await openBoard(page);
  await expect(page.getByText('No groups yet today. Be the first.')).toBeVisible();
});

test('offline shows an error with retry, and retry recovers', async ({ page }) => {
  let online = false;
  await mockSupabase(page, { leaderboard_today: () => (online ? { body: todayRows } : 'abort') });
  await openBoard(page);
  await expect(page.getByRole('alert')).toHaveText("Can't reach the leaderboard. Your game still works.");
  online = true;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByTestId('board-row')).toHaveCount(2);
});

test('a backend that refuses (e.g. SQL not applied) shows "unavailable"', async ({ page }) => {
  await mockSupabase(page, {}); // every RPC → PGRST202
  await openBoard(page);
  await expect(page.getByRole('alert')).toHaveText('The leaderboard is unavailable right now. You can still play.');
});

test('a malformed response is treated as an error, not rendered', async ({ page }) => {
  await mockSupabase(page, { leaderboard_today: () => ({ body: [{ rank: 1, id: 1, group_name: 'X', families: 99999 }] }) });
  await openBoard(page);
  await expect(page.getByTestId('board-error')).toBeVisible();
  await expect(page.getByTestId('board-row')).toHaveCount(0);
});

test('works at 360px and 200% text: no sideways scroll, 48px tabs', async ({ page }) => {
  const long = boardRow(3, 9, 'WWWWWWWWWWWWWWWWWWWW', 1200, { group_size: 4 });
  await mockSupabase(page, { leaderboard_today: () => ({ body: [...todayRows, long] }) });
  await page.setViewportSize({ width: 360, height: 740 });
  await openBoard(page);
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  await expect(page.getByTestId('board-row')).toHaveCount(3);
  for (const name of ['Today', 'View all']) {
    const box = (await page.getByRole('tab', { name }).boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(48);
    expect(box.x + box.width).toBeLessThanOrEqual(360);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

test('?debug=1 does not offer a test submit on a production build', async ({ page }) => {
  await mockSupabase(page, {});
  await openBoard(page, '?debug=1');
  await expect(page.getByRole('button', { name: 'Submit test run' })).toHaveCount(0);
});
