// Captures the screenshots in docs/GAME_FLOWS.md: solo, replays with bonus levels, and teams
// of 2, 3 and 4 phones. Uses real Supabase Realtime for teams; submit_run is intercepted, so
// nothing reaches the real leaderboard.
//
// Usage (against a local build that has .env.local):
//   npm run build && npx vite preview --port 4173 &
//   LIVE_URL=http://localhost:4173 node e2e-live/capture-flows.mjs [solo|stage3|replay|board|2|3|4|drop ...]
// Without LIVE_URL it runs against the deployed site.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const require = createRequire(new URL('../package.json', import.meta.url));
const { chromium, expect } = require('@playwright/test');

const SITE = process.env.LIVE_URL ?? 'https://digital-vocation-activity.vercel.app';
const OUT = new URL('../docs/flows/', import.meta.url).pathname;
const RAW = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-it-flows-'));
fs.mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2);
const want = (k) => !only.length || only.includes(k);
const log = (...a) => console.log(...a);

const browser = await chromium.launch();
const PHONE = { viewport: { width: 360, height: 740 }, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true, serviceWorkers: 'block', reducedMotion: 'reduce' };

async function newPhone() {
  const ctx = await browser.newContext(PHONE);
  const p = await ctx.newPage();
  await p.route('**/rest/v1/rpc/submit_run', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"id":999999,"rank_today":2}' }));
  return p;
}

/** Screenshot one phone (debug panel and toasts hidden, so they never cover the screen). */
async function shot(p, name) {
  await p.waitForTimeout(500);
  const css = await p.addStyleTag({ content: '.debug-panel, [class*="toastHost"] { display: none !important; }' });
  const file = `${RAW}/${name}.png`;
  await p.screenshot({ path: file });
  await css.evaluate((el) => el.remove());
  return file;
}

/** Side-by-side image of several phones with captions, rendered by the browser. */
async function strip(name, items) {
  const page = await browser.newPage({ viewport: { width: 300 * items.length + 40, height: 900 }, deviceScaleFactor: 1 });
  const figs = items
    .map(({ file, label }) => `<figure><figcaption>${label}</figcaption><img src="data:image/png;base64,${fs.readFileSync(file).toString('base64')}"></figure>`)
    .join('');
  await page.setContent(`<html><body style="margin:0;background:#e9edf2;font:600 15px system-ui"><div id="w" style="padding:16px;display:inline-flex;gap:16px;align-items:flex-start">
    <style>figure{margin:0;width:280px}img{width:280px;border-radius:14px;box-shadow:0 2px 10px #0003;display:block}figcaption{margin:0 0 8px;text-align:center;color:#14181f;min-height:2.6em}</style>${figs}</div></body></html>`);
  await page.locator('#w').screenshot({ path: `${OUT}${name}.png` });
  await page.close();
  log('  saved', `docs/flows/${name}.png`);
}

const click = async (p, name) => {
  await p.getByRole('button', { name, exact: typeof name === 'string' }).first().click();
  await p.waitForTimeout(400);
};
const gotIt = async (p) => {
  const b = p.getByRole('button', { name: 'Got it' });
  if (await b.count()) await b.click();
};
/** Debug panel jump (stage number, or F for the finale). */
async function jump(p, label) {
  await p.locator('.debug-panel summary').click();
  await p.locator('.debug-panel').getByRole('button', { name: label, exact: true }).click();
  await p.locator('.debug-panel summary').click();
  await p.waitForTimeout(800);
}

/** Plays Stage 1 cards right with the debug answer attributes; optional mistakes and a capture. */
async function playCards(p, { wrong = 0, onCard } = {}) {
  for (let g = 0; g < 20; g++) {
    const card = p.getByTestId('record-card');
    if (!(await card.count())) return;
    await gotIt(p);
    const st = await card.getAttribute('data-status');
    const id = await card.getAttribute('data-id');
    if (onCard) await onCard(g);
    if (wrong > 0) {
      wrong--;
      await p.getByRole('button', { name: st === 'valid' ? 'Trash' : 'Keep', exact: true }).click();
    } else if (st === 'fixable') {
      const fix = Number(await card.getAttribute('data-fix'));
      await p.getByRole('button', { name: 'Fix', exact: true }).click();
      await p.locator('section[aria-labelledby="fix-heading"] button').nth(fix).click();
    } else await p.getByRole('button', { name: st === 'valid' ? 'Keep' : 'Trash', exact: true }).click();
    await expect(p.locator(`[data-testid="record-card"][data-id="${id}"]`)).toHaveCount(0);
  }
}

/** Live Ops routed right with the debug data-team attribute. */
async function playLiveOps(p) {
  for (let g = 0; g < 20; g++) {
    const card = p.getByTestId('incident');
    if (!(await card.count())) return;
    const text = await card.textContent();
    await p.locator(`button[data-team="${await card.getAttribute('data-team')}"]`).click();
    await expect(p.getByTestId('incident').filter({ hasText: text ?? '' })).toHaveCount(0, { timeout: 10_000 });
  }
}

/** Stage 1 end: Reality Check → automate → stars → hand-off. Captures into `out` if given. */
async function finishStage1(p, out) {
  if (out) out.push({ file: await shot(p, 's1-reality'), label: 'Reality Check' });
  await click(p, 'Continue');
  if (out) out.push({ file: await shot(p, 's1-automate'), label: 'Pick a rule to automate' });
  await p.getByRole('button', { name: /blank field/i }).click();
  await click(p, 'Continue');
  if (out) out.push({ file: await shot(p, 's1-stars'), label: 'Stars + people reached' });
  await click(p, 'Continue');
}

// ------------------------------------------------------------------------------------------
// SOLO: the whole run on one phone
// ------------------------------------------------------------------------------------------
async function solo() {
  log('solo');
  const p = await newPhone();
  await p.goto(SITE + '/?debug=1');
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  const start = [{ file: await shot(p, 'solo-home'), label: '1. Home' }];
  await click(p, 'Play solo');
  start.push({ file: await shot(p, 'solo-prologue'), label: '2. Prologue (straight in)' });
  await click(p, 'Start the mission');
  start.push({ file: await shot(p, 's1-briefing'), label: '3. Stage 1 briefing (the hook)' });
  await click(p, 'Start sorting');
  start.push({ file: await shot(p, 's1-first'), label: '4. First card within seconds' });
  await strip('solo-start', start);

  const s1 = [];
  await playCards(p);
  s1.push({ file: await shot(p, 's1-intro'), label: 'Level 1 intro: one new rule' });
  await click(p, 'Start');
  await playCards(p, { wrong: 2, onCard: async (g) => g === 3 && s1.push({ file: await shot(p, 's1-counter'), label: 'Level 1: 💧 people reached' }) });
  await click(p, 'Start');
  await playCards(p, { onCard: async (g) => g === 1 && s1.push({ file: await shot(p, 's1-l2'), label: 'Level 2: Keep, Fix or Trash' }) });
  await strip('solo-stage1', s1);
  const end = [];
  await finishStage1(p, end);
  end.push({ file: await shot(p, 's1-next'), label: 'Straight on to Stage 2 (solo: no hand-off)' });
  await strip('solo-stage1-end', end);

  const steps = {
    2: ['Start labelling', 'Stage 2: Teach the Machine to See'],
    3: ['Start building', 'Stage 3: Build the Logic'],
    4: ['Launch the app', 'Stage 4: Keep It Alive'],
  };
  for (const [stage, [go, title]] of Object.entries(steps)) {
    await jump(p, stage);
    const st = [{ file: await shot(p, `s${stage}-briefing`), label: `${title}: briefing` }];
    await click(p, go);
    if (stage === '4') {
      st.push({ file: await shot(p, `s${stage}-intro`), label: 'Level intro' });
      await click(p, 'Start');
    }
    st.push({ file: await shot(p, `s${stage}-play`), label: stage === '4' ? 'Playing' : 'Tutorial, straight from the briefing' });
    await gotIt(p);
    await strip(`solo-stage${stage}`, st);
  }

  // The demo skipped most of stages 2–4, so give the finale a typical run's scores.
  await p.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('ship-it'));
    const r = saved.state.run;
    r.stage = 5;
    r.levelIndex = 0;
    r.scores.ai = { labelAccuracy: 0.85, earlyGuessBonus: 0.4, auditCatch: 0.6, modelAccuracy: 0.86 };
    r.scores.logic = { puzzlesSolved: 3, hintsUsed: 1, efficiency: 0.9, extraBlocks: 1 };
    r.scores.cloud = { manualUptime: 0.72, autoUptime: 0.98, costEfficiency: 0.9 };
    r.stars = { ...r.stars, ai: 2, logic: 2, cloud: 3 };
    localStorage.setItem('ship-it', JSON.stringify(saved));
  });
  await p.goto(SITE + '/?debug=1&stage=5');
  const f = [{ file: await shot(p, 'f-reveal'), label: 'Finale: your pipeline + how Live Ops works' }];
  await click(p, 'Start shift');
  f.push({ file: await shot(p, 'f-live'), label: 'Live Ops: route each incident' });
  await playLiveOps(p);
  await expect(p.getByRole('heading', { name: 'Mission complete' })).toBeVisible();
  f.push({ file: await shot(p, 'f-debrief'), label: 'Debrief card' });
  await p.getByTestId('more-teaser').scrollIntoViewIfNeeded();
  f.push({ file: await shot(p, 'f-more'), label: "🔓 There's more! (replays)" });
  await strip('solo-finale', f);
  await p.context().close();
}

// ------------------------------------------------------------------------------------------
// STAGE 3 GUIDED: step-by-step tutorial, the 💡 ghost after a failed run, the pre-placed If
// ------------------------------------------------------------------------------------------
const block = (p, name) => p.getByRole('group', { name: 'Blocks' }).getByRole('button', { name, exact: false });
async function runAndWait(p) {
  await p.getByRole('button', { name: /▶ Run/ }).click();
  await expect(p.getByRole('button', { name: /Running/ })).toHaveCount(0, { timeout: 15_000 });
}
async function stage3() {
  log('stage3');
  const p = await newPhone();
  await p.goto(SITE + '/?debug=1');
  await p.evaluate(() => localStorage.clear());
  await p.goto(SITE + '/?debug=1&stage=3');
  await click(p, 'Start building');
  const g = [{ file: await shot(p, 's3-guide-1'), label: 'Tutorial: tap the highlighted block' }];
  for (const b of ['Move forward', 'Turn right', 'Move forward', 'Drop supplies']) await block(p, b).click();
  g.push({ file: await shot(p, 's3-guide-run'), label: 'Program ready: tap ▶ Run' });
  await runAndWait(p);
  await click(p, 'Continue');
  await click(p, 'Start');
  await block(p, 'Turn left').click();
  await runAndWait(p);
  await p.waitForTimeout(2600);
  g.push({ file: await shot(p, 's3-ghost'), label: '1 failed run: 💡 tap the next step' });
  // Choose the Road, with the If block already in place.
  await p.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('ship-it'));
    saved.state.run.levelIndex = 3;
    localStorage.setItem('ship-it', JSON.stringify(saved));
  });
  await p.goto(SITE + '/?debug=1&stage=3');
  await click(p, 'Start');
  g.push({ file: await shot(p, 's3-if'), label: 'Choose the Road: If already placed' });
  await strip('solo-stage3-guided', g);
  await p.context().close();
}

// ------------------------------------------------------------------------------------------
// REPLAY: free play unlocks the bonus levels
// ------------------------------------------------------------------------------------------
async function replay() {
  log('replay');
  const p = await newPhone();
  // A finished run, as after the debrief.
  await p.goto(SITE + '/?debug=1');
  await p.evaluate(() => {
    const scores = {
      data: { accuracy: 0.9, fixedCount: 2, ruleChosen: true },
      ai: { labelAccuracy: 0.9, earlyGuessBonus: 0.5, auditCatch: 0.5, modelAccuracy: 0.85 },
      logic: { puzzlesSolved: 3, hintsUsed: 0, efficiency: 1, extraBlocks: 0 },
      cloud: { manualUptime: 0.7, autoUptime: 0.99, costEfficiency: 1 },
      finale: { familiesReached: 900, incidentsRouted: 8 },
    };
    const run = { stage: 5, levelIndex: 0, scores, stars: { data: 3, ai: 2, logic: 3, cloud: 2 }, bestFamilies: 900, startedAt: Date.now() - 900_000, finishedAt: Date.now() };
    localStorage.setItem('ship-it', JSON.stringify({ state: { run, bestFamilies: 900, settings: { theme: 'system', sound: false, relaxed: false } }, version: 1 }));
  });
  await p.goto(SITE + '/?debug=1');
  const r = [{ file: await shot(p, 'r-home'), label: 'Home after a finished run' }];
  await p.getByTestId('home-replay').click();
  r.push({ file: await shot(p, 'r-picker'), label: 'Pick a stage: bonus levels per stage' });
  await click(p, /Clean the Data/);
  await click(p, 'Start sorting');
  await playCards(p);
  for (let i = 0; i < 2; i++) {
    await click(p, 'Start');
    await playCards(p);
  }
  await expect(p.getByRole('heading', { name: 'Bonus: Spot the Outlier' })).toBeVisible();
  r.push({ file: await shot(p, 'r-bonus-intro'), label: 'Bonus level unlocked' });
  await click(p, 'Start');
  r.push({ file: await shot(p, 'r-bonus-play'), label: 'Bonus: Spot the Outlier' });
  await strip('solo-replay', r);
  await p.context().close();
}

// ------------------------------------------------------------------------------------------
// LEADERBOARD + /host
// ------------------------------------------------------------------------------------------
async function board() {
  log('board');
  const p = await newPhone();
  await p.goto(SITE + '/');
  await click(p, 'Leaderboard');
  await p.waitForTimeout(1500);
  const lb = await shot(p, 'leaderboard');
  await p.goto(SITE + '/host');
  await p.waitForTimeout(1500);
  const host = await shot(p, 'host');
  await strip('leaderboard-host', [
    { file: lb, label: 'Leaderboard (Today / View all)' },
    { file: host, label: '/host booth screen (phone width)' },
  ]);
  await p.context().close();
}

// ------------------------------------------------------------------------------------------
// TEAMS: one player per stage, everyone else on the waiting screen
// ------------------------------------------------------------------------------------------
const NAMES = ['Ann', 'Ben', 'Cai', 'Dev'];
const TEAM = { 2: 'Demo Kiwi', 3: 'Demo Mango', 4: 'Demo Lychee' };
/** Who plays stage `s` (0–5) in an `n`-player team (src/net/group/rotation.ts). */
const mainIndex = (s, n) => (s === 0 || s === 5 ? 0 : s % n);

async function team(n) {
  log(`team of ${n}`);
  const ps = [];
  for (let i = 0; i < n; i++) ps.push(await newPhone());
  const [ann] = ps;
  const lbl = (i, what) => `${NAMES[i]}: ${what}`;
  const all = async (name, what) => Promise.all(ps.map(async (p, i) => ({ file: await shot(p, `t${n}-${name}-${i}`), label: lbl(i, what(i)) })));

  await ann.goto(SITE + '/?debug=1');
  await click(ann, 'Play as a team');
  const intro = [{ file: await shot(ann, `t${n}-team`), label: 'Play as a team' }];
  await click(ann, 'Create a team');
  await ann.getByRole('button', { name: /Type our own name/ }).click();
  await ann.getByLabel('Team name').fill(TEAM[n]);
  await ann.getByLabel('Your nickname').fill('Ann');
  intro.push({ file: await shot(ann, `t${n}-create`), label: 'Create a team' });
  await click(ann, 'Create team');
  await ann.getByTestId('group-code').waitFor({ timeout: 20_000 });
  const code = (await ann.getByTestId('group-code').textContent()).trim();
  for (let i = 1; i < n; i++) {
    await ps[i].goto(`${SITE}/?debug=1&join=${code}`);
    await ps[i].getByLabel('Your nickname').fill(NAMES[i]);
    await click(ps[i], 'Join');
    await ps[i].getByTestId('lobby-waiting').waitFor({ timeout: 20_000 });
  }
  await expect(ann.getByTestId('member')).toHaveCount(n, { timeout: 20_000 });
  intro.push({ file: await shot(ann, `t${n}-lobby`), label: 'Lobby (leader): QR, code, turn order' });
  intro.push({ file: await shot(ps[1], `t${n}-lobby-b`), label: 'Lobby (teammate)' });
  await strip(`team${n}-lobby`, intro);

  // If a phone is still connecting, the lobby asks for a second tap (no one dropped by accident).
  for (let tries = 0; tries < 4 && !(await ann.getByTestId('prologue-heading').count()); tries++) {
    await click(ann, 'Start');
    await ann.getByTestId('prologue-heading').waitFor({ timeout: 6_000 }).catch(() => {});
  }
  await ann.getByTestId('prologue-heading').waitFor({ timeout: 20_000 });
  await strip(`team${n}-prologue`, await all('prologue', (i) => (i === 0 ? 'plays the prologue' : 'waiting screen')));
  await click(ann, 'Start the mission');

  // Stage 1 played for real in a team of 3 (hand-off + "You're up next"); debug jumps elsewhere,
  // always from the phone playing the current stage.
  let cur = 1;
  for (let stage = 1; stage <= 4; stage++) {
    const m = mainIndex(stage, n);
    const main = ps[m];
    if (cur !== stage) await jump(ps[mainIndex(cur, n)], String(stage));
    cur = stage;
    await main.getByTestId('waiting-screen').waitFor({ state: 'detached', timeout: 20_000 });
    await expect(ps[(m + 1) % n].getByTestId('waiting-screen')).toHaveAttribute('data-stage', String(stage), { timeout: 20_000 });
    const go = { 1: 'Start sorting', 2: 'Start labelling', 3: 'Start building', 4: 'Launch the app' }[stage];
    await click(main, go);
    if (stage === 4) await click(main, 'Start'); // stages 1–3: the tutorial starts from the briefing
    await gotIt(main);
    await strip(`team${n}-stage${stage}`, await all(`s${stage}`, (i) => (i === m ? `plays Stage ${stage}` : 'watches + helps')));
    if (stage === 1 && n === 3) {
      await playCards(main);
      for (let k = 0; k < 2; k++) {
        await click(main, 'Start');
        await playCards(main);
      }
      await finishStage1(main);
      const next = ps[mainIndex(2, n)];
      await next.getByTestId('up-next').waitFor({ timeout: 20_000 });
      await strip(`team${n}-handoff`, [
        { file: await shot(main, `t${n}-handoff-main`), label: lbl(m, 'hand-off card') },
        { file: await shot(next, `t${n}-handoff-next`), label: lbl(mainIndex(2, n), "You're up next!") },
      ]);
      await next.getByTestId('up-next').getByRole('button').click();
      await next.waitForTimeout(1500);
      cur = 2;
    }
  }

  await jump(ps[mainIndex(cur, n)], 'F');
  await ann.getByRole('heading', { name: 'Mission live' }).waitFor({ timeout: 20_000 });
  await click(ann, 'Start shift');
  await strip(`team${n}-finale`, await all('finale', (i) => (i === 0 ? 'Live Ops (leader)' : 'watches + calls out teams')));
  await playLiveOps(ann);
  for (const p of ps) await expect(p.getByTestId('group-rank')).toContainText('#2', { timeout: 30_000 });
  await strip(`team${n}-debrief`, await all('debrief', () => 'debrief + team rank'));

  if (n === 3) {
    // Free play on a teammate's own phone, with the bonus levels.
    const ben = ps[1];
    await ben.getByTestId('more-teaser').scrollIntoViewIfNeeded();
    const fp = [{ file: await shot(ben, 't3-more'), label: "Ben: There's more!" }];
    await ben.getByTestId('replay-stage').click();
    fp.push({ file: await shot(ben, 't3-picker'), label: 'Ben picks a stage' });
    await click(ben, /Build the Logic/);
    fp.push({ file: await shot(ben, 't3-solo'), label: 'Ben replays it solo' });
    await strip('team3-freeplay', fp);
  }
  for (const p of ps) await p.context().close();
}

/** A team of 2 where the player's phone drops mid-stage: pause, then the other phone takes over. */
async function drop() {
  log('drop');
  const ann = await newPhone();
  const ben = await newPhone();
  await ann.goto(SITE + '/?debug=1');
  await click(ann, 'Play as a team');
  await click(ann, 'Create a team');
  await ann.getByLabel('Your nickname').fill('Ann');
  await click(ann, 'Create team');
  await ann.getByTestId('group-code').waitFor({ timeout: 20_000 });
  const code = (await ann.getByTestId('group-code').textContent()).trim();
  await ben.goto(`${SITE}/?debug=1&join=${code}`);
  await ben.getByLabel('Your nickname').fill('Ben');
  await click(ben, 'Join');
  await expect(ann.getByTestId('member')).toHaveCount(2, { timeout: 20_000 });
  await click(ann, 'Start');
  await click(ann, 'Start the mission');
  await ann.getByTestId('waiting-screen').waitFor({ timeout: 20_000 });
  await ben.context().close();
  await ann.getByTestId('paused').waitFor({ timeout: 30_000 });
  const d = [{ file: await shot(ann, 'd-paused'), label: "Ben's phone drops: pause" }];
  await ann.getByTestId('waiting-screen').waitFor({ state: 'detached', timeout: 40_000 });
  d.push({ file: await shot(ann, 'd-takeover'), label: 'After 20 s Ann takes over' });
  await strip('team2-drop', d);
  await ann.context().close();
}

try {
  if (want('solo')) await solo();
  if (want('stage3')) await stage3();
  if (want('replay')) await replay();
  if (want('board')) await board();
  for (const n of [2, 3, 4]) if (want(String(n))) await team(n);
  if (want('drop')) await drop();
} finally {
  await browser.close();
  fs.rmSync(RAW, { recursive: true, force: true });
}
