// Keeps the free-tier Supabase project awake. Free projects pause after about a week with no
// activity, which takes team play and the leaderboard down until someone restores the project.
// One read-only call a day (leaderboard_today: a SELECT, no writes, no rate-limit count) counts as
// activity and changes nothing players can see.
// The Supabase URL and public key are read from the site's own JavaScript (they ship in it).
// Usage: node e2e-live/keepalive.mjs   (runs daily in CI via the "Supabase keep-alive" workflow)
// Exits 1 if Supabase doesn't answer, so a paused project shows up as a failed run (and an email).
const SITE = (process.env.LIVE_URL ?? 'https://digital-vocation-activity.vercel.app').replace(/\/$/, '');

async function supabaseConfig() {
  const list = await (await fetch(`${SITE}/precache.json`)).json();
  for (const file of list.filter((f) => f.endsWith('.js'))) {
    const js = await (await fetch(SITE + file)).text();
    const url = js.match(/https:\/\/[a-z0-9]+\.supabase\.co/)?.[0];
    const key = js.match(/sb_publishable_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0];
    if (url && key) return { url, key };
  }
  throw new Error(`no Supabase URL/key found in ${SITE}`);
}

const sb = await supabaseConfig();
let last = '';
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    const res = await fetch(`${sb.url}/rest/v1/rpc/leaderboard_today`, {
      method: 'POST',
      headers: { apikey: sb.key, authorization: `Bearer ${sb.key}`, 'content-type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) {
      const rows = await res.json();
      console.log(`Supabase is awake: leaderboard_today answered (${Array.isArray(rows) ? rows.length : '?'} rows today).`);
      process.exit(0);
    }
    last = `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`;
  } catch (e) {
    last = String(e?.cause?.code ?? e?.message ?? e);
  }
  console.log(`Attempt ${attempt} failed: ${last}`);
  await new Promise((r) => setTimeout(r, 20_000));
}
console.error(`Supabase did not answer (${last}). If the project is paused, restore it at https://supabase.com/dashboard.`);
process.exit(1);
