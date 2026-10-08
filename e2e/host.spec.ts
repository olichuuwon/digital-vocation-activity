import { expect, test } from '@playwright/test';
import { boardRow, mockSupabase } from './supabaseMock';

test.use({ serviceWorkers: 'block' });

const PIN = 'orange kite harbour';
const hostRow = (id: number, name: string, hidden: boolean) => ({
  id,
  group_name: name,
  group_size: 3,
  mode: 'booth',
  families: 800,
  finished_at: '2026-10-07T06:05:00+00:00',
  hidden,
});

test('shows a QR to the game, the live board and the playing placeholder', async ({ page }) => {
  await mockSupabase(page, { leaderboard_today: () => ({ body: [boardRow(1, 1, 'Swift Kingfisher', 1100)] }) });
  await page.goto('/host?mode=full');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Booth screen');
  const qr = page.getByRole('img', { name: /QR code that opens the game at http:\/\/localhost:4173\/\?mode=full/ });
  await expect(qr).toBeVisible();
  expect(await qr.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
  await expect(page.getByText('http://localhost:4173/?mode=full')).toBeVisible();
  await expect(page.getByTestId('board-row')).toContainText('Swift Kingfisher');
  await expect(page.getByText(/Updated \d\d:\d\d SGT/)).toBeVisible();
  await expect(page.getByTestId('host-playing')).toContainText('Groups playing now');
  // The game's settings gear and home buttons are not part of the booth screen.
  await expect(page.getByRole('button', { name: 'Play solo' })).toHaveCount(0);
});

test('polls the board every 10s while visible', async ({ page }) => {
  await page.clock.install();
  let n = 0;
  await mockSupabase(page, {
    leaderboard_today: () => ({ body: [boardRow(1, 1, n++ === 0 ? 'First Look' : 'Second Look', 900)] }),
  });
  await page.goto('/host');
  await expect(page.getByTestId('board-row')).toContainText('First Look');
  await page.clock.runFor(10_500);
  await expect(page.getByTestId('board-row')).toContainText('Second Look');
});

test('facilitator: wrong PIN, then unlock, hide and unhide', async ({ page }) => {
  let hidden = false;
  const calls = await mockSupabase(page, {
    leaderboard_today: () => ({ body: hidden ? [] : [boardRow(1, 7, 'Rude Name', 900)] }),
    host_list_recent: (a) =>
      a.p_pin === PIN ? { body: { status: 'ok', rows: [hostRow(7, 'Rude Name', hidden)] } } : { body: { status: 'wrong_pin', rows: [] } },
    set_run_hidden: (a) => {
      if (a.p_pin !== PIN) return { body: { status: 'wrong_pin' } };
      hidden = a.p_hidden as boolean;
      return { body: { status: 'ok' } };
    },
  });
  await page.goto('/host');
  const pin = page.getByLabel('Facilitator passcode');
  await expect(pin).toHaveAttribute('type', 'password');

  await pin.fill('not the passcode');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByText('Wrong passcode.')).toBeVisible();

  await pin.fill(PIN);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await page.getByRole('button', { name: 'Hide Rude Name' }).click();
  await expect(page.getByTestId('host-row')).toContainText('Hidden');
  await expect(page.getByText('No groups yet today. Be the first.')).toBeVisible();
  expect(calls.find((c) => c.name === 'set_run_hidden')?.args).toEqual({ p_id: 7, p_hidden: true, p_pin: PIN });

  await page.getByRole('button', { name: 'Unhide Rude Name' }).click();
  await expect(page.getByTestId('board-row')).toContainText('Rude Name');

  // The passcode is never persisted.
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
  expect(stored).not.toContain(PIN);

  await page.getByRole('button', { name: 'Lock' }).click();
  await expect(page.getByLabel('Facilitator passcode')).toHaveValue('');
});

test('facilitator: lockout message after too many wrong PINs', async ({ page }) => {
  await mockSupabase(page, {
    leaderboard_today: () => ({ body: [] }),
    host_list_recent: () => ({ body: { status: 'locked', rows: [] } }),
  });
  await page.goto('/host');
  await page.getByLabel('Facilitator passcode').fill('a wrong passcode');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByText('Too many wrong passcodes. Try again in 15 minutes.')).toBeVisible();
});

test('facilitator: the unlocked controls lock themselves after 5 minutes without use', async ({ page }) => {
  await page.clock.install();
  await mockSupabase(page, {
    leaderboard_today: () => ({ body: [] }),
    host_list_recent: (a) => ({ body: a.p_pin === PIN ? { status: 'ok', rows: [hostRow(7, 'Rude Name', false)] } : { status: 'wrong_pin', rows: [] } }),
  });
  await page.goto('/host');
  const pin = page.getByLabel('Facilitator passcode');
  // Too short to send: the button stays off until 12 characters.
  await pin.fill('482913');
  await expect(page.getByRole('button', { name: 'Unlock' })).toBeDisabled();
  await pin.fill(PIN);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByRole('button', { name: 'Hide Rude Name' })).toBeVisible();
  await page.clock.runFor(4 * 60_000);
  await expect(page.getByRole('button', { name: 'Hide Rude Name' })).toBeVisible();
  await page.clock.runFor(61_000);
  await expect(page.getByText('Locked after 5 minutes without use.')).toBeVisible();
  await expect(page.getByLabel('Facilitator passcode')).toHaveValue('');
});
