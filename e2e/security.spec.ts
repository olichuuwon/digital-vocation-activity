import { expect, test, type Page } from '@playwright/test';
import { boardRow, mockSupabase } from './supabaseMock';

// `vite preview` serves vercel.json's security headers (vite.config.ts), so this checks the real
// Content-Security-Policy doesn't block anything the game needs: QR images, styles, the
// service worker, Supabase calls and the group relay.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { cspViolations: string[] };
    w.cspViolations = [];
    document.addEventListener('securitypolicyviolation', (e) => w.cspViolations.push(`${e.violatedDirective} ${e.blockedURI} ${e.sourceFile}:${e.lineNumber}:${e.columnNumber}`));
  });
  await mockSupabase(page, { leaderboard_today: () => ({ body: [boardRow(1, 1, 'Swift Kingfisher', 1100)] }), run_rank: () => ({ body: [] }) });
});

const violations = (page: Page) => page.evaluate(() => (window as unknown as { cspViolations: string[] }).cspViolations);

test('sends the security headers', async ({ page }) => {
  const res = await page.goto('/');
  const h = res!.headers();
  expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(h['x-frame-options']).toBe('DENY');
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
});

test('home, leaderboard, host and a team lobby run without CSP violations', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Leaderboard' }).click();
  await expect(page.getByTestId('board-row').first()).toBeVisible();
  expect(await violations(page)).toEqual([]);

  await page.goto('/host');
  await expect(page.getByTestId('board-row').first()).toBeVisible();
  await expect(page.locator('img[src^="data:"]').first()).toBeVisible();
  expect(await violations(page)).toEqual([]);

  // A real team lobby over the relay (WebSocket connect-src), with its QR code.
  await page.goto('/');
  await page.getByRole('button', { name: 'Play as a team' }).click();
  await page.getByRole('button', { name: 'Create a team' }).click();
  await page.getByRole('button', { name: /Type our own name/ }).click();
  await page.getByLabel('Team name').fill('Policy Pandas');
  await page.getByLabel('Your nickname').fill('Dev');
  await page.getByRole('button', { name: 'Create team' }).click();
  await expect(page.getByTestId('group-name')).toHaveText('Policy Pandas', { timeout: 15_000 });
  await expect(page.locator('img[src^="data:"]').first()).toBeVisible();
  expect(await violations(page)).toEqual([]);
});

test('a stage plays without CSP violations', async ({ page }) => {
  await page.goto('/?debug=1&simSpeed=25&stage=4');
  await page.getByRole('button', { name: 'Launch the app' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.getByRole('button', { name: 'Got it' }).click();
  await page.waitForTimeout(1500);
  expect(await violations(page)).toEqual([]);
});
