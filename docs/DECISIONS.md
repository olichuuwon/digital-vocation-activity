# Design and implementation decisions

How the game is built and why, where the spec (`docs/GAME_SPEC.md`) left room for choice. This describes the **current** game; a short change history is at the end.

---

## 1. The run

- **One run length** (≈ 16 min of play). The first play-through plays the core levels only. Levels flagged `bonus: true` in `src/content/stages.json` unlock on **replays**.
- **Replays (free play).** After the debrief, any stage can be replayed (`run.replays > 0`), with every level, bonus ones included. A replay is **one stage**: when it ends (`run.replaying`), the run goes straight back to its debrief, keeping the other scores and the families. Replays are never submitted to the leaderboard. The debrief shows "🔓 There's more!", and the shared picker (`src/components/ReplayPicker.tsx`, used on Home and the debrief) tags each stage with "+N bonus levels". Bonus level names start with "Bonus: ".
- **Saved progress.** The run is saved to `localStorage` after every level and validated with zod on load (`src/state/schema.ts`). A bad run is dropped, bad settings fall back to defaults, and `levelIndex` is clamped. Reopening lands on Home with **Resume run** (never auto-resumes). A finished run isn't resumed. Each stage also saves its end step (Reality Check, stars…), so a reload resumes there and stars can't be re-rolled.
- **Hints.** A hint after 2 wrong answers, the answer after 3, at reduced score (Stage 3 is gentler: below). No dead ends.
- **Key learning points can't be skipped.** Reality Check cards have no Skip and don't advance on a stray tap; each card's Next unlocks after `READ_MS` (1.2 s, ×1.5 relaxed). Stage 4's "Meet Kubernetes" cards are labelled *How it works*.
- **Flow.** Every stage's briefing goes straight into its tutorial (no extra intro screen). Solo players skip the hand-off card (straight to the next briefing); teams keep it. Stage 4's Configure and Replay start without intro screens, and the manual storm ends with a "Storm over. Uptime N%" line. Toasts left over from a previous screen are cleared when a new screen appears (one that has just appeared is kept). Stars appear at once under reduced motion. The finale's reveal also explains Live Ops, so one tap (**Start shift**) starts it. Stage 2's tutorial tip is a compact one-line hint (it used to hide behind the sticky answer buttons). The progress strip keeps each stage name on one line (✓ / ▶ markers, no icons for upcoming stages).
- **Timers.** Relaxed mode gives ×1.5 time. From 20 s left, a free "+30 seconds" button appears (up to 10 times), for WCAG 2.2.1. Timers pause while Settings, the Rulebook or the Field guide is open, and while the tab is hidden.
- **Debug params.** `?debug=1` shows a stage-jump panel; `?stage=N` only works together with `?debug=1`. `?simSpeed=N` speeds up Stage 4 storms (debug only). `?relaxed=1` applies for one page load only, so a shared phone doesn't stay relaxed.

## 2. Stages

### Stage 1: Clean the Data
- **Levels.** Tutorial: 3 cards, untimed, rule 1. It starts straight from the briefing and opens on a clean card. **Level 1:** 8 cards in 60 s, rules 1–2. **Level 2:** 8 cards in 90 s, rules 1, 2 and 4: it adds only **Fix**. **Bonus Spot the Outlier** (replays): 3 charts in 45 s, rules 2 and 5.
- **Rule strip.** The rules in play show as short chips above the card ("Blank field → Trash", "People 1–15, water 5–200 L", "Typo or ml → Fix"). The Rulebook sheet has the full text and examples.
- **Rules not dealt in the core run.** Rule 3 (duplicates) stays in `rulebook.json` but isn't dealt (the schema expects 5 rules). Rule 5 (outliers) is introduced in the bonus level. Unusual-but-legal values are 13–15 people, or water ≤ 5 L or ≥ 190 L.
- **💧 People reached.** The household sizes of records correctly kept or fixed. Shown on the card screen and the stars screen.
- **Scoring.** Only Levels 1–2 count. Per card: right 1, right after a hint 0.75, right with the answer shown 0.5, wrong fix 0.5, unanswered 0. Accuracy = points ÷ cards dealt. Stage score = min(1, 0.9·accuracy + 0.1·automate, + 0.05·outlier on replays). Stars at 0.30 / 0.65 / 0.88.
- **Automate question** (after the Reality Check): "Which rule would you turn into code first?" ✅ *Trash any record with a blank field* (a blank can never be guessed); ❌ *households over 12 people* (big households are real); ❌ *every typo* (typos can be fixed).
- **Records.** 59 hand-made records in `records.json`, checked against the rules by unit tests. Sectors are letters A–F.

### Stage 2: Teach the Machine to See
- **Pictures.** 64 SVG scenes drawn in code from `aiImages.json`: 7 daytime pictures per class plus 8 night roads. No people or faces. The item fills its `box`, so boxes are exact. Night pictures never appear in training levels, so "your model never saw night photos" is literally true.
- **Levels.** Tutorial: 2 pictures. **Build the Training Set:** 12 pictures in 30 s. **Covered Up:** 8 pictures in 60 s, a tile every 0.6 s, 2 tiles shown at the start, 2 Reveal charges; at most 1 of the 4 centre tiles is among the first 3 revealed. **Audit the AI:** 8 items in 40 s, 3 wrong, including a low-confidence right answer and a high-confidence wrong one. **Bonus Draw the Box** (replays): 5 boxes in 45 s, IoU good ≥ 0.5, perfect ≥ 0.75.
- **Scoring.** 0.55·labels + 0.15·early-guess bonus + 0.30·audit (+ 0.05·box on replays). Stars at 0.30 / 0.62 / 0.87. Model accuracy follows spec §3.2, using Stage 1's data accuracy.
- **Accessibility.** Each picture's accessible name is "Picture n of N" plus the field-guide clue, not the answer.

### Stage 3: Build the Logic
- **Maps.** Text grids in `stage3.json`. Driving off the road is a crash, driving into water gets you stuck, and a drop where there's no house fails. Every block counts as 1, containers included.
- **Levels.** Tutorial: 4 blocks, **step by step** (the next block is highlighted with "Step n of 4: tap …", then Run). **Order the Steps:** par 7, limit 8, 90 s. **Say It Shorter:** 5/5, 105 s, needs Repeat. **Choose the Road:** par 8, limit 9, 120 s, needs If; the If block **starts in place** (`starter` in `stage3.json`) and new blocks go inside it. **Bonus Debug It** (replays): a 9-block program with 2 bugs, 2 swaps, 105 s. **Bonus Ask the AI** (replays): uses the Stage 2 model, so a weaker model makes wrong drops, 105 s.
- **Guided help.** After **1** failed run: the level hint plus a dashed **💡 ghost** in the program, the one next change towards the level's solution (`nextStep` in `src/stages/logic/program.ts`: add a block, change one, set a Repeat count, or remove one). One tap applies it. After 3 failed runs, **Show me** loads the solution. Unit tests prove following the ghost reaches the solution from any start.
- **Luck doesn't count.** In Choose the Road the flood is hidden until Run. A program that only works on this run's flood counts as a failed run.
- **Scoring.** (solved ÷ dealt) × (0.95 + 0.05·efficiency) × max(0.4, 1 − 0.12·hints). A hint counts only when the ghost is tapped (Show me counts 2). Stars at 0.2 / 0.6 / **0.8**: one hint still earns 3★.
- **Proofs.** `src/sim/grid.content.test.ts` proves every puzzle is solvable within its block limit, and that each level needs the block it teaches.

### Stage 4: Keep It Alive
- **Simulation** (`src/sim/cluster.ts`, deterministic). 100 ms ticks; 45 s storms with the same seed for the manual and Kubernetes phases; 100 req/s per pod. A pod crashes after > 1.5 s overloaded. Self-healing restarts it in 3 s (without it: 15 s or a Restart tap). The autoscaler checks every 2 s, with a 4 s cold start and a 2 s warm-up. A bad update lands at 16 s and a hardware fault at 32 s.
- **App quality.** Storm size is 0.85–1.15× the mean of data accuracy, label accuracy and Stage 3 puzzles solved; the budget scales with it.
- **Flow.** Manual storm → Meet Kubernetes → Configure (45 s, live cost meter) → Replay (with ×3 fast-forward) → diagnosis → up to 2 tweak round-trips → "This is a real job" → stars.
- **Scoring.** 3★ means ≥ 99% uptime and under budget. A 60–70% scale-up threshold is the sweet spot, and the hint says so. The score falls to 0 at 80% uptime.

### Finale
- **Pipeline reveal**, then **Live Ops:** 8 of 16 incidents (at least 1 per team), 8 s each, +15 families right and −12 wrong or time-out. Families are clamped to 0–1200. After each answer the "why" shows with a **Next incident** button (the pause also ends on its own).
- **Ranks:** Relief rookie 0, Rapid responder 500, Supply coordinator 700, Ops commander 900, Mission lead 1100.
- **Debrief:** a screenshot card that fits 360×740, the C4X match, what you learned, and why digital matters. The big number isn't repeated in its caption (screen readers still hear it). Buttons: **Replay with bonus levels** (main) and **New run**. Stages skipped by a debug jump say "You skipped this stage" rather than inventing numbers. In a team, teammates' phones show count-free lines ("Your team cleaned records…").

## 3. Team play

- **Take turns.** Each stage, one player plays on their own phone exactly as in solo; everyone else sees the **Waiting screen** (who's playing, the level, team stars, their next turn) and helps out loud. The code calls the playing phone the "main" phone and the team a "group".
- **Rotation.** Player 1 (the leader) plays the prologue and the finale; stage k goes to player (k mod n), so turns are as even as possible. The host can reorder the lobby. Teams are 2–4 players.
- **Hand-off.** The player's phone names the next player and waits ("Waiting for {name} to tap I'm ready…"); **only the next player's own phone** starts the turn (**You're up next!** → **I'm ready**). If that phone isn't connected, the finishing phone gets "{name} isn't connected. Play their turn here", which claims the stage at once (`claim` in the engine, recorded like a drop takeover), so the game never gets stuck.
- **Sync.** The phone playing the current stage broadcasts the run whenever it changes; the others mirror it read-only. A run update is accepted only from the phone playing the receiver's current stage, so the last update of a stage hands the game on. The contract is documented in `src/net/group/index.ts`.
- **Transport.** Supabase Realtime broadcast + presence on `group:<CODE>`; nothing stored. e2e tests use a small WebSocket relay (`e2e/groupRelay.ts`); unit tests and `?fakePeers=N` use an in-memory hub.
- **Drops.** If the player's phone goes quiet for 15 s, teammates see a pause; after 20 s, the next connected member takes over from the start of that level. A phone only claims a turn after being connected for 2 s, so a whole-room Wi-Fi blip doesn't cause a takeover.
- **Lobby.** Start needs 2+ connected players. If someone is still connecting, the first tap warns and a second tap starts without them. Joining closes at Start. A lobby expires after 15 min; a run after 60 min.
- **Codes.** 4 characters without I, O, 0 or 1, re-drawn if they spell a blocked word. Each team also has a random session id.
- **Names.** Generated "Adjective Noun" names (`groupNames.json`, Singapore animals and places) or a custom name: ≤ 20 characters, letters only, profanity-filtered (English, Singlish, Hokkien, Malay; leetspeak and spacing ignored). Nicknames are 1–16 characters, letters only.
- **Free play.** After the debrief, once the team's leaderboard result has arrived, any member can replay a stage solo on their own phone. That phone leaves the team first.
- **Relaxed timers.** A waiting teammate with relaxed timers on slows the player's timers too.
- **Rejoin.** A token in `localStorage` lets a reloaded phone tap **Back to {team}** and land on the current stage. Joining a team replaces any unfinished solo run on that phone.

## 4. Leaderboard, privacy and security

- **Stored.** One row per team run: name, size, families, duration, finish time, board date, hidden flag, plus a private retry token. Nicknames, device data and IPs are never stored. Nicknames travel only in ephemeral channel presence and stay in the storage of the device that typed them.
- **Writes** go only through `submit_run()`: validated, one row per token, server-set finish time. Anonymous clients can't insert, update or delete directly, and can't read the token, duration or hidden columns.
- **Anti-cheat.** Families 0–1200; duration **3–60 min** (`supabase/migrations/0002_min_duration.sql`; it was 8 min, which rejected quick genuine team runs). The database still has a `mode` column from an earlier design; the client always sends `booth`.
- **Rejected runs say why.** The debrief shows "Too quick for the board…" or "That team name can't go on the board" instead of a generic message (`rejectReason` in `src/net/group/submit.ts`).
- **Rate limit.** 30 new runs per 60 s, globally (no per-device data, for privacy). The facilitator hide is the backstop.
- **Facilitator PIN.** 6–8 digits, bcrypt-hashed. Lockout after 20 wrong PINs in 10 min. Set with `select private.set_facilitator_pin('…')`.
- **Submission.** The leader's phone (or the finale player if the leader is gone) queues one submission with retries (2 s → 60 s, dropped after 24 h). The result is broadcast so every phone shows the rank and highlights "Your team".
- **Board.** Today (top 20, resets at 00:00 SGT) and View all (top 50, with a date filter). `/host` polls every 10 s.
- **Secrets.** The Supabase URL and publishable key come from env vars (`.env.local` locally, Vercel env in production). Nothing secret is committed.

## 5. Accessibility, performance and platform

- **WCAG 2.2 AA.** axe is clean on every screen type in light and dark (`e2e/a11y.spec.ts`). Every gesture has a button; tap targets are ≥ 48 px; layouts work at 200% text and 360 px wide; there's one shared polite live region; focus moves to each new screen's heading.
- **Motion and sound.** Reduced motion is respected. Sound is off by default: two soft synthesised cues, no files. Haptics fire with the same events.
- **Performance.** Everything past Home is lazy-loaded (Stage 1 prefetched while Home is idle). Framer Motion loads after first paint. Entry JS ≈ 89 KB gzipped. Lighthouse mobile: performance 92–96, 100 for the rest.
- **Offline-ish.** A service worker precaches the build, so later stages open on flaky venue Wi-Fi; a failed lazy load shows "Reload". Supabase requests are never cached.
- **Fonts and colours.** System font stacks (nothing downloaded). Discipline colours from spec §9, with darker "-ink" variants for 4.5:1 text contrast.
- **Hosting.** Vercel, auto-deploying `main`. `vercel.json` adds the SPA rewrite for `/host`, no-cache on `sw.js` and immutable `/assets`.

## 6. Content awaiting approval

Career- and DIS-facing text is drafted and needs the project owner's approval before release (marked `NEEDS OWNER APPROVAL` in code). Preview at `/dev/components`.
- **Reality Check cards** (`src/content/realityChecks.json`, `needsApproval: true`):
  - Data, "Clean once, apply everywhere"
  - AI, "Confidence, not certainty"
  - Logic, "That was programming"
  - Cloud, "This is a real job"
- **Finale debrief** (`src/content/finaleCopy.json`):
  - the C4X match one-liners
  - the "Why digital matters to DIS" cards
  - the rank titles

## 7. Open questions

These all have working defaults; they're worth revisiting after playtests.
- **Timing.** Stage 3 runs long for first-timers (~4 min against 3); Stage 2 runs short (~2 min). Tune with real players (`docs/PLAYTEST_NOTES.md`).
- **Look.** Brand colours, a brand font, or logos, if allowed. The default is the spec colours, system fonts and no logos.
- **Moderation.** Have local facilitators review `blocklist.json` and `groupNames.json`. Custom team names appear on `/host` before a facilitator could hide them.
- **Event size.** Is a 30-runs-per-minute rate limit enough for the busiest session?
- **Photos.** Bonus Draw the Box could use licensed open-dataset photos instead of drawings.

## 8. Change history

- **Oct 2026, first build.** Milestones M0–M7 (spec §12): scaffold, backend, shared components, Stages 1–4, finale, group play with support cards, polish.
- **8 Oct 2026, owner playtest.** Stage 4 storms shortened to 45 s; player 1 leads; no digits in names; the lobby warns about players still connecting.
- **17 Oct 2026, guided Stage 3 and flow polish.** Stage 3 tutorial step by step, 💡 ghost hint after 1 failed run, +30 s per level, pre-placed If, 3★ at 80%. No skipping Reality Checks. Solo hand-off and extra intro screens removed; Live Ops "Next incident"; replays play one stage then return to the results; leaderboard minimum 3 min with clear rejection reasons; copy and layout fixes from a full playthrough audit.
- **17 Oct 2026, simplification.** Booth/full lengths and stage select removed. Team play became turn-taking with a Waiting screen (support cards, split controls and "all hands" calls removed). Bonus levels moved to replays. Stage 1 made easier: rule strip, more time, fewer cards, no duplicates or outliers in the core run, blank-field automate question. Player-facing "group" became "team".
