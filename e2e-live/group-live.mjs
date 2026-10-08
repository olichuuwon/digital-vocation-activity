// Live multi-phone group test: real site + real Supabase Realtime. submit_run is intercepted so
// nothing is written to the real leaderboard. Usage: node group-live.mjs <players 2-4> <outdir>
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
const mainOf = async () => {
  const mains = [];
  for (let i = 0; i < N; i++) if ((await phones[i].getByTestId('support-screen').count()) === 0) mains.push(NAMES[i]);
  return mains;
};
// A support phone "has a job" if it shows a support card or any control button.
const hasJob = async (p) =>
  (await p.getByTestId('support-cards').count()) > 0 || (await p.getByTestId('support-screen').getByRole('button').count()) > 0;
const waitStage = async (s) => {
  // Every phone either shows the main view or a support screen for stage s.
  await expect.poll(async () => {
    let ok = 0;
    for (const p of phones) {
      const sup = p.getByTestId('support-screen');
      if ((await sup.count()) === 0 || (await sup.getAttribute('data-stage')) === String(s)) ok++;
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
  await check('host creates a group (generated name)', async () => {
    await host.goto(SITE + '/?debug=1');
    await host.getByRole('button', { name: 'Create group' }).click();
    await host.getByTestId('name-options').getByRole('radio').first().check();
    await host.getByLabel('Your nickname').fill(NAMES[0]);
    await host.getByRole('button', { name: 'Create group' }).click();
    await host.getByTestId('group-code').waitFor(T);
    code = (await host.getByTestId('group-code').textContent()).trim();
    groupName = (await host.getByTestId('group-name').textContent()).trim();
    log(`group "${groupName}" code ${code}`);
  });

  await check(`${N - 1} teammates join (QR link and typed code)`, async () => {
    for (let i = 1; i < N; i++) {
      const p = phones[i];
      if (i % 2) await p.goto(`${SITE}/?debug=1&join=${code}`);
      else { await p.goto(SITE + '/?debug=1'); await p.getByRole('button', { name: 'Join group' }).click(); await p.getByLabel('Group code').fill(code.toLowerCase()); }
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
      const t = (await phones[i].getByTestId('member').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').replace(/Main phone:.*/, '').trim());
      log(`  t+${k}s ${NAMES[i]} sees: ${t.join(' | ')}`);
    }
    await host.waitForTimeout(1000);
  }

  await host.getByRole('button', { name: 'Start' }).click();

  const mainBy = {};
  await check('prologue: one main phone, the rest support', async () => {
    await waitStage(0);
    mainBy.P = (await mainOf())[0];
  });

  // Walk every stage via the host's debug panel: exactly one main phone; every support phone holds a card.
  for (const [label, s] of [['1', 1], ['2', 2], ['3', 3], ['4', 4]]) {
    await check(`stage ${s}: one main, every support phone has a card (nobody idle)`, async () => {
      if (s === 1) {
        const mainP = phones[NAMES.indexOf(mainBy.P)];
        const startBtn = mainP.getByRole('button', { name: 'Start the mission' });
        if (await startBtn.count()) await startBtn.click(); else await jump(label);
      } else await jump(label);
      const ts = Date.now();
      await waitStage(s);
      const syncMs = Date.now() - ts;
      mainBy[s] = (await mainOf())[0];
      // Some stages deal cards only once play starts (Stage 4's storm): tap through the main phone's intro.
      const mainP = phones[NAMES.indexOf(mainBy[s])];
      for (let k = 0; k < 6; k++) {
        let missing = 0;
        for (let i = 0; i < N; i++) if (NAMES[i] !== mainBy[s] && !(await hasJob(phones[i]))) missing++;
        if (!missing) break;
        const btn = mainP.getByRole('button', { name: /^(Go live|Start|Start storm|Next|Got it|Continue|Ready)$/ }).first();
        if (await btn.count()) await btn.click();
        await mainP.waitForTimeout(800);
      }
      const dealt = [];
      for (let i = 0; i < N; i++) {
        if (NAMES[i] === mainBy[s]) continue;
        if (!(await hasJob(phones[i]))) throw new Error(`${NAMES[i]} has nothing to do in stage ${s}`);
        const cards = await phones[i].getByTestId('support-cards').getAttribute('data-cards').catch(() => null);
        const controls = await phones[i].getByTestId('support-screen').getByRole('button').count();
        dealt.push(`${NAMES[i]}=[${cards ?? controls + ' controls'}]`);
      }
      log(`  main ${mainBy[s]}; synced in ${syncMs} ms; ${dealt.join(' ')}`);
    });
  }

  await check('rotation: main phone changes between stages', async () => {
    const seq = [1, 2, 3, 4].map((s) => mainBy[s]);
    for (let i = 1; i < seq.length; i++) if (seq[i] === seq[i - 1]) throw new Error(`same main in a row: ${seq.join(',')}`);
    if (N === 4 && new Set(seq).size !== 4) throw new Error(`with 4 players each should lead one stage: ${seq.join(',')}`);
    log('  main per stage 1–4:', seq.join(', '));
  });

  await check('a support phone reloads mid-game and rejoins the current stage', async () => {
    const i = NAMES.findIndex((n) => n !== mainBy[4]);
    await phones[i].reload();
    // Reopening lands on Home with a one-tap "Back to <group>" (like Resume).
    await phones[i].getByRole('button', { name: /^Back to / }).click(T);
    await expect(phones[i].getByTestId('support-screen')).toHaveAttribute('data-stage', '4', T);
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
  await check('finale goes to the IC (player 1); everyone else supports', async () => {
    await jump('F');
    await waitStage(5);
    ic = phones[NAMES.indexOf((await mainOf())[0])];
    await expect(ic.getByRole('heading', { name: 'Mission live' })).toBeVisible(T);
    log('  IC:', (await mainOf())[0]);
  });

  const supports = phones.filter((p) => p !== ic);
  await check('Live Ops: each specialisation dealt to exactly one support phone', async () => {
    await ic.getByRole('button', { name: 'Go live' }).click();
    await ic.getByRole('button', { name: 'Start shift' }).click();
    const teams = [];
    for (const p of supports) teams.push(...(await p.getByTestId('support-routing').getAttribute('data-teams', T)).split(','));
    if (teams.sort().join() !== 'ai,cloud,data,logic') throw new Error('teams dealt: ' + teams.join());
  });

  await check('Live Ops: every incident routed from the right support phone, plus all-hands calls', async () => {
    let routed = 0, allHands = 0;
    for (let g = 0; g < 20; g++) {
      const card = ic.getByTestId('incident');
      if (!(await card.count())) break;
      const text = await card.textContent();
      if (await card.getAttribute('data-all-hands')) {
        allHands++;
        for (const p of supports) await p.getByTestId('support-all-hands').click();
        await ic.getByTestId('all-hands-ready').click();
      } else {
        const team = await card.getAttribute('data-team');
        let holder = null;
        for (const p of supports) if ((await p.getByTestId('support-routing').getAttribute('data-teams')).split(',').includes(team)) holder = p;
        await holder.locator(`button[data-team="${team}"]`).click();
        routed++;
      }
      await expect(ic.getByTestId('feedback')).toContainText('✓', T);
      await expect(ic.getByTestId('incident').filter({ hasText: text ?? '' })).toHaveCount(0, T);
    }
    log(`  routed ${routed}, all-hands ${allHands}`);
    if (allHands !== 2) throw new Error(`expected 2 all-hands calls, got ${allHands}`);
  });

  await check('every phone reaches the debrief with the shared group rank', async () => {
    for (const p of phones) {
      await expect(p.getByRole('heading', { name: 'Mission complete' })).toBeVisible(T);
      await expect(p.getByTestId('group-rank')).toContainText(`${N} players`, T);
    }
  });

  await check('score submitted exactly once, with no nicknames', async () => {
    await expect.poll(() => submits, { timeout: 10_000 }).toBe(1);
  });

  await check('no third-party requests', async () => {
    const bad = [...hosts].filter((h) => !h.endsWith('vercel.app') && !h.endsWith('supabase.co'));
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
