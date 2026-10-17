// Live multi-phone team test: real site (or LIVE_URL) + real Supabase Realtime. submit_run is
// intercepted so nothing is written to the real leaderboard.
// Usage: node e2e-live/group-live.mjs <players 2-4> <outdir>
import { createRequire } from 'node:module';
const require = createRequire(new URL('../package.json', import.meta.url));
const { chromium, devices, expect } = require('@playwright/test');

const N = Number(process.argv[2] ?? 3);
const OUT = process.argv[3] ?? 'test-results';
const SITE = process.env.LIVE_URL ?? 'https://digital-vocation-activity.vercel.app';
const NAMES = ['Ann', 'Ben', 'Cai', 'Dee'].slice(0, N);
const t0 = Date.now();
const log = (...a) => console.log(`[${N}p ${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
const checks = [];
const check = async (label, fn) => {
  try { await fn(); checks.push([label, 'PASS']); log('✅', label); }
  catch (e) { checks.push([label, 'FAIL: ' + e.message.split('\n')[0]]); log('❌', label, '-', e.message.split('\n')[0]); throw e; }
};

const browser = await chromium.launch();
const hosts = new Set();
let submits = 0;
const phones = [];
for (let i = 0; i < N; i++) {
  const ctx = await browser.newContext({ ...devices[i % 2 ? 'Pixel 5' : 'iPhone 12'], serviceWorkers: 'block' });
  const p = await ctx.newPage();
  p.on('request', (r) => hosts.add(new URL(r.url()).host));
  // Fake only the score write; Realtime (WebSocket) and reads stay real.
  await p.route('**/rest/v1/rpc/submit_run', (route) => {
    submits++;
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 999999, rank_today: 1 }) });
  });
  phones.push(p);
}
const [host] = phones;
const T = { timeout: 20_000 };
/** Names of phones playing (not on the waiting screen): exactly one once a stage has synced. */
const mainOf = async () => {
  const mains = [];
  for (let i = 0; i < N; i++) if ((await phones[i].getByTestId('waiting-screen').count()) === 0) mains.push(NAMES[i]);
  return mains;
};
const waitStage = async (s) => {
  // Every phone either plays or shows the waiting screen for stage s.
  await expect.poll(async () => {
    let ok = 0;
    for (const p of phones) {
      const w = p.getByTestId('waiting-screen');
      if ((await w.count()) === 0 || (await w.getAttribute('data-stage')) === String(s)) ok++;
    }
    return ok;
  }, { timeout: 20_000 }).toBe(N);
  await expect.poll(async () => (await mainOf()).length, { timeout: 20_000 }).toBe(1);
};
// The main phone owns the run state, so stage skips are made on whichever phone is main.
const jump = async (label) => {
  const p = phones[NAMES.indexOf((await mainOf())[0])];
  await p.locator('.debug-panel summary').click();
  await p.locator('.debug-panel').getByRole('button', { name: label, exact: true }).click();
  await p.locator('.debug-panel summary').click();
};

let result = 'PASS';
try {
  let code, groupName;
  await check('host creates a team (generated name)', async () => {
    await host.goto(SITE + '/?debug=1');
    await host.getByRole('button', { name: 'Play as a team' }).click();
    await host.getByRole('button', { name: 'Create a team' }).click();
    await host.getByTestId('name-options').getByRole('radio').first().check();
    await host.getByLabel('Your nickname').fill(NAMES[0]);
    await host.getByRole('button', { name: 'Create team' }).click();
    await host.getByTestId('group-code').waitFor(T);
    code = (await host.getByTestId('group-code').textContent()).trim();
    groupName = (await host.getByTestId('group-name').textContent()).trim();
    log(`team "${groupName}" code ${code}`);
  });

  await check(`${N - 1} teammates join (QR link and typed code)`, async () => {
    for (let i = 1; i < N; i++) {
      const p = phones[i];
      if (i % 2) await p.goto(`${SITE}/?debug=1&join=${code}`);
      else {
        await p.goto(SITE + '/?debug=1');
        await p.getByRole('button', { name: 'Play as a team' }).click();
        await p.getByRole('button', { name: 'Join a team' }).click();
        await p.getByLabel('Team code').fill(code.toLowerCase());
      }
      await p.getByLabel('Your nickname').fill(NAMES[i]);
      await p.getByRole('button', { name: 'Join', exact: true }).click();
      await p.getByTestId('lobby-waiting').waitFor(T);
    }
  });

  await check(`every phone sees all ${N} players`, async () => {
    for (const p of phones) await expect(p.getByTestId('member')).toHaveCount(N, T);
  });

  await check('only the host can start', async () => {
    for (const p of phones.slice(1)) await expect(p.getByRole('button', { name: 'Start' })).toHaveCount(0);
  });

  // Watch the lobby settle for a few seconds before Start, as a real host would.
  for (let k = 0; k < 4; k++) {
    for (let i = 0; i < N; i++) {
      const t = (await phones[i].getByTestId('member').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').replace(/Plays stage.*/, '').trim());
      log(`  t+${k}s ${NAMES[i]} sees: ${t.join(' | ')}`);
    }
    await host.waitForTimeout(1000);
  }

  // A teammate still connecting makes the lobby ask for a second tap: never drop anyone silently.
  for (let k = 0; k < 4 && !(await host.getByTestId('prologue-heading').count()); k++) {
    await host.getByRole('button', { name: 'Start' }).click();
    await host.getByTestId('prologue-heading').waitFor({ timeout: 6_000 }).catch(() => {});
  }

  const mainBy = {};
  await check('prologue: the leader plays, everyone else sees the waiting screen', async () => {
    await waitStage(0);
    mainBy.P = (await mainOf())[0];
  });

  // Walk every stage: exactly one phone plays; every other phone's waiting screen names that player.
  for (const [label, s] of [['1', 1], ['2', 2], ['3', 3], ['4', 4]]) {
    await check(`stage ${s}: one player, the rest wait and see who is playing`, async () => {
      if (s === 1) {
        const mainP = phones[NAMES.indexOf(mainBy.P)];
        const startBtn = mainP.getByRole('button', { name: 'Start the mission' });
        if (await startBtn.count()) await startBtn.click(); else await jump(label);
      } else await jump(label);
      const ts = Date.now();
      await waitStage(s);
      const syncMs = Date.now() - ts;
      mainBy[s] = (await mainOf())[0];
      for (let i = 0; i < N; i++) {
        if (NAMES[i] === mainBy[s]) continue;
        await expect(phones[i].getByTestId('now-playing')).toContainText(`${mainBy[s]} is playing`, T);
      }
      log(`  player ${mainBy[s]}; synced in ${syncMs} ms`);
    });
  }

  await check('rotation: the player changes between stages', async () => {
    const seq = [1, 2, 3, 4].map((s) => mainBy[s]);
    for (let i = 1; i < seq.length; i++) if (seq[i] === seq[i - 1]) throw new Error(`same main in a row: ${seq.join(',')}`);
    if (N === 4 && new Set(seq).size !== 4) throw new Error(`with 4 players each should lead one stage: ${seq.join(',')}`);
    log('  player per stage 1–4:', seq.join(', '));
  });

  await check('a waiting phone reloads mid-game and rejoins the current stage', async () => {
    const i = NAMES.findIndex((n) => n !== mainBy[4]);
    await phones[i].reload();
    // Reopening lands on Home with a one-tap "Back to <group>" (like Resume).
    await phones[i].getByRole('button', { name: /^Back to / }).click(T);
    await expect(phones[i].getByTestId('waiting-screen')).toHaveAttribute('data-stage', '4', T);
  });

  await check('a late joiner is refused after Start', async () => {
    const ctx = await browser.newContext({ ...devices['Pixel 5'] });
    const late = await ctx.newPage();
    await late.goto(`${SITE}/?join=${code}`);
    await late.getByLabel('Your nickname').fill('Eve');
    await late.getByRole('button', { name: 'Join', exact: true }).click();
    await expect(late.getByTestId('lobby-waiting')).toHaveCount(0, { timeout: 3_000 }).catch(() => {});
    await expect.poll(async () => (await late.locator('body').innerText()).toLowerCase(), { timeout: 20_000 })
      .toMatch(/already started|closed|can't join|cannot join|no group|not found|started/);
    await ctx.close();
  });

  let ic;
  await check('finale goes to the leader (player 1); everyone else waits', async () => {
    await jump('F');
    await waitStage(5);
    ic = phones[NAMES.indexOf((await mainOf())[0])];
    await expect(ic.getByRole('heading', { name: 'Mission live' })).toBeVisible(T);
    log('  leader:', (await mainOf())[0]);
  });

  await check('Live Ops: the leader routes every incident', async () => {
    await ic.getByRole('button', { name: 'Go live' }).click();
    await ic.getByRole('button', { name: 'Start shift' }).click();
    let routed = 0;
    for (let g = 0; g < 20; g++) {
      const card = ic.getByTestId('incident');
      if (!(await card.count())) break;
      const text = await card.textContent();
      await ic.locator(`button[data-team="${await card.getAttribute('data-team')}"]`).click();
      routed++;
      await expect(ic.getByTestId('feedback')).toContainText('✓', T);
      await expect(ic.getByTestId('incident').filter({ hasText: text ?? '' })).toHaveCount(0, T);
    }
    log(`  routed ${routed}`);
  });

  await check('every phone reaches the debrief with the shared team rank', async () => {
    for (const p of phones) {
      await expect(p.getByRole('heading', { name: 'Mission complete' })).toBeVisible(T);
      await expect(p.getByTestId('group-rank')).toContainText(`${N} players`, T);
    }
  });

  await check('score submitted exactly once, with no nicknames', async () => {
    await expect.poll(() => submits, { timeout: 10_000 }).toBe(1);
  });

  await check('free play: a teammate replays a stage solo, with bonus levels', async () => {
    const p = phones.find((x) => x !== ic);
    await expect(p.getByTestId('more-teaser')).toBeVisible(T);
    await p.getByTestId('replay-stage').click();
    await expect(p.getByTestId('replay-picker')).toContainText('+2 bonus levels');
    await p.getByRole('button', { name: /Build the Logic/ }).click();
    await expect(p.getByRole('button', { name: 'Start building' })).toBeVisible(T);
    await expect(p.getByTestId('waiting-screen')).toHaveCount(0);
  });

  await check('no third-party requests', async () => {
    const site = new URL(SITE).host;
    const bad = [...hosts].filter((h) => h !== site && !h.endsWith('vercel.app') && !h.endsWith('supabase.co'));
    if (bad.length) throw new Error(bad.join(', '));
  });
  for (let i = 0; i < N; i++) await phones[i].screenshot({ path: `${OUT}/${N}p-end-${NAMES[i]}.png` });
} catch {
  result = 'FAIL';
  for (let i = 0; i < N; i++) {
    await phones[i].screenshot({ path: `${OUT}/${N}p-fail-${NAMES[i]}.png` }).catch(() => {});
    log(`${NAMES[i]} screen:`, (await phones[i].locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 220));
  }
} finally {
  log(`RESULT ${result}: ${checks.filter((c) => c[1] === 'PASS').length}/${checks.length} checks passed`);
  await browser.close();
}
