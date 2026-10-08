// Captures screenshots for docs/GAME_FLOWS.md from the live site (real Supabase Realtime).
// submit_run is intercepted, so nothing reaches the real leaderboard.
// Usage: node e2e-live/capture-flows.mjs [solo|2|3|4 ...]   (default: all)
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(new URL('../package.json', import.meta.url));
const { chromium, expect } = require('@playwright/test');

const SITE = process.env.LIVE_URL ?? 'https://digital-vocation-activity.vercel.app';
const OUT = new URL('../docs/flows/', import.meta.url).pathname;
const RAW = '/tmp/ship-it-flows';
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(RAW, { recursive: true });
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

/** Screenshot one phone (debug panel and toasts hidden). */
async function shot(p, name) {
  await p.waitForTimeout(500);
  await p.evaluate(() => document.querySelectorAll('.debug-panel').forEach((e) => (e.style.visibility = 'hidden')));
  const file = `${RAW}/${name}.png`;
  await p.screenshot({ path: file });
  await p.evaluate(() => document.querySelectorAll('.debug-panel').forEach((e) => (e.style.visibility = '')));
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

const BTN = /^(Start|Start sorting|Start labelling|Start building|Go live|Start shift|Start the mission|Got it|Next|Continue|Ready|Done|Skip)$/;
async function tap(p, re = BTN) {
  const b = p.getByRole('button', { name: re }).first();
  if (await b.count()) { await b.click(); await p.waitForTimeout(400); return true; }
  return false;
}
async function jump(p, label) {
  await p.locator('.debug-panel summary').click();
  await p.locator('.debug-panel').getByRole('button', { name: label, exact: true }).click();
  await p.locator('.debug-panel summary').click();
  await p.waitForTimeout(600);
}

// ------------------------------------------------------------------------------------------
// SOLO
// ------------------------------------------------------------------------------------------
async function solo() {
  log('solo');
  const p = await newPhone();
  const s = [];
  await p.goto(SITE + '/?debug=1');
  s.push({ file: await shot(p, 'solo-home'), label: '1. Home' });
  await p.getByRole('button', { name: 'Play solo' }).click();
  s.push({ file: await shot(p, 'solo-length'), label: '2. Pick a length' });
  await p.getByRole('button', { name: /Booth run/ }).click();
  await p.waitForTimeout(600);
  // Optional stage select (feature flag) may appear.
  if (await p.getByRole('button', { name: 'From the beginning' }).count()) {
    s.push({ file: await shot(p, 'solo-select'), label: '3. Stage select (testing flag, off for the event)' });
    await p.getByRole('button', { name: 'From the beginning' }).click();
    await p.waitForTimeout(600);
  }
  s.push({ file: await shot(p, 'solo-prologue'), label: '4. Prologue (the mission)' });
  await strip('solo-start', s);

  // Stage 1 (played with the debug answer attributes, plus 2 deliberate mistakes for the hint).
  const s1 = [];
  await tap(p);
  s1.push({ file: await shot(p, 's1-briefing'), label: 'Briefing' });
  await tap(p);
  s1.push({ file: await shot(p, 's1-intro'), label: 'Level intro + new rule' });
  await tap(p);
  s1.push({ file: await shot(p, 's1-tutorial'), label: 'Tutorial (hand hint)' });
  const play = async (wrong = 0, capture) => {
    for (let g = 0; g < 20; g++) {
      const card = p.getByTestId('record-card');
      if (!(await card.count())) return;
      await tap(p, /^Got it$/);
      const st = await card.getAttribute('data-status');
      const id = await card.getAttribute('data-id');
      if (capture && g === 1) await capture();
      if (wrong > 0) {
        wrong--;
        await p.getByRole('button', { name: st === 'valid' ? 'Trash' : 'Keep', exact: true }).click();
        if (wrong === 0 && capture) {
          await expect(p.locator(`[data-testid="record-card"][data-id="${id}"]`)).toHaveCount(0);
          await expect(p.getByTestId('hint')).not.toBeEmpty();
          await p.waitForTimeout(2600); // let the toast fade so the hint is visible
          s1.push({ file: await shot(p, 's1-hint'), label: 'Hint after 2 mistakes' });
          continue;
        }
      }
      else if (st === 'fixable') {
        const fix = Number(await card.getAttribute('data-fix'));
        await p.getByRole('button', { name: 'Fix', exact: true }).click();
        if (capture && !s1.some((x) => x.label.startsWith('Fix'))) s1.push({ file: await shot(p, 's1-fix'), label: 'Fix picker (level 2)' });
        await p.locator('section[aria-labelledby="fix-heading"] button').nth(fix).click();
      } else await p.getByRole('button', { name: st === 'valid' ? 'Keep' : 'Trash', exact: true }).click();
      await expect(p.locator(`[data-testid="record-card"][data-id="${id}"]`)).toHaveCount(0);
    }
  };
  await play();
  await tap(p); // L1 intro → start
  await play(2, async () => s1.push({ file: await shot(p, 's1-card'), label: 'Keep or Trash (40 s)' }));
  await tap(p);
  await play(0, async () => {});
  s1.push({ file: await shot(p, 's1-reality'), label: 'Reality Check' });
  await tap(p, /^(Continue|Next)$/);
  await tap(p, /^(Continue|Next)$/);
  s1.push({ file: await shot(p, 's1-automate'), label: 'Automate a rule' });
  await p.getByRole('button', { name: /already/i }).click().catch(() => {});
  await tap(p, /^Continue$/);
  s1.push({ file: await shot(p, 's1-stars'), label: 'Stars' });
  await tap(p, /^Continue$/);
  s1.push({ file: await shot(p, 's1-handoff'), label: 'Hand-off to Stage 2' });
  await strip('solo-stage1', s1.slice(0, 4));
  await strip('solo-stage1-end', s1.slice(4));

  // Stages 2–4: briefing, level intro, first play screen.
  for (const [stage, label] of [[2, 'Stage 2 AI'], [3, 'Stage 3 Software'], [4, 'Stage 4 Cloud']]) {
    await jump(p, String(stage));
    const st = [];
    st.push({ file: await shot(p, `s${stage}-briefing`), label: `${label}: briefing` });
    await tap(p);
    st.push({ file: await shot(p, `s${stage}-intro`), label: 'Level intro' });
    await tap(p);
    await p.waitForTimeout(1200);
    st.push({ file: await shot(p, `s${stage}-play`), label: 'Playing' });
    await tap(p, /^(Got it|Start|Start storm|Next)$/);
    await p.waitForTimeout(stage === 4 ? 6000 : 1500);
    st.push({ file: await shot(p, `s${stage}-play2`), label: stage === 4 ? 'Manual mode, mid-storm' : 'Playing (a moment later)' });
    await strip(`solo-stage${stage}`, st);
  }

  // Finale.
  await jump(p, 'F');
  const f = [];
  f.push({ file: await shot(p, 'f-reveal'), label: 'Finale: pipeline reveal' });
  await tap(p, /^Go live$/);
  await tap(p, /^Start shift$/);
  await p.waitForTimeout(800);
  f.push({ file: await shot(p, 'f-liveops'), label: 'Live Ops: route incidents' });
  for (let g = 0; g < 20; g++) {
    const card = p.getByTestId('incident');
    if (!(await card.count())) break;
    const text = await card.textContent();
    if (await card.getAttribute('data-all-hands')) await p.getByTestId('all-hands-ready').click().catch(() => {});
    else await p.locator(`button[data-team="${await card.getAttribute('data-team')}"]`).first().click();
    await expect(p.getByTestId('incident').filter({ hasText: text ?? '' })).toHaveCount(0, { timeout: 12000 }).catch(() => {});
  }
  await p.waitForTimeout(1500);
  f.push({ file: await shot(p, 'f-debrief'), label: 'Debrief: score card (solo: not ranked)' });
  await p.evaluate(() => window.scrollBy(0, 640));
  f.push({ file: await shot(p, 'f-debrief2'), label: 'Debrief: C4X match + what you learned' });
  await p.evaluate(() => window.scrollBy(0, 640));
  f.push({ file: await shot(p, 'f-debrief3'), label: 'Debrief: why digital matters to DIS' });
  await strip('solo-finale', f);
  await p.context().close();

  // Leaderboard + host.
  const q = await newPhone();
  await q.goto(SITE + '/');
  await q.getByRole('button', { name: 'Leaderboard' }).click();
  const lb = await shot(q, 'leaderboard');
  await q.goto(SITE + '/host');
  await q.setViewportSize({ width: 360, height: 1100 });
  const host = await shot(q, 'host');
  await strip('leaderboard-host', [{ file: lb, label: 'Leaderboard (Today / View all)' }, { file: host, label: '/host booth screen (phone width)' }]);
  await q.context().close();
}

// ------------------------------------------------------------------------------------------
// GROUPS
// ------------------------------------------------------------------------------------------
const NAMES = ['Ann', 'Ben', 'Cai', 'Dee'];
async function group(n) {
  log(`${n} players`);
  const ps = [];
  for (let i = 0; i < n; i++) ps.push(await newPhone());
  const names = NAMES.slice(0, n);
  const [host] = ps;
  await host.goto(SITE + '/?debug=1');
  await host.getByRole('button', { name: 'Create group' }).click();
  const create = await shot(host, `g${n}-create`);
  await host.getByTestId('name-options').getByRole('radio').first().check();
  await host.getByLabel('Your nickname').fill('Ann');
  await host.getByRole('button', { name: 'Create group' }).click();
  await host.getByTestId('group-code').waitFor({ timeout: 20000 });
  const code = (await host.getByTestId('group-code').textContent()).trim();
  for (let i = 1; i < n; i++) {
    await ps[i].goto(`${SITE}/?debug=1&join=${code}`);
    if (i === 1) var joinShot = await shot(ps[i], `g${n}-join`);
    await ps[i].getByLabel('Your nickname').fill(names[i]);
    await ps[i].getByRole('button', { name: 'Join', exact: true }).click();
    await ps[i].getByTestId('lobby-waiting').waitFor({ timeout: 20000 });
  }
  for (const p of ps) await expect(p.getByTestId('member')).toHaveCount(n, { timeout: 20000 });
  await host.waitForTimeout(2500); // let presence settle
  await strip(`group${n}-lobby`, [
    { file: create, label: 'Host: create group' },
    { file: await shot(host, `g${n}-lobby-host`), label: 'Host lobby (QR, code, order)' },
    { file: joinShot, label: 'Teammate: join screen' },
    { file: await shot(ps[1], `g${n}-lobby-member`), label: 'Teammate lobby' },
  ]);
  await host.getByRole('button', { name: 'Start' }).click();
  await tap(host, /^Start$/); // second tap if someone is still connecting

  const mainIdx = async () => {
    for (let k = 0; k < 40; k++) {
      const m = [];
      for (let i = 0; i < n; i++) if (!(await ps[i].getByTestId('support-screen').count())) m.push(i);
      if (m.length === 1) return m[0];
      await host.waitForTimeout(300);
    }
    throw new Error('no single main phone');
  };
  const all = async (stage, title, prep) => {
    await host.waitForTimeout(900);
    const m = await mainIdx();
    if (prep) await prep(ps[m]);
    const items = [];
    for (let i = 0; i < n; i++) items.push({ file: await shot(ps[i], `g${n}-${stage}-${names[i]}`), label: `${names[i]}: ${i === m ? '🎮 MAIN' : 'support'}` });
    await strip(`group${n}-${stage}`, items);
    return m;
  };
  let m = await all('prologue', 'Prologue');
  await tap(ps[m], /^Start the mission$/);
  m = await all('stage1', 'Stage 1', async (mp) => { await tap(mp); await tap(mp); });
  for (const st of ['2', '3', '4']) {
    await jump(ps[m], st);
    m = await all(`stage${st}`, `Stage ${st}`, async (mp) => {
      await tap(mp);
      await tap(mp);
      if (st === '4') { await tap(mp, /^(Got it|Start|Start storm|Next)$/); await mp.waitForTimeout(4000); }
    });
  }
  await jump(ps[m], 'F');
  await host.waitForTimeout(800);
  m = await mainIdx();
  await tap(ps[m], /^Go live$/);
  await tap(ps[m], /^Start shift$/);
  m = await all('finale', 'Finale');
  const ic = ps[m];
  const supports = ps.filter((_, i) => i !== m);
  for (let g = 0; g < 20; g++) {
    const card = ic.getByTestId('incident');
    if (!(await card.count())) break;
    const text = await card.textContent();
    if (await card.getAttribute('data-all-hands')) {
      if (g < 9 && !fs.existsSync(`${OUT}group${n}-allhands.png`)) {
        const items = [];
        for (let i = 0; i < n; i++) items.push({ file: await shot(ps[i], `g${n}-ah-${names[i]}`), label: `${names[i]}: ${i === m ? '🎮 IC' : 'support'}` });
        await strip(`group${n}-allhands`, items);
      }
      for (const p of supports) await p.getByTestId('support-all-hands').click();
      await ic.getByTestId('all-hands-ready').click();
    } else {
      const team = await card.getAttribute('data-team');
      for (const p of supports) if ((await p.getByTestId('support-routing').getAttribute('data-teams')).split(',').includes(team)) await p.locator(`button[data-team="${team}"]`).click();
    }
    await expect(ic.getByTestId('incident').filter({ hasText: text ?? '' })).toHaveCount(0, { timeout: 12000 }).catch(() => {});
  }
  await host.waitForTimeout(2000);
  const items = [];
  for (let i = 0; i < n; i++) items.push({ file: await shot(ps[i], `g${n}-debrief-${names[i]}`), label: `${names[i]}: debrief` });
  await strip(`group${n}-debrief`, items);
  for (const p of ps) await p.context().close();
}

try {
  if (want('solo')) await solo().catch((e) => log('solo error:', e.message.split('\n')[0], '\n', e.stack.split('\n').find((l) => l.includes('capture-flows'))));
  for (const n of [2, 3, 4]) if (want(String(n))) await group(n).catch((e) => log(`${n}p error:`, e.message.split('\n')[0]));
} finally {
  await browser.close();
}
