import { expect, test } from '@playwright/test';
import { boardRow, E2E_SUPABASE_URL, mockSupabase } from './supabaseMock';

test.use({ serviceWorkers: 'block' });

// §11 / CLAUDE.md rule 6: no trackers. The only external host is the Supabase backend.
test('the only external host requested is the Supabase URL', async ({ page, baseURL }) => {
  const hosts = new Set<string>();
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.protocol === 'http:' || u.protocol === 'https:') hosts.add(u.origin);
  });
  const calls = await mockSupabase(page, {
    leaderboard_today: () => ({ body: [boardRow(1, 1, 'Swift Kingfisher', 1100)] }),
    leaderboard_all: () => ({ body: [] }),
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Play solo' }).click();
  await page.getByRole('button', { name: /Booth run/ }).click();
  await page.getByRole('button', { name: 'From the beginning' }).click();
  await page.getByRole('button', { name: 'Finish level' }).click();
  // Playing solo makes no backend calls at all.
  expect(calls).toHaveLength(0);

  await page.goto('/');
  await page.getByRole('button', { name: 'Leaderboard' }).click();
  await expect(page.getByTestId('board-row')).toHaveCount(1);
  await page.getByRole('tab', { name: 'View all' }).click();
  await page.goto('/host');
  await expect(page.getByTestId('board-row')).toHaveCount(1);

  expect([...hosts].sort()).toEqual([new URL(baseURL!).origin, E2E_SUPABASE_URL].sort());
  // Only RPC endpoints: no auth, storage or realtime traffic.
  expect(calls.every((c) => /^(leaderboard_today|leaderboard_all)$/.test(c.name))).toBe(true);
});
