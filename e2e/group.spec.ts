import { expect, test, type Browser, type Page, type TestInfo } from '@playwright/test';
import { boardRow, mockSupabase } from './supabaseMock';

// Group play (spec §3.5, §12 M6.5) with real browser contexts talking through the e2e
// WebSocket relay (e2e/groupRelay.ts). Supabase RPCs are mocked; nothing touches a real backend.

test.use({ serviceWorkers: 'block' });

const ROW_ID = 4242;

/** A fresh phone (own context = own localStorage) with the project's device settings. */
async function phone(browser: Browser, info: TestInfo) {
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, baseURL } = info.project.use;
  const ctx = await browser.newContext({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, baseURL, serviceWorkers: 'block' });
  return ctx.newPage();
}

/** Mocks the leaderboard: submit_run answers rank 3; today's board includes the group once submitted. */
async function mockBoard(page: Page, state: { submitted: string | null }) {
  return mockSupabase(page, {
    submit_run: (args) => {
      state.submitted = String(args.p_group_name);
      return { body: { id: ROW_ID, rank_today: 3 } };
    },
    leaderboard_today: () => ({
      body: [
        boardRow(1, 101, 'Swift Kingfisher', 1100),
        boardRow(2, 102, 'Bold Merlion', 950),
        ...(state.submitted ? [boardRow(3, ROW_ID, state.submitted, 800)] : []),
      ],
    }),
    run_rank: () => ({ body: [] }),
  });
}

async function createGroup(page: Page, name: string, nick: string) {
  await page.goto('/?debug=1');
  await page.getByRole('button', { name: 'Create group' }).click();
  await expect(page.getByRole('heading', { name: 'Create a group' })).toBeVisible();
  // Generated names are offered first; type our own so the test knows it.
  await expect(page.getByTestId('name-options').getByRole('radio')).toHaveCount(3);
  await page.getByRole('button', { name: /Type our own name/ }).click();
  await page.getByLabel('Group name').fill(name);
  await page.getByLabel('Your nickname').fill(nick);
  await page.getByRole('button', { name: 'Create group' }).click();
  // Connecting to the relay (and loading the lobby screen) can take a while on a busy CI runner.
  await expect(page.getByTestId('group-name')).toHaveText(name, { timeout: 15_000 });
  const code = (await page.getByTestId('group-code').textContent())!.trim();
  expect(code).toMatch(/^[A-HJ-NP-Z2-9]{4}$/);
  return code;
}

async function joinByLink(page: Page, code: string, nick: string) {
  // The lobby QR opens ?join=CODE: Join with the code filled in.
  await page.goto(`/?debug=1&join=${code}`);
  await expect(page.getByLabel('Group code')).toHaveValue(code);
  await page.getByLabel('Your nickname').fill(nick);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page.getByTestId('lobby-waiting')).toBeVisible({ timeout: 15_000 });
}

async function joinByTyping(page: Page, code: string, nick: string) {
  await page.goto('/?debug=1');
  await page.getByRole('button', { name: 'Join group' }).click();
  await page.getByLabel('Group code').fill(code.toLowerCase());
  await page.getByLabel('Your nickname').fill(nick);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page.getByTestId('lobby-waiting')).toBeVisible({ timeout: 15_000 });
}

async function debugJump(page: Page, label: string) {
  await page.locator('.debug-panel summary').click();
  await page.locator('.debug-panel').getByRole('button', { name: label, exact: true }).click();
  await page.locator('.debug-panel summary').click();
}

/**
 * Group Live Ops: the main phone has no routing buttons; each incident is routed from the support
 * phone holding that specialisation, and "all hands" calls need a tap on every phone.
 */
async function playLiveOps(main: Page, supports: Page[]) {
  await expect(main.locator('button[data-team]')).toHaveCount(0);
  let allHands = 0;
  for (let guard = 0; guard < 20; guard++) {
    const card = main.getByTestId('incident');
    if (!(await card.count())) return allHands;
    const text = await card.textContent();
    if (await card.getAttribute('data-all-hands')) {
      allHands++;
      for (const p of supports) await p.getByTestId('support-all-hands').click();
      await main.getByTestId('all-hands-ready').click();
    } else {
      const team = (await card.getAttribute('data-team'))!;
      const holder = [];
      for (const p of supports) if ((await p.getByTestId('support-routing').getAttribute('data-teams'))!.split(',').includes(team)) holder.push(p);
      expect(holder).toHaveLength(1);
      await holder[0]!.locator(`button[data-team="${team}"]`).click();
    }
    await expect(main.getByTestId('feedback')).toContainText('✓');
    await expect(main.getByTestId('incident').filter({ hasText: text ?? '' })).toHaveCount(0, { timeout: 10_000 });
  }
  return allHands;
}

/** Stage 1 cards played right via the debug-only data attributes (as in stage1.spec.ts). */
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

const uniqueName = (prefix: string) => `${prefix} ${Math.floor(1000 + Math.random() * 9000)}`;

test('3 phones: create, join by QR link and by code, reorder, play a group run, rank on Today’s board', async ({ browser }, info) => {
  test.setTimeout(180_000);
  const board = { submitted: null as string | null };
  const ann = await phone(browser, info);
  const ben = await phone(browser, info);
  const cai = await phone(browser, info);
  const calls = await mockBoard(ann, board);
  await mockBoard(ben, board);
  await mockBoard(cai, board);

  const name = uniqueName('Relay');
  const code = await createGroup(ann, name, 'Ann');
  // Only the leader can start, and only with 2+ players.
  await expect(ann.getByText('You need at least 2 players to start.')).toBeVisible();
  await joinByLink(ben, code, 'Ben');
  await joinByTyping(cai, code, 'Cai');

  const members = ann.getByTestId('member');
  await expect(members).toHaveCount(3);
  await expect(members.nth(0)).toContainText('Ann (you)');
  await expect(members.nth(2)).toContainText('Cai');
  // Nicknames reach teammates through presence only.
  await expect(ben.getByTestId('member').nth(0)).toContainText('Ann');

  // The host reorders: Cai moves to the top, so Cai is P1, the IC (team leader): the prologue,
  // stage 3 and the finale. Stages 1–4 rotate from P2: Ann 1 and 4, Ben 2.
  await ann.getByRole('button', { name: 'Move Cai up' }).click();
  await ann.getByRole('button', { name: 'Move Cai up' }).click();
  const list = ben.getByTestId('member');
  await expect(list.nth(0)).toContainText('Cai');
  await expect(list.nth(0)).toContainText('Leader');
  await expect(list.nth(0)).toContainText('stage 3 and the finale');
  await expect(list.nth(1)).toContainText('Ann');
  await expect(list.nth(1)).toContainText('host');
  await expect(list.nth(1)).toContainText('stage 1, 4');
  await expect(list.nth(2)).toContainText('stage 2');
  // Members have no reorder or start controls.
  await expect(ben.getByRole('button', { name: /Move .* up/ })).toHaveCount(0);
  await expect(ben.getByRole('button', { name: 'Start' })).toHaveCount(0);

  await ann.getByRole('button', { name: 'Start' }).click();

  // Cai (P1) holds the main phone for the prologue and stage 1; the others support.
  await expect(cai.getByTestId('prologue-heading')).toBeVisible();
  for (const p of [ann, ben]) {
    await expect(p.getByTestId('support-screen')).toHaveAttribute('data-stage', '0');
    await expect(p.getByTestId('supporting')).toContainText("You're supporting Cai");
  }
  await cai.getByRole('button', { name: 'Start the mission' }).click();
  // Stage 1 belongs to Ann (P2); Cai and Ben support.
  await expect(ann.getByTestId('support-screen')).toHaveCount(0);
  for (const p of [cai, ben]) await expect(p.getByTestId('support-screen')).toHaveAttribute('data-stage', '1');
  // Stage 1's three support cards are dealt between the two support phones (§3.5.2).
  const cards = [];
  for (const p of [cai, ben]) cards.push(...(await p.getByTestId('support-cards').getAttribute('data-cards'))!.split(','));
  expect(cards.sort()).toEqual(['duplicates', 'fixKit', 'rulebook']);

  // Debug jump to the finale: it goes to the IC (Cai); the host's phone (Ann) still submits.
  await debugJump(ann, 'F');
  await expect(cai.getByRole('heading', { name: 'Mission live' })).toBeVisible();
  for (const p of [ann, ben]) {
    await expect(p.getByTestId('support-screen')).toHaveAttribute('data-stage', '5');
    await expect(p.getByTestId('supporting')).toContainText("You're supporting Cai");
  }

  await cai.getByRole('button', { name: 'Go live' }).click();
  await cai.getByRole('button', { name: 'Start shift' }).click();
  // Every specialisation is dealt to exactly one support phone.
  const teams = [];
  for (const p of [ann, ben]) teams.push(...(await p.getByTestId('support-routing').getAttribute('data-teams'))!.split(','));
  expect(teams.sort()).toEqual(['ai', 'cloud', 'data', 'logic']);
  expect(await playLiveOps(cai, [ann, ben])).toBe(2);

  // Everyone reaches the debrief and sees the shared rank instead of the solo note.
  for (const p of [ann, ben, cai]) {
    await expect(p.getByRole('heading', { name: 'Mission complete' })).toBeVisible();
    await expect(p.getByTestId('group-rank')).toContainText("You're #3 today!");
    await expect(p.getByTestId('group-rank')).toContainText(`${name} · 3 players`);
    await expect(p.getByText(/Solo runs aren't ranked/)).toHaveCount(0);
  }
  // The end card still fits one 360×740 screen.
  await cai.setViewportSize({ width: 360, height: 740 });
  const box = (await cai.getByTestId('end-card').boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(740);

  // Submitted once, by the leader, with no nicknames (§3.5.4).
  const submits = calls.filter((c) => c.name === 'submit_run');
  expect(submits).toHaveLength(1);
  expect(submits[0]!.args).toMatchObject({ p_group_name: name, p_group_size: 3, p_mode: 'booth' });
  expect(JSON.stringify(submits[0]!.args)).not.toMatch(/Ann|Ben|Cai/);
  expect(board.submitted).toBe(name);

  // Today's board shows the group, highlighted as "Your group" on a teammate's phone too.
  await ben.getByRole('button', { name: 'Leaderboard' }).click();
  const own = ben.locator('[data-own]');
  await expect(own).toHaveCount(1);
  await expect(own).toContainText(name);
  await expect(own).toContainText('Your group');

  // Nicknames never land in localStorage except each device's own.
  const stored = await ben.evaluate(() => JSON.stringify(localStorage));
  expect(stored).not.toMatch(/Ann|Cai/);

  // Play again leaves the group.
  await ann.getByRole('button', { name: 'Play again' }).click();
  await expect(ann.getByRole('button', { name: 'Play solo' })).toBeVisible();
  for (const p of [ann, ben, cai]) await p.context().close();
});

test('rejoin after a reload lands on the current stage; joining closes at START', async ({ browser }, info) => {
  test.setTimeout(120_000);
  const board = { submitted: null as string | null };
  const ann = await phone(browser, info);
  const ben = await phone(browser, info);
  await mockBoard(ann, board);
  await mockBoard(ben, board);
  const name = uniqueName('Rejoin');
  const code = await createGroup(ann, name, 'Ann');
  await joinByLink(ben, code, 'Ben');

  // The booth screen lists groups playing now (presence only, nothing stored).
  const host = await phone(browser, info);
  await mockBoard(host, board);
  await host.goto('/host');
  const listed = host.getByTestId('host-group').filter({ hasText: name });
  await expect(listed).toContainText('2 players');
  await expect(listed).toContainText('In the lobby');

  await ann.getByRole('button', { name: 'Start' }).click();
  await expect(listed).toContainText('Getting started');
  await expect(ben.getByTestId('support-screen')).toHaveAttribute('data-stage', '0');

  // A late player can't join a started group.
  const late = await phone(browser, info);
  await late.goto(`/?debug=1&join=${code}`);
  await late.getByLabel('Your nickname').fill('Late');
  await late.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(late.getByTestId('join-status')).toHaveText('That group has already started.', { timeout: 15_000 });

  // Ben reloads: Home offers "Back to …"; rejoining shows the current stage.
  await ben.reload();
  await ben.getByRole('button', { name: `Back to ${name}` }).click();
  await expect(ben.getByTestId('support-screen')).toHaveAttribute('data-stage', '0');
  // The IC (Ann) starts the mission; stage 1 belongs to Ben (P2).
  await ann.getByRole('button', { name: 'Start the mission' }).click();
  await expect(ann.getByTestId('support-screen')).toHaveAttribute('data-stage', '1');
  await expect(ann.getByTestId('supporting')).toContainText("You're supporting Ben");

  // The main phone reloads too and carries on as the main phone, at stage 1.
  await ben.reload();
  await ben.getByRole('button', { name: `Back to ${name}` }).click();
  await expect(ben.getByTestId('support-screen')).toHaveCount(0);
  await expect(ben.locator('.debug-panel')).toContainText('stage 1');
  await debugJump(ben, '2');
  // Stage 2 belongs to Ann (rotation[2 % 2]).
  await expect(ben.getByTestId('support-screen')).toHaveAttribute('data-stage', '2');
  await expect(ben.getByTestId('supporting')).toContainText("You're supporting Ann");
  await expect(ann.getByTestId('support-screen')).toHaveCount(0);

  // Leaving from Home ends the group on this phone.
  await ben.goto('/?debug=1');
  await ben.getByRole('button', { name: 'Leave group' }).click();
  await expect(ben.getByRole('button', { name: 'Create group' })).toBeVisible();
  for (const p of [ann, ben, late, host]) await p.context().close();
});

test('main phone drops: teammates pause, then the next player takes over after 20 s', async ({ browser }, info) => {
  test.setTimeout(90_000);
  const board = { submitted: null as string | null };
  const ann = await phone(browser, info);
  const ben = await phone(browser, info);
  await mockBoard(ann, board);
  await mockBoard(ben, board);
  const code = await createGroup(ann, uniqueName('Drop'), 'Ann');
  await joinByLink(ben, code, 'Ben');
  await ann.getByRole('button', { name: 'Start' }).click();
  await ann.getByRole('button', { name: 'Start the mission' }).click();
  // Stage 1 belongs to Ben (P2); Ann supports.
  await expect(ann.getByTestId('support-screen')).toHaveAttribute('data-stage', '1');

  await ben.context().close();
  await expect(ann.getByTestId('paused')).toContainText("Waiting for Ben's phone");
  // Ann is next in the rotation: she takes the main phone and resumes stage 1.
  await expect(ann.getByTestId('support-screen')).toHaveCount(0, { timeout: 30_000 });
  await expect(ann.locator('.debug-panel')).toContainText('stage 1');
  await ann.context().close();
});

test('?fakePeers=2: bots join the lobby, this phone plays main and can preview a support view', async ({ page }) => {
  await page.goto('/?debug=1&fakePeers=2');
  await page.getByRole('button', { name: 'Create group' }).click();
  await page.getByLabel('Your nickname').fill('Dev');
  await page.getByRole('button', { name: 'Create group' }).click();
  await expect(page.getByTestId('member')).toHaveCount(3);
  await expect(page.getByTestId('member').nth(1)).toContainText('Bot Ana');
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByTestId('prologue-heading')).toBeVisible();
  await page.getByRole('button', { name: 'Support 1', exact: true }).click();
  await expect(page.getByTestId('support-screen')).toBeVisible();
  await expect(page.getByTestId('supporting')).toContainText("You're supporting Dev");
  await page.getByRole('button', { name: 'Main', exact: true }).click();
  await expect(page.getByTestId('prologue-heading')).toBeVisible();
  // Cut the connection: the reconnecting pill shows; play carries on.
  await page.getByRole('button', { name: 'Go offline' }).click();
  await expect(page.getByTestId('reconnecting')).toBeVisible();
  await page.getByRole('button', { name: 'Go online' }).click();
  await expect(page.getByTestId('reconnecting')).toHaveCount(0);
});

test('hand-off: the next main player is named and taps Ready on their own phone', async ({ browser }, info) => {
  test.setTimeout(150_000);
  const board = { submitted: null as string | null };
  const ann = await phone(browser, info);
  const ben = await phone(browser, info);
  await mockBoard(ann, board);
  await mockBoard(ben, board);
  const code = await createGroup(ann, uniqueName('Hand'), 'Ann');
  await joinByLink(ben, code, 'Ben');
  await ann.getByRole('button', { name: 'Start' }).click();
  await ann.getByRole('button', { name: 'Start the mission' }).click();
  // Stage 1 belongs to Ben (P2).
  await ben.getByRole('button', { name: 'Start sorting' }).click();
  for (const level of ['Tutorial', 'Keep or Trash', 'Keep, Fix or Trash']) {
    await expect(ben.getByRole('heading', { name: level, level: 1 })).toBeVisible();
    await ben.getByRole('button', { name: 'Start', exact: true }).click();
    await playCards(ben);
  }
  await ben.getByRole('button', { name: 'Continue' }).click();
  await ben.getByRole('button', { name: /already/i }).click();
  await ben.getByRole('button', { name: 'Continue' }).click();
  await ben.getByRole('button', { name: 'Continue' }).click();
  // Ben's hand-off card names Ann; Ann's phone offers Ready.
  await expect(ben.getByText(/Ann/).first()).toBeVisible();
  await expect(ann.getByTestId('up-next')).toBeVisible();
  await ann.getByTestId('up-next').getByRole('button').click();
  // Ann now holds the main phone for stage 2; Ben supports.
  await expect(ann.getByTestId('support-screen')).toHaveCount(0);
  await expect(ben.getByTestId('support-screen')).toHaveAttribute('data-stage', '2');
  for (const p of [ann, ben]) await p.context().close();
});

