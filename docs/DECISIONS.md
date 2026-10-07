# Decisions & assumptions log

| Date | Item | Decision / default used | Owner to confirm? |
|------|------|-------------------------|-------------------|
|      | D1–D17 | See GAME_SPEC.md §0 | Yes |
| 2026-10-06 | D11 Hosting | **Owner chose Vercel.** `vercel.json` added (Vite preset, SPA rewrite for `/host` etc., no-cache on `sw.js`, immutable `/assets`). Deploys via Vercel's Git integration once the owner creates the repo. GitHub Pages workflow removed. | Done |
| 2026-10-07 | D1 Game name | **Owner chose "Let's Ship It".** Set in `src/content/copy.json` (title, tab titles), `index.html` and the manifest. Repo stays `digital-vocation-activity`. | Done |
| 2026-10-06 | D2 Brand colours | Not in the decisions table; using spec §9 discipline colours. Added darker "-ink" variants for text contrast (4.5:1). | Yes |
| 2026-10-06 | Q1 Branding | No logos. Text only. | Yes |
| 2026-10-06 | Fonts (§9 "self-hosted") | No fonts named. M0 uses system font stacks (zero download, nothing third-party). Swap in self-hosted fonts in M7 if wanted. | Yes |
| 2026-10-06 | "PWA shell" vs D16 | Manifest + service worker that caches same-origin static files (stale-while-revalidate) for fast reloads. Cross-origin requests (Supabase) are never cached. No offline play. | No |
| 2026-10-06 | `?stage=N` | Only honoured together with `?debug=1`, so players can't skip stages on ranked runs. | No |
| 2026-10-06 | `?fakePeers` | Parsed (clamped 0–3) but unused until M6.5. | No |
| 2026-10-06 | Reopen with saved run | Lands on Home with a "Resume run" button rather than auto-resuming (§3.1 "Offer Resume"). | No |
| 2026-10-06 | Level lists | Stage/level ids live in `src/content/stages.json`; bonus levels flagged `bonus: true` and skipped in booth mode. Stage 4 phases A/B/C are its 3 levels in both modes. | No |
| 2026-10-06 | `?relaxed=1` | Applies for the current page load only (not saved), so a shared booth phone doesn't stay relaxed for the next player. The player's own setting is saved. | No |
| 2026-10-06 | Saved progress | Validated with zod on load (`src/state/schema.ts`). Invalid run → dropped; invalid settings → defaults; levelIndex clamped. Older save versions go through the same check. | No |
| 2026-10-06 | Finished run | Reaching the finale doesn't clear the run yet, so Home still offers Resume. Fix in M6 with the debrief. | No |
| 2026-10-06 | M0 copy | Home/settings/placeholder copy in `src/content/copy.json` is functional UI text, drafted by the main agent. No DIS/career copy yet. Hand to `content-writer` in M1. | No |
| 2026-10-07 | Q8 Backend | Supabase (spec default), Singapore region. Project created with Data API on, auto-expose new tables off, automatic RLS on. Migration in `supabase/migrations/0001_runs.sql`. | No |
| 2026-10-07 | `runs` columns | §3.5.4 fields plus `mode` (booth/full) for the anti-cheat duration floor, and a private `group_token` (uuid) that makes submission retry-safe. `group_id` = public bigint `id`. Anon can't read `group_token`, `duration_sec` or `hidden`. | Yes |
| 2026-10-07 | Writes | Only via `submit_run()` (validated, one row per token). No direct insert/update/delete for anon. `finished_at` is set by the server, so a run queued at 23:55 that sends after midnight lands on the next day's board. | No |
| 2026-10-07 | Anti-cheat | families 0–1200; duration booth ≥ 480s, full ≥ 900s, ≤ 3600s (60-min run expiry). | No |
| 2026-10-07 | Rate limit | Global cap of 30 new runs per 60s (no per-device data, for privacy). A script could still flood the board; the mitigation is the facilitator hide. | Yes |
| 2026-10-07 | Facilitator PIN | 6–8 digits, bcrypt-hashed in schema `private`. Lockout after 20 wrong PINs in 10 min (global). Re-running `select private.set_facilitator_pin('…')` changes the PIN and clears a lockout. | No |
| 2026-10-07 | Group names (server) | Trimmed, inner spaces collapsed, 1–20 chars, control, zero-width and bidi characters rejected. Profanity filter (`blocklist.json`) comes in M6.5. | No |
| 2026-10-07 | Leaderboard refresh | `/host` polls every 10s while visible (Realtime not needed for a board). The player Leaderboard screen refetches on open and when the SGT day rolls over. | No |
| 2026-10-07 | All-time board | Shows date + HH:MM, since rows span days. | No |
| 2026-10-07 | `?debug=1` test submit | Only on `npm run dev`, never on the deployed site (stops fake rows). | No |
| 2026-10-07 | `/host` QR | Uses the page's own origin and passes `?mode` and `?relaxed=1` through. Open `/host` on the production URL so the QR is right. | No |
| 2026-10-07 | Submission queue | Stored on the device with the run payload only (no nicknames), retries 2s→60s, dropped after 24h. Ready for M6.5; nothing calls it yet. | No |
| 2026-10-07 | M0.5 copy | Leaderboard and `/host` text in `copy.json` is functional UI text written by `realtime-engineer`. Review with `content-writer` in M1. | No |

## Copy needing owner approval
_None yet._

## Milestone status
- [x] M0 · [x] M0.5 · [ ] M1 · [ ] M2 · [ ] M3 · [ ] M4 · [ ] M5 · [ ] M6 · [ ] M6.5 · [ ] M7 · [ ] M8

### M0 notes (2026-10-06)
- Lint, typecheck, unit tests (Vitest) and e2e (Playwright, iPhone 12 + Pixel 5) green.
- Initial JS ≈ 97 KB gzipped (budget 250 KB).
- QA fixes: bad saves no longer blank the screen; debug reload resumes mid-stage; sw returns a network error instead of `undefined`.
- a11y fixes: header survives 200% text; focus moves to each new screen heading; tab titles per screen; shared polite live region (`useAnnouncer`); current pipeline stage has ▶ + bold + underline; borders ≥3:1; decorative emoji hidden; "Coming soon" buttons stay focusable (`aria-disabled`).
- Carried to M2+: wire `MotionConfig reducedMotion="user"` and `useRelaxed()` into timers once they exist.
- Deployed 2026-10-07: https://digital-vocation-activity.vercel.app (Vercel, auto-deploys on push to `main`). Per-deployment URLs (`…-<hash>-….vercel.app`) sit behind Vercel login (Deployment Protection); share the production URL.

### M0.5 notes (2026-10-07)
- 121 unit tests (incl. SQL run in PGlite to prove anon can't tamper) and 44 e2e tests green. Initial JS ≈ 104 KB gzipped; supabase-js and `/host` load on demand.
- QA fixes: debug submit dev-only; 6+ digit PIN and higher lockout threshold; zero-width/bidi names rejected; extra test for private functions; e2e builds into `dist-e2e` and never reuses a real-env server.
- a11y fixes: focus kept after retry, unlock, lock and hide; one status region announces loading/results/empty; `role="list"` for iOS VoiceOver; PIN errors tied to the input; hide/unhide announced; stale `/host` board says "Reconnecting"; long headings wrap at 200%.
- Live check 2026-10-07 against the real project: migration applied, PIN set. Read today ✅, submit ✅ (row id 1 "QA Test", 0 families), retry returns the same row ✅, direct insert / secret column / private function all refused ✅, 1201 families rejected ✅. Deployed bundle includes the Supabase config ✅.
