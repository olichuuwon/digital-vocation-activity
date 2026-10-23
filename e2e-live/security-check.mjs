// Live security check against the deployed site (or LIVE_URL). Read-only: it writes nothing.
//   1. The security headers from vercel.json are served on / and /host.
//   2. Migration 0005 (server-side name filter) is applied. It calls submit_run with a numbered
//      team name AND an impossible duration: the name is checked first, so an applied 0005
//      answers invalid_group_name, an unapplied one invalid_duration. Both are refused before
//      any insert or rate-limit count, so the leaderboard is never touched.
// The Supabase URL and public key are read from the site's own JavaScript (they ship in it).
// Usage: node e2e-live/security-check.mjs   (runs in CI via the "Live security check" workflow)
import { randomUUID } from 'node:crypto';
import { appendFileSync, readFileSync } from 'node:fs';

const SITE = (process.env.LIVE_URL ?? 'https://digital-vocation-activity.vercel.app').replace(/\/$/, '');
const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const expected = vercel.headers.find((h) => h.source === '/(.*)').headers;

const rows = [];
const record = (check, ok, detail) => {
  rows.push([check, ok, detail]);
  console.log(`${ok ? '✅' : '❌'} ${check}: ${detail}`);
};

// 1. Headers
for (const path of ['/', '/host']) {
  const res = await fetch(SITE + path, { redirect: 'follow' });
  for (const { key, value } of expected) {
    const got = res.headers.get(key);
    record(`${path} ${key}`, got === value, got === null ? 'missing' : got === value ? 'present, matches vercel.json' : `differs: ${got}`);
  }
  const hsts = res.headers.get('strict-transport-security');
  record(`${path} Strict-Transport-Security`, !!hsts, hsts ?? 'missing (set by Vercel, not vercel.json)');
}

// 2. Migration 0005
async function supabaseConfig() {
  const list = await (await fetch(`${SITE}/precache.json`)).json();
  for (const file of list.filter((f) => f.endsWith('.js'))) {
    const js = await (await fetch(SITE + file)).text();
    const url = js.match(/https:\/\/[a-z0-9]+\.supabase\.co/)?.[0];
    const key = js.match(/sb_publishable_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0];
    if (url && key) return { url, key };
  }
  return null;
}

const sb = await supabaseConfig().catch(() => null);
if (!sb) {
  record('Migration 0005 (server name filter)', false, 'could not find the Supabase settings in the site bundle');
} else {
  const res = await fetch(`${sb.url}/rest/v1/rpc/submit_run`, {
    method: 'POST',
    headers: { apikey: sb.key, authorization: `Bearer ${sb.key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      p_group_token: randomUUID(),
      p_group_name: 'Probe 42',
      p_group_size: 2,
      p_mode: 'booth',
      p_families: 0,
      p_duration_sec: 1,
    }),
  });
  const text = await res.text();
  // (A network failure throws here and fails the run with its own message.)
  if (text.includes('invalid_group_name')) record('Migration 0005 (server name filter)', true, 'applied: a numbered name is refused by the server');
  else if (text.includes('invalid_duration')) record('Migration 0005 (server name filter)', false, 'NOT applied: run supabase/migrations/0005_name_filter.sql in the SQL Editor');
  else record('Migration 0005 (server name filter)', false, `unexpected answer (HTTP ${res.status}): ${text.slice(0, 200)}`);
}

const failed = rows.filter((r) => !r[1]).length;
const summary = [
  `## Live security check: ${SITE}`,
  '',
  `${rows.length - failed}/${rows.length} passed.`,
  '',
  '| Check | Result | Detail |',
  '|---|---|---|',
  ...rows.map(([c, ok, d]) => `| ${c} | ${ok ? '✅' : '❌'} | ${String(d).replace(/\|/g, '\\|')} |`),
  '',
  'Not checkable from outside (owner, Supabase SQL Editor): the facilitator passphrase. See supabase/README.md.',
].join('\n');
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
process.exit(failed ? 1 : 0);
