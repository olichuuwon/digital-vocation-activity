# Decisions & assumptions log

> **Pending owner inputs:** see `docs/OWNER_INPUTS.md` (numbered checklist). Add new items there at the end of each milestone.

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
| 2026-10-07 | M1 content | `content-writer` drafted `briefings.json`, `rulebook.json`, `realityChecks.json`. Word limits are enforced by zod (briefing body ≤25, Reality card ≤40, Kubernetes card ≤20). | No |
| 2026-10-07 | Rulebook examples | Spec examples used as given. Rules 2 and 3 have extra examples not in the spec ("People: 0", "Water: 900 L", "ID 1042 (second time)") to show the existing rules. | Yes |
| 2026-10-07 | Stage 1 Reality Check | The "choose a rule to automate" tap (§4.3) is gameplay, built in M2 after the cards. | No |
| 2026-10-07 | Timer + WCAG 2.2.1 | Relaxed ×1.5 alone doesn't meet 2.2.1, so from 20s left a "+30 seconds" button appears (up to 10 times). Stages decide in M2+ whether an extension costs points (`onExtend`). Stages must pass `running={false}` while the Rulebook or Settings is open. Relaxed ×1.5 rounds up. Pauses on `running=false` and while the tab is hidden; time while the phone is locked never counts. Screen readers hear 30s, 10s and time up only. | No |
| 2026-10-07 | `/dev/components` | Reachable in production (no data, no backend calls). Not linked from the game. | No |
| 2026-10-07 | Bundle | Framer Motion added ~45 KB gz to the entry (now ≈149 KB of 250). Switch to `LazyMotion` + `m` in M7. | No |
| 2026-10-07 | Stage 1 records | 59 records by `game-designer` (18 valid, 8 rule 1, 10 rule 2, 7 rule 3, 6 rule 5, 10 rule 4). Sector letters A–F only; no place names (`[FILL]` optional local names not invented). | No |
| 2026-10-07 | Rule 1 text | Rulebook rule 1 now says "sector, people count or water amount" (spec says "every field"; the draft text only named sector and people). | No |
| 2026-10-07 | Stage 1 levels | Tutorial 3 cards untimed (rule 1); L1 10 cards / 40s (rules 1–3); L2 10 cards / 60s (rules 1–5, Fix); bonus L3 3 charts / 45s (full only). New-rule cards: L1 shows rules 2+3, L2 shows 4+5 (spec says "one new rule"; two levels introduce two). | Yes |
| 2026-10-07 | Stage 1 scoring | Only L1+L2 count. Card points: right 1, wrong fix 0.5, right after a hint 0.75, right with the answer shown 0.5; unanswered at time-up 0. accuracy = points ÷ cards dealt. Stage score = min(1, 0.9·accuracy + 0.1·automate + 0.05·outlier[full]). Stars ≥0.30 / 0.65 / 0.88. "+30 seconds" is free. | Yes |
| 2026-10-07 | Hint ladder (Stage 1) | Per level: after a wrong decision the next card shows a hint once 2 wrong, the answer once 3+ wrong. After a correct decision the next card has no help. | No |
| 2026-10-07 | Automate question (§4.3) | Spec doesn't define the 3 options. "Which rule would you turn into code first?": trash repeated household IDs (correct, mechanical), trash households over 12 (breaks rule 5), trash every typo (breaks rule 4). | Yes |
| 2026-10-07 | Rule-5 thresholds | Unusual-but-legal = people 13–15, water ≤5 L or ≥190 L. | No |
| 2026-10-07 | Stage 1 resume | Level outcomes persist (`ship-it-stage1`), so a reload between levels keeps earlier results; a reload mid-level restarts that level from its intro. | No |
| 2026-10-07 | "+30 seconds" in Stage 1 | Free (no score cost). | No |
| 2026-10-07 | Stage 1 reload after the last level | The end step (Reality Check, automate, result, hand-off) is saved, so a reload resumes there; stars can't be re-rolled. A replayed level deals a fresh deck. | No |
| 2026-10-07 | Full-mode Stage 1 length | Measured ≈2.6 min against the §2 full budget of 5–6 min (booth ≈2 min against 3). Revisit with `game-designer` in M8 playtests (more outlier charts or a longer L2). | Yes |
| 2026-10-07 | Supabase env (owner request) | Owner supplied the project URL + publishable key. Saved to git-ignored `.env.local` for local runs; not committed (CLAUDE.md "never commit secrets"). Production reads them from Vercel env vars. | No |
| 2026-10-07 | README | Added a player/facilitator-facing `README.md` (how to play, settings, facilitator params, privacy). Developer notes folded at the bottom. Stages 3–4, finale and groups marked "coming soon". | No |
| 2026-10-07 | `docs/OWNER_INPUTS.md` | Owner's numbered checklist (from `main`) kept; M3 adds items 20–24. | No |
| 2026-10-07 | Stage 2 images (§5.4) | 64 in-repo SVG scenes (7 day images per class + 8 night roads), drawn procedurally from `aiImages.json` (backdrop, item box, style, props). The item is drawn to fill its `box`, so boxes are exact. **Draw the Box also uses SVG**, not open-dataset photos (M3 says "placeholder SVG assets"; photo licences need a human check). No people/faces. | Yes |
| 2026-10-07 | Night images | Never dealt in training levels (L1/L2/L3), so "your model never saw night photos" (§5.3) is literally true. They appear only in the audit pool (incl. night flooded road → "clear road 91%"). | No |
| 2026-10-07 | Stage 2 levels | Tutorial 2 images / 3 options untimed (spec says one image; two gives a second easy win); spec values kept: L1 12 / 30s / 4 options; L2 8 / 60s, 4×4, a tile every 600 ms, wrong guess +1 tile; bonus L3 5 boxes / 45s, IoU good 0.5 / perfect 0.75; L4 8 / 40s with 3 wrong, ≥1 low-confidence (<60%) correct and ≥1 high-confidence (≥85%) wrong. Not in the spec: L2 starts with 2 tiles shown, wrong guess −0.25, solo Reveal power 2 charges per level. | Yes |
| 2026-10-07 | Covered Up reveal order | Seeded shuffle, at most 1 of the 4 centre tiles among the first 3 lifted, so a picture is never given away instantly. | No |
| 2026-10-07 | Stage 2 scoring | labelAccuracy = (L1 points + L2 points) ÷ (L1 + L2 dealt); L1 card = 1 / 0.75 after hint / 0.5 with answer; L2 image = 1 − 0.25 per wrong guess, capped 0.75/0.5 by hint/answer; unanswered 0. earlyGuessBonus = mean of (16 − tiles shown) ÷ (16 − 2) at the right guess. auditCatch = (caught − 0.5·false flags) ÷ wrong dealt. Stage score = 0.55·label + 0.15·early + 0.30·audit + 0.05·box (full only). Stars ≥0.30 / 0.62 / 0.87. modelAccuracy per §3.2 with Stage 1 accuracy. "+30 seconds" is free. | Yes |
| 2026-10-07 | Stage 2 hint ladder | L1/L4: like Stage 1 (per level, after a wrong answer the next item shows hint at 2 wrong, answer at 3+). L2: per image (2 wrong guesses → hint, 3 → answer marked). L3: per level, 2 missed boxes → hint, 3+ → the true box shown as a dashed outline. | No |
| 2026-10-07 | Solo support cards (§3.5.2) | Solo gets 📖 Field guide as a sheet (pauses the timer), 👁️ Reveal as a button with charges, and the Auditor's confidence numbers on the main screen. Group split comes in M6.5. | No |
| 2026-10-07 | Stage 2 alt text | Each picture's accessible name is "Picture n of N." plus the field-guide visual clue (not the label name), so screen-reader players can play. | No |
| 2026-10-07 | AI Reality Check | Training-curve card shows "{labelled} from you" (L1+L2 answers); card title now "Your {labelled} labels did this" (still needs approval). | Yes |
| 2026-10-07 | Stage 2 lazy-loaded | `AiStage` is a separate chunk (≈9 KB gz + content). `/dev/components` gained a "Stage 2 pictures" sheet showing every image with its true box. | No |
| 2026-10-07 | Answer shown = reduced score (Stage 2) | QA fix: audit catches count 0.75 with the hint and 0.5 with the answer showing; a box locked while the true box is drawn earns at most half credit. | No |
| 2026-10-07 | Settings pauses timers | QA fix: the store has `settingsOpen` (not persisted); every `Timer` and the Covered Up tile clock pause while Settings is open (Stage 1 too, via Timer). | No |
| 2026-10-07 | Stage 2 timing | QA measured booth ≈ 127 s (budget 3 min) and full ≈ 171 s (5–6 min). Same pattern as Stage 1; tune in M8 (owner item 23). | Yes |
| 2026-10-07 | e2e browser | `playwright.config.ts` honours `PW_CHROMIUM_PATH` (sandbox Chromium); CI still installs its own. | No |
| 2026-10-07 | Owner: direct push to `main` | Owner asked for direct pushes. Claude fast-forwards `main` only to a green, reviewed milestone commit (never WIP). M3 went live this way (CI green). | Done |
| 2026-10-07 | Stage 3 maps + semantics | Text-grid maps in `stage3.json` (`.` grass, `#` road, `D` depot, `H` house, `W/F/M` houses needing water/food/medical kit, `~` flood, `a/b` maybe-flood). Driving off road = crash, into water = stuck, dropping where there's no house = fail, plain drop on a W/F/M house = wrong supply. Every block counts 1, containers included. | No |
| 2026-10-07 | Stage 3 levels | Tutorial 4 blocks untimed; L1 par 7 / limit 8 / 60s; L2 5/5/75s (Repeat required, proven); **L3 par 8 / limit 9 / 90s (spec: limit 7; the solver proved no kid-friendly 7-block answer exists)**; L4 Debug It 9-block program with 2 bugs, 2 swaps, 75s; L5 Ask the AI 7/8/75s, no plain Drop in its palette. | Yes |
| 2026-10-07 | L3 randomness | The flood group is hidden (⚠ on both roads) until Run. A run that works only on this run's flood doesn't count: "Lucky! … make it work both ways" and it counts as a failed run. | No |
| 2026-10-07 | Stage 3 help | Hint (per-level copy) after 2 failed runs; after 3, "Show me" loads the known solution (reduced score). Time-up ends the level unsolved. | No |
| 2026-10-07 | Stage 3 scoring | stageScore = (solved ÷ dealt) × (0.95 + 0.05·efficiency) × max(0.4, 1 − 0.12·hints), hint = 1, answer = 2. All solved with no help ≥ 0.95 at any block count within the limit (§6.3 "solved + under limit = 3★"). Stars ≥ 0.2 / 0.6 / 0.9 (one hint → 2★). `scores.logic` gains `extraBlocks` (blocks over par, for the finale's logicScore); old saves default to 0. Debug It counts as at par (swap-only). | Yes |
| 2026-10-07 | §3.2 "AI misread" in Stage 3 | Realised in L5 Ask the AI (full mode): each ask is right with probability modelAccuracy (floor 0.5); wrong drops are shown, don't fail the run, and cost test maps. Booth runs don't play L5, so booth players meet the link in the Reality Check text and the finale. | Yes |
| 2026-10-07 | Stage 3 Reality Check | Shows the player's own program (L3, else the latest solved) next to the same program in Python, and runs their L3 program on 100 seeded test maps (`robustness`); unsolved fixed routes show failing maps. | No |
| 2026-10-07 | Solver proofs (§11) | `src/sim/grid.content.test.ts`: every solution works on every flood, solver minimum = par, L2 needs Repeat, L3 needs If, L4 needs exactly 2 swaps, L5 needs Ask the AI. Exhaustive search to nesting depth 2. | No |
| 2026-10-07 | Group support cards for Stage 3 | Game designer notes that Manifest (L5) and Debugger (L4) are full-mode only, so in booth groups those phones could idle. Proposal for M6.5: Debugger replays every failed run; Manifest becomes a "route card" in L1–L3; Scout keeps the flood view (L3) and the unfogged map (L1–L2). | Yes |

## Copy needing owner approval
<!-- NEEDS OWNER APPROVAL --> Reality Check cards in `src/content/realityChecks.json` with `needsApproval: true` (career-facing, D14). Preview them at `/dev/components`.
1. **Data, "Clean once, apply everywhere":** "You cleaned {handCleaned} records by hand. Data scientists write each rule once as code. A pipeline, an automatic chain of steps, then applies it to millions of records in seconds."
2. **AI, "Confidence, not certainty":** title "Your {labelled} labels did this"; "Every picture you labelled helped train your model…" and "Your model says this road is clear, 91% sure. It's flooded. Your model never saw night photos. Real AI teams hunt for gaps like this and keep humans checking the results."
3. **Logic, "That was programming":** "Your blocks just turned into Python…" and "Software engineers also write automatic tests: small checks that run your program on thousands of maps before real people use it. Each tick is a passed test."
4. **Cloud, "This is a real job":** "Site reliability engineers (SREs) keep apps like this running for millions of people. They set up alerts so a human only gets woken up when automation can't fix it."

## Milestone status
- [x] M0 · [x] M0.5 · [x] M1 · [x] M2 · [x] M3 · [ ] M4 · [ ] M5 · [ ] M6 · [ ] M6.5 · [ ] M7 · [ ] M8

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

### M1 notes (2026-10-07)
- 143 unit tests and 50 e2e tests green. Initial JS ≈ 149 KB gzipped (Framer Motion; trim in M7). Gallery at `/dev/components`.
- QA fixes: Timer ignores time while the phone is locked or the tab is hidden; 0s timer safe; data card uses the real record count; rolling-update card trimmed; every Reality Check placeholder has a default.
- a11y fixes (axe-clean on the gallery): Reality Check cards announced from one persistent live region; "+30 seconds" timer extension; ✓/✗ tiles use new `--tile-*` tokens (≥4.5:1 both themes) and rem sizes; one announcement per result (announcer clears first, so repeats are read); toasts last longer for long text and in relaxed mode, read with "Correct:/Wrong:" via the shared announcer; filled stars use `--logic-ink`; tutorial doesn't steal focus; rolling update shows v1/v2 text; gallery demos inside `<main>`; Rulebook has a bottom Close.

### M2 notes (2026-10-07)
- Stage 1 "Clean the Data" playable end to end. 256 unit tests (incl. all 59 records checked against the rules, deck rules over 500 seeds) and 58 e2e tests green.
- Timing (QA, paced 2.5s/card): booth ≈ 116s (acceptance ≤ 3.5 min ✅); full ≈ 153s.
- Initial JS ≈ 167 KB gz (budget 250). Lazy-load Stages 2–4 as they land; `LazyMotion` in M7.
- QA fixes: end step persisted across reloads; fix answers name the option (and the picker marks it); outlier help arrives as hint then answer; fresh deck on replay; rule-5 trash names rule 5.
- a11y fixes: focus after fix picker and new charts; outlier timer pauses with Rulebook; card values never break mid-ID; sticky actions; valid-card help; next card announced; amber borders ≥3:1; outlier units spoken.

### M3 notes (2026-10-07)
- Stage 2 "Teach the Machine to See" playable end to end: tutorial, Build the Training Set, Covered Up, Draw the Box (full), Audit the AI, Reality Check, stars, hand-off. 320 unit tests (IoU, reveal order and scoring, decks over hundreds of seeds, audit pool guarantees, content schemas) and 68 e2e tests green.
- Acceptance: occlusion reveal (`src/sim/reveal.ts`) and IoU (`src/sim/iou.ts`) tested ✅; placeholder SVG assets ✅.
- Timing (QA, human pace): booth ≈ 127 s, full ≈ 171 s. Initial JS ≈ 170 KB gz; Stage 2 lazy-loaded (≈17 KB gz).
- QA fixes: Settings pauses timers; the answer step reduces audit and box credit; real labelled count in the Reality Check; level instructions shown; Stage 2 reload + pause e2e.
- a11y fixes (axe clean): focus stays on option buttons (slot keys, `aria-disabled`); the next picture's clue and any new help spoken in one announcement (HintBox `quiet`); night and position alt text; spoken box readout; relaxed mode slows the tiles; nudge buttons reflow at 200%; frame leaves room for buttons; touch capture only in Draw the Box; answer outline ≥3:1; larger handles; ruled-out/suggested options named for screen readers.
- Carried to M7: toasts sit over the top row (streak / Field guide) while playing fast; arrow-key nudging in Draw the Box.
