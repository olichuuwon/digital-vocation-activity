// Replays the race: teammates join, host taps Start immediately. Nobody may be dropped.
import { createRequire } from 'node:module';
const require = createRequire(new URL('../package.json', import.meta.url));
const { chromium, devices } = require('@playwright/test');
const SITE = process.env.LIVE_URL ?? 'https://digital-vocation-activity.vercel.app';
const browser = await chromium.launch();
let warned = 0, ok = 0;
for (let round = 1; round <= 5; round++) {
  const ps = [];
  for (let i = 0; i < 3; i++) ps.push(await (await browser.newContext({ ...devices['Pixel 5'], serviceWorkers: 'block' })).newPage());
  const [a, b, c] = ps;
  await a.goto(SITE + '/');
  await a.getByRole('button', { name: 'Create group' }).click();
  await a.getByTestId('name-options').getByRole('radio').first().check();
  await a.getByLabel('Your nickname').fill('Ann');
  await a.getByRole('button', { name: 'Create group' }).click();
  await a.getByTestId('group-code').waitFor({ timeout: 20000 });
  const code = (await a.getByTestId('group-code').textContent()).trim();
  for (const [p, n] of [[b, 'Ben'], [c, 'Cai']]) {
    await p.goto(`${SITE}/?join=${code}`);
    await p.getByLabel('Your nickname').fill(n);
    await p.getByRole('button', { name: 'Join', exact: true }).click();
  }
  await c.getByTestId('lobby-waiting').waitFor({ timeout: 20000 });
  // Tap Start the instant Cai's own phone says it's in the lobby.
  await a.getByRole('button', { name: 'Start' }).click();
  const note = (await a.locator('#start-note').innerText().catch(() => '')).trim();
  if (/still connecting/.test(note)) { warned++; await a.waitForTimeout(2500); await a.getByRole('button', { name: 'Start' }).click(); }
  await a.waitForTimeout(3000);
  const texts = await Promise.all(ps.map((p) => p.locator('body').innerText()));
  const dropped = texts.some((t) => /closed the group/.test(t));
  const inGame = texts.filter((t) => /supporting|Mission: flood relief/.test(t)).length;
  console.log(`round ${round}: warning shown=${/still connecting/.test(note)} | phones in game=${inGame}/3 | anyone dropped=${dropped}`);
  if (!dropped && inGame === 3) ok++;
  for (const p of ps) await p.context().close();
}
console.log(`RESULT: ${ok}/5 rounds kept all 3 players (warning appeared in ${warned})`);
await browser.close();
