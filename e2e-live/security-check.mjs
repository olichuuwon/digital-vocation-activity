// Live security check against the deployed site (or LIVE_URL). Read-only: it writes nothing.
//   1. The security headers from vercel.json are served on / and /host.
//   2. Migrations 0005 (server-side name filter) and 0006 (blocklist refresh) are applied. It
//      calls submit_run with a name the server should refuse ("Probe 42", then "fk") AND an
//      impossible duration: the name is checked first, so an applied migration answers
//      invalid_group_name, a missing one invalid_duration. Both are refused before any insert
//      or rate-limit count, so the leaderboard is never touched.
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

/** Sends a name the server should refuse, with an impossible duration so nothing can ever be stored. */
async function probeName(name) {
  const res = await fetch(`${sb.url}/rest/v1/rpc/submit_run`, {
    method: 'POST',
    headers: { apikey: sb.key, authorization: `Bearer ${sb.key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      p_group_token: randomUUID(),
      p_group_name: name,
      p_group_size: 2,
      p_mode: 'booth',
      p_families: 0,
      p_duration_sec: 1,
    }),
  });
  // (A network failure throws here and fails the run with its own message.)
  const text = await res.text();
  if (text.includes('invalid_group_name')) return { ok: true };
  if (text.includes('invalid_duration')) return { ok: false };
  return { ok: false, unexpected: `unexpected answer (HTTP ${res.status}): ${text.slice(0, 200)}` };
}

const nameChecks = [
  // 0005 adds the filter: digits are refused. 0006 adds "fk" to the word list.
  { check: 'Migration 0005 (server name filter)', name: 'Probe 42', pass: 'applied: a numbered name is refused by the server', file: '0005_name_filter.sql' },
  { check: 'Migration 0006 (blocklist refresh)', name: 'fk', pass: 'applied: "fk" is refused by the server', file: '0006_blocklist_refresh.sql' },
];
for (const c of nameChecks) {
  if (!sb) {
    record(c.check, false, 'could not find the Supabase settings in the site bundle');
    continue;
  }
  const r = await probeName(c.name);
  record(c.check, r.ok, r.ok ? c.pass : (r.unexpected ?? `NOT applied: run supabase/migrations/${c.file} in the SQL Editor`));
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
