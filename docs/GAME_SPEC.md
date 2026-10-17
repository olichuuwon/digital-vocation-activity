# Let's Ship It: Game Design Spec

> A ~16-minute mobile web game, played **solo or as a team of 2–4 on their own phones**. It shows students (ages 12–25, Singapore) how the four **C4X Digital** specialisations in the **Digital and Intelligence Service (DIS)** work and combine into one system: **Software Development, Cloud Engineering, Artificial Intelligence Engineering and Data Science**.
> Designed for outreach booths and classrooms, where teams rotate between activities.
>
> This document describes how the game works and why. Implementation choices and their history are in `docs/DECISIONS.md`; a picture walkthrough is in `docs/GAME_FLOWS.md`.

---

## 0. Key choices

| Topic | Choice |
|---|---|
| Name | **Let's Ship It** |
| Country & language | Singapore, English (British/Singapore spelling). Times shown in SGT (UTC+8). |
| Audience | Ages 12–25, tech-savvy. Don't talk down to them: the tone must work for a 12-year-old *and* a 23-year-old. Smart, quick, light humour. |
| Roles | The four **C4X Digital** specialisations in DIS, with these exact names in-game. Descriptions are self-explanatory one-liners (§8.3). |
| Call to action | No hard sell. The end screen recaps **what they learned** in each specialisation and **why digital matters to DIS** (§8.3). |
| Scenario | Flood relief: humanitarian, no combat. |
| Length | **One run length, ≈ 16 min of play**, fitting a 20-minute rotation with joining and debrief (§2). |
| Modes | **Solo** (not ranked) and **Team** of 2–4 that **take turns**: one player per stage, everyone else on a Waiting screen (§3.5.2). |
| Replays | After a run, any stage can be replayed with its **bonus levels** (never ranked). |
| Leaderboard | Teams only. Resets daily (SGT), with a "View all" history. Shows team name, size, families reached and the clock time finished (`HH:MM`). §3.6. |
| Career copy | DIS- and career-facing text is drafted, then approved by the project owner before release. |
| Branding | No logos; the text "DIS" and "C4X Digital" only. |
| Accessibility | WCAG 2.2 AA (§10). |
| Connectivity | Online web app. Fails gracefully on a weak connection (§3.5.6). |
| Devices | Current iOS Safari and Android Chrome, 360 px wide and up. |
| Hosting | Static frontend on Vercel; Supabase free tier (Postgres + Realtime) for the leaderboard and team sync (§11.2). |
| Big screen | Optional `/host` view: join QR, teams playing now, live leaderboard. |
| Prizes | None in-game. |

---

## 1. Goals

1. **Fun first.** Earlier versions failed because they felt like lessons. Every screen must have something to *do* within 5 seconds. Reading is kept to a minimum.
2. **Show how it comes together.** Each stage's output is a real input to the next stage and to the finale. Players must *feel* that bad data leads to a worse AI and a worse outcome.
3. **"Reality Check" moments.** After players struggle manually, reveal how professionals solve it: automation, pipelines, Kubernetes, testing, human-in-the-loop AI. This is the "aha" and the career hook.
4. **No coding knowledge needed.** Problem solving, pattern spotting and logic only. Tricky but fair.
5. **Own phone, no accounts, no install.** Scan a QR to play solo or to join a team. Progress is saved locally so a player can resume or rejoin.
6. **Play together.** Teams of 2–4 play side by side and compete on the daily leaderboard. Teamwork mirrors how the four specialisations really work.

### Non-goals
- No combat or weapons content.
- No real hacking or cyber-offence content.
- No collection of personal data.

---

## 2. Session structure & timing

One length for everyone: **≈ 16 min of play** (core levels). It fits the 20-min rotation with about 2 min to join and 2 min of debrief and leaderboard. Two ways to play: **Solo** (one phone, plays everything, not ranked) and **Team** (2–4 phones, take turns, ranked; §3.5). Levels flagged `bonus` in content are not part of the first play-through: they unlock on **replays** (free play after the debrief, never ranked), and the game says so clearly ("There's more!").

**Team timing:** the player's phone owns the level timer. Hand-off cards (where the turn passes) are short, about 10s, with a "Ready" tap from the next player's phone.

| Segment | Budget | Expected, first-timer (2026-10-17) | Content |
|---|---|---|---|
| Prologue | 1 min | ~0.5 min | Mission briefing, 10-sec "how to play" |
| Stage 1: Data | 3 min | ~2.5–3 min (estimate) | §4 |
| Stage 2: AI | 3 min | ~2–2.5 min (QA measured 127 s) | §5 |
| Stage 3: Problem solving | 3 min | ~3.5–4 min (QA measured 241 s before the guided help; the 💡 ghost should shorten it) | §6 |
| Stage 4: Cloud/SRE | 3 min | ~3 min (estimate after the 45 s storms) | §7 |
| Finale: Mission Live | 2 min | ~2 min | §8 |
| Debrief & roles | 1 min | ~1 min | §8.3 |
| **Total** | **16 min** | **~15 min solo** (13–17); a team adds ~1–2 min for the lobby and hand-offs | |

Replays with bonus levels add roughly: Stage 1 +1 min, Stage 2 +1 min, Stage 3 +2 min. These are QA simulations and estimates; confirm in playtests (`docs/PLAYTEST_NOTES.md`).

Each stage follows the same rhythm, so players learn the pattern:

```
Briefing card (≤25 words) → Tutorial (starts straight from the briefing, 20–30s) → Level 1 → Level 2
→ [Bonus level: replays only] → REALITY CHECK (≤40s; every card shown, no skipping) → Stage result (stars)
→ Team: hand-off card to the next player · Solo: straight on to the next briefing
```

- **Key learning points can't be skipped.** The Reality Check shows every card; Next unlocks after a short read time (about 1 s, ×1.5 relaxed).
- Every level is **timeboxed** (timer shown). A stuck player can always progress: after 2 failed attempts, show a hint, and after 3 show the answer with reduced score (Stage 3 is gentler: §6). **No dead ends.**

---

## 3. Core systems

### 3.1 Game state (single store)
```ts
interface GameState {
  stage: 0|1|2|3|4|5;           // 5 = finale
  levelIndex: number;
  scores: {
    data:  { accuracy: number; fixedCount: number; ruleChosen: boolean };
    ai:    { labelAccuracy: number; earlyGuessBonus: number; auditCatch: number; modelAccuracy: number };
    logic: { puzzlesSolved: number; hintsUsed: number; efficiency: number };
    cloud: { manualUptime: number; autoUptime: number; costEfficiency: number };
    finale:{ familiesReached: number; incidentsRouted: number };
  };
  stars: Record<'data'|'ai'|'logic'|'cloud', 0|1|2|3>;
  bestFamilies: number;
  startedAt: number;
}
```
- Persist to `localStorage` after every level. Offer **Resume** on reopen.
- All values are normalised 0–1 internally.

### 3.2 Cross-stage dependencies (the "comes together" rules)
- `modelAccuracy = clamp(0.50 + 0.48 * (0.55*ai.labelAccuracy + 0.30*data.accuracy + 0.15*ai.auditCatch), 0.5, 0.98)`
- Stage 3 puzzles use the **player's own model** as a block. If modelAccuracy < 0.8, Level 3 shows some trucks mis-routed "because the AI misread the request". This tells players the result came from their own earlier choices.
- Stage 4 traffic volume scales with how good the app is: a better app means more users, and a harder but prouder launch.
- **Finale formula**
  `families = round(1200 * (0.15 + 0.85 * modelAccuracy * logicScore * (0.25 + 0.75 * cloudUptime)))`
  where `logicScore = clamp(1 - 0.08*hints - 0.05*extraBlocks, 0.55, 1)`.
- Show this chain visually in the finale (§8).

### 3.3 Feedback / juice (required everywhere)
- Haptics (`navigator.vibrate`, feature-detected): short tick on success, triple buzz on error.
- Streak counter (3+ correct in a row).
- Star rating per stage (0–3).
- Micro-animations on correct/incorrect. Respect `prefers-reduced-motion`.
- Optional sound, **off by default**, toggle in settings.

### 3.4 Content as data
All levels, records, images, puzzles and copy live in `/src/content/*.json` (or `.ts`), **not** hard-coded in components. Non-developers can then edit and translate them. Validate these files with a schema (zod) at build time.

### 3.5 Groups & multiplayer

#### 3.5.1 Entry flow
```
Scan booth QR (or open link)
 └─ Home: [ Play solo ]  [ Play as a team ]  [ Leaderboard ]   (+ [ Replay a stage ] after a finished run)
     ├─ Solo: play straight away. End card says "Solo runs aren't ranked. Team up to get on the board."
     └─ Play as a team: [ Create a team ]  [ Join a team ]
         ├─ Create: pick or generate a team name, then the LOBBY shows a big QR + 4-letter code (e.g. K7QM)
         │      Teammates scan the QR on the leader's phone (or type the code), enter a nickname (device-only, never stored server-side)
         │      Lobby shows members (max 4) and the **turn order** (reorder or shuffle). Leader taps START (needs ≥2)
         └─ Join: scan the leader's QR or type the code, enter a nickname, wait in the lobby
```
- Joining **closes at START**. A player who drops can **rejoin** from the same device (the session token is in localStorage).
- A lobby expires after 15 min without starting. A run expires 60 min after start.
- Optional `/host` view (a big screen at the venue): a QR to the game, teams currently playing (name, size, current stage), and the live leaderboard.

#### 3.5.2 How a team plays: take turns
Simple on purpose. Teammates stand together, so the talking happens in person.

- **The player:** each stage, one member plays on their own phone, exactly as in solo (Rulebook, Field guide, every button). They hold it where the others can see.
- **Everyone else:** their phone shows a **Waiting screen**: who is playing which stage and level, the team's stars so far, when their own turn comes, and a nudge to "watch and talk it through together". Nobody is idle: they read along and call out answers.
- **Rotation:** player 1 (the leader) plays the prologue and the finale; stages 1–4 rotate from player 2, so turns are as even as possible.
- **Hand-off:** at the end of a stage, the next player's phone shows "You're up next!" with an **I'm ready** button. **Only that player can start their turn**: the finishing player's card just says "Waiting for {name}…". If the next player's phone isn't connected, the finishing phone can play their turn instead, so the game never gets stuck.
- **Drops:** if the player's phone goes quiet for 20 s, the next connected member takes over from the start of that level.
- **Free play:** once the team is on the board, every member can pick any stage to replay solo on their own phone, with the bonus levels (not ranked). A replay is just that one stage, then back to the results.

#### 3.5.3 Team score & ranking
- The team shares one score per stage (the player's result), then §3.2 for `groupFamilies`.
- Rank: `groupFamilies` high to low, then shorter `durationSec` (stored, not displayed).
- Submitted once, automatically, when the team reaches the debrief.
- Debrief "Your C4X Digital match" is based on the team's stage results.

#### 3.5.4 Data stored server-side (only this)
`group_id, group_name, group_size, families, duration_sec, finished_at (timestamptz), board_date (SGT date), hidden (bool)`
Nicknames, device info, IPs, emails and any personal data are **never stored**. The team name is the only player-entered text stored. (Column names say `group` for historical reasons.) Live lobby presence (nicknames) lives only in ephemeral realtime channels, never in tables.

#### 3.5.5 Moderation
- Generated-name picker by default (adjective + Singapore animal/place, e.g. "Swift Kingfisher", "Bold Merlion").
- Custom names: max 20 chars, profanity filter (English plus common Singlish/Malay/Hokkien vulgarities, list in `src/content/blocklist.json`).
- The facilitator can hide a name from `/host` (PIN-protected, PIN checked server-side).

#### 3.5.6 Weak connection
- Gameplay runs locally. Only the lobby, team sync, hand-offs and score submission need the network.
- If the connection drops: keep playing, show a small "reconnecting" pill, and queue the score submission with retry.
- If a teammate disconnects for more than 30s at a hand-off: continue without them. They can rejoin at the current stage.

### 3.6 Leaderboard
- **Today** tab (default): resets 00:00 SGT, shows the top 20.
- **View all** tab: all-time top 50, plus a date filter.
- Row: rank · team name · 👥 size · families reached · finished at `HH:MM` (SGT clock time).
- The player's own team is highlighted, and pinned at the bottom if it's outside the top 20.
- Visible from the home screen, the debrief and `/host`.

---

## 4. Stage 1: Data Science "Clean the Data"

**Learning idea:** Data is messy. You need clear rules. Some errors can be fixed, not just deleted. Pros automate cleaning with rules and pipelines.

### 4.1 The Data Rulebook (instructions, always accessible)
A pinned "📘 Rulebook" button opens a bottom sheet. Show the **one new rule** as a card before each level. Rules:
1. **Every field must be filled.** Missing sector or people count means Trash.
2. **Numbers must make sense.** People 1–15, water 5–200 L per household.
3. **No duplicates.** Same household ID twice means trash the second. *(Not dealt since 2026-10-17: kept in the rulebook data only.)*
4. **Fix what's fixable.** Typos (`Sectr B` → `B`), wrong units (`40000 ml` → `40 L`), lowercase (`b` → `B`).
5. **Outlier ≠ error** *(bonus Spot the Outlier only)*. A household of 14 is unusual but possible, so keep it.

### 4.2 Levels
| Level | Mechanic | Rules in play | Size / time |
|---|---|---|---|
| Tutorial | Swipe 3 obvious cards with an animated hand hint | 1 | 3 cards, untimed |
| L1 Keep or Trash | Swipe right = keep, left = trash (buttons also available) | 1–2 | 8 cards / 60s |
| L2 Keep, Fix or Trash | Swipe up (or Fix button) opens a quick-fix picker with 2–3 options. New: fixes only | 1, 2, 4 | 8 cards / 90s |
| Bonus L3 Spot the Outlier | Bar chart of 20 households; tap bars that are **errors** (not just unusual) | 2, 5 | 3 charts / 45s |

- On an error, show a one-line toast naming the rule broken ("Rule 3: duplicate").
- **Hook (2026-10-17):** the briefing goes straight into the tutorial, which opens on a clean card, so the first swipe is a win within seconds. A **💧 people reached** counter grows with every record correctly kept or fixed. A **rule strip** above the card shows the rules in play as short chips ("Blank field → Trash", "People 1–15, water 5–200 L"…), so nobody has to memorise them.

### 4.3 Reality Check: "Clean once, apply everywhere"
Animation: the player's 16 hand-sorted cards shrink, then a counter shoots up to **2,000,000 records**. Text: *"You cleaned 16 by hand. Data scientists write each rule once as code, and a pipeline applies it to millions of rows in seconds."* The player then gets **one tap** to choose which rule to automate (3 options): *trash records with a blank field* (correct: a blank can never be guessed), *trash households over 12 people* (bins real data) or *trash every typo* (typos can be fixed). The correct choice gives a bonus.

### 4.4 Content needed
- `records.json`: ≥ 40 records (so replays vary), each with `valid | fixable | invalid`, the fix options, and the rule id. Sectors are letters A–F.

---

## 5. Stage 2: AI "Teach the Machine to See"

**Learning idea:** AI learns from labelled examples. Partial information lowers confidence. Humans must check AI output. Biased training data leads to failures.

### 5.1 Levels
| Level | Mechanic | Size / time |
|---|---|---|
| Tutorial | One clear image, tap the right label from 3 | untimed |
| L1 Build the Training Set | Clear images, pick 1 of 4 labels. Fast and streak-driven. | 12 images / 30s |
| L2 Covered Up | The image is hidden under a 4×4 tile grid. Tiles reveal one at a time (every 0.6s). Guess early for more points. A wrong guess costs 1 extra tile and a small penalty. | 8 images / ~60s |
| Bonus L3 Draw the Box | Drag a box around the item (object detection). Score = overlap (IoU) with the true box: ≥0.5 good, ≥0.75 perfect. | 5 images / 45s |
| L4 Audit the AI | "Your" model shows 8 predictions with confidence %. Flag the wrong ones. Includes 1 low-confidence correct and 1 high-confidence wrong. | 8 / 40s |

### 5.2 Label set
Relief-themed classes (8): water, food, medical kit, blanket, tent, generator, flooded road, clear road.
The "road" classes set up the Finale incident (the model fails on night-time flooded roads = training data bias).

### 5.3 Reality Check: "Confidence, not certainty"
Show the model's training curve rising, fed by the player's labels (their count is highlighted). Then show a night-time photo where the model says *"clear road: 91%"* but the road is flooded. Text: *"Your model never saw night photos. Real AI teams hunt for gaps like this and keep humans checking the results."*

### 5.4 Assets (hybrid)
- Needed: ~60 images across 8 classes, including ~6 night/low-light road images. Each needs `{id, label, box:[x,y,w,h], variant:'day'|'night', source, licence}`.
- **All levels** use flat SVG illustrations made for the game: consistent style, no licensing issues, tiny size. Tile-reveal works on SVG.
- **Option for bonus L3 "Draw the Box":** real photos from open datasets that already include bounding boxes, e.g. **Open Images** (images CC BY 2.0, box annotations CC BY 4.0) or **COCO** (annotations CC BY 4.0; image licences vary per photo). For flood-road photos, search Kaggle / Hugging Face for road-flooding datasets and **check each dataset's licence** before use.
  - Only use images whose licence allows reuse with attribution. Record every image in `assets/CREDITS.md` and show a "Photo credits" link in settings.
  - Avoid identifiable faces and licence plates; crop or skip such images.
  - Compress to WebP ≤ 60 KB each.
- Nice touch: tell players these photos come from real datasets used to train AI.

---

## 6. Stage 3: Problem Solving "Build the Logic"

**Learning idea:** Programming is breaking problems into steps, making decisions, repeating, and debugging. There is **no code syntax** on screen, only plain-language blocks with icons. Tricky, never jargon.

### 6.1 Setting
A small top-down grid map (6×6 to 8×8) with a depot, roads, flooded tiles and families' houses. The player programs a **supply truck**.

### 6.2 Block palette (introduced gradually)
`Move forward` · `Turn left` · `Turn right` · `Drop supplies` · `Repeat ×N { }` · `If road ahead is flooded { } else { }` · `Ask the AI: what does this house need?` (uses the Stage 2 model)

### 6.3 Levels
| Level | Concept | Twist that makes it tricky | Block limit | Time |
|---|---|---|---|---|
| Tutorial | Sequence | Get to one house. **Step-by-step:** each block to tap is highlighted, then Run. | none | untimed |
| L1 Order the Steps | Sequence | Two houses, one optimal order | 8 | 90 s |
| L2 Say It Shorter | Loops | Same route must fit in fewer blocks, so a `Repeat` is needed | 5 | 105 s |
| L3 Choose the Road | Conditions | Flooding is **random each run**, so one fixed route fails. The `If flooded` block **starts in place**; fill in both roads. | 9 | 120 s |
| Bonus L4 Debug It | Debugging | A pre-built program fails. Press Run, watch where the truck goes wrong, tap the bad block and swap it. | fix 1–2 blocks | 105 s |
| Bonus L5 Ask the AI | Integration | Houses need different supplies. Use the AI block. Low modelAccuracy leads to some wrong drops (tied to Stage 2). | 8 | 105 s |

- **Run** animates the truck step by step. **Step** button available. Unlimited attempts.
- **Guided help:** after **1** failed run, a hint plus a dashed **💡 ghost "next step"** in the program (add this block / change this one / set Repeat ×N / remove this one); one tap applies it. After 3 failed runs, **Show me** loads a working program.
- Scoring: solved + under block limit = 3★. Tapping the ghost counts as a hint and Show me as an answer; **3★ at 80%**, so one hint still earns 3★.
- Tap-to-add and tap-to-remove are required. Drag-to-reorder is a nice-to-have. Must work one-handed on 360px width.

### 6.4 Reality Check: "That was programming"
Side-by-side: the player's block program morphs into ~6 lines of real Python. Text: *"Same logic, different words. Software engineers also write automatic tests that run your program on thousands of maps before it ships."* Quick animation of 100 mini-maps, all passing ✓ (or a few failing if the player's solution was fragile).

---

## 7. Stage 4: Cloud / SRE "Keep It Alive" (the Kubernetes reveal)

**Learning idea:** Manually managing servers doesn't scale. Load balancing, autoscaling and self-healing (e.g. Kubernetes) solve it. There's a trade-off between reliability and cost.

### 7.1 Phase A: Manual Mode (intentionally overwhelming) ~60–90s
- Current prototype mechanic: 3 servers with load bars. Tap to boost. Crashed servers need a tap to restart. A bad deploy needs a Roll back tap.
- Traffic is **uneven** (one server gets hammered) and ramps up to ×10.
- Tune the difficulty so most players end at 60–80% uptime and feel the pain. That's the point.

### 7.2 Reality Check (mid-stage): "Meet Kubernetes"
An interstitial explains, one card each, with a tiny animation:
1. **Pods**: your app runs in many small identical copies.
2. **Load balancer**: spreads users evenly across pods (animate dots re-routing).
3. **Autoscaler (HPA)**: adds pods when busy and removes them when quiet.
4. **Self-healing**: if a pod crashes, Kubernetes replaces it automatically (liveness probe).
5. **Rolling updates**: new versions go out a few pods at a time and roll back automatically if health checks fail.

Plain language, ≤20 words per card.

### 7.3 Phase B: Configure the Cluster ~45s
Starts straight after the "Meet Kubernetes" cards (labelled *How it works*), with no extra intro screen; "Replay the storm" likewise starts Phase C directly.

The player sets:
- `Load balancer`: on/off toggle
- `Min pods` / `Max pods` steppers (1–12)
- `Scale up when CPU >` slider (40–90%)
- `Self-healing`: on/off
- `Rolling update + auto-rollback`: on/off

Show a live **cost meter** (credits per minute) against a **budget**.

### 7.4 Phase C: Replay the same traffic storm ~45s (×3 fast-forward)
The player watches (with the option to intervene) the **same traffic pattern** from Phase A. Show the pods count graph, the uptime % and the cost at the same time.
- Goal: **≥ 99% uptime AND under budget** = 3★.
- Bad configs fail in teachable ways. Max pods too low means crashes under peak. Threshold too high means scaling too late. Everything maxed means over budget.
- End card compares **Manual vs Auto** uptime side by side.

### 7.5 Simulation spec (deterministic, testable)
- Tick 100 ms. Traffic curve = scripted keyframes + seeded noise (seed per run, same seed for Phase A and Phase C).
- Pod capacity = 100 req/s. CPU% = assigned load / capacity.
- A pod crashes if CPU > 100% for > 1.5s. Self-healing restarts it after 3s (15s manual).
- HPA evaluates every 2s and takes 4s to add a pod (a cold start, which teaches why thresholds matter).
- A bad deploy at a scripted time: without auto-rollback, error rate is 50% until the player taps Roll back.
- The sim lives in `/src/sim/cluster.ts` as a pure function `step(state, dt, config, rng)`, with unit tests.

### 7.6 Reality Check (end): "This is a real job"
*"SREs keep apps like this running for millions of people, and set up alerts so a human only gets woken up when automation can't fix it."*

---

## 8. Finale: "Mission Live" + Debrief

### 8.1 Pipeline reveal (~20s)
Animated chain: 📊 data quality → 🧠 model accuracy → 🧩 logic score → ☁️ uptime, each showing the player's number. A family counter then ticks up. The same screen says how Live Ops works, and its **Start shift** button starts it (one tap).

### 8.2 Live Ops (~90s): teamwork incidents
A live dashboard runs. Incidents pop up; the player routes each to the right team (4 buttons) within 8 seconds:
| Incident | Correct team |
|---|---|
| "Requests arriving with blank sectors" | Data |
| "AI says flooded road is clear at night" | AI (retrain with night photos) |
| "Trucks all turning left at junction 4" | Software |
| "Traffic spike after news broadcast" | Cloud/SRE |
| "Duplicate families getting double supplies" | Data |
| "New update causing errors" | Cloud/SRE (roll back) |

~8 incidents, shuffled. Each correct route adds families, and each miss costs families. After each answer a short "why" shows; **Next incident** moves on straight away. This makes the point: **one team can't do it alone.**

Use the specialisation names on the routing buttons: Data Science · AI Engineering · Software Development · Cloud Engineering.

**Team mode:** the finale is played on the leader's phone, like solo; teammates watch and call out the right team.

### 8.3 Debrief
- Big number: families reached / 1,200. Rank title. "New best" if applicable.
- **Your C4X Digital match**: the four specialisations ranked by the run's normalised stage performance (a team shares one result):
  - **Data Science**: turns messy data into trustworthy insight.
  - **Artificial Intelligence Engineering**: builds and checks AI that can see, predict and decide.
  - **Software Development**: builds the apps and systems people rely on.
  - **Cloud Engineering**: keeps systems running at scale, automatically.
- **What you learned** (one line per stage, based on what they actually did), e.g. *"You cleaned 20 records by hand and saw how one rule cleans millions."*
- **Why digital matters to DIS**: 2–3 short cards on how data, AI, software and cloud work *together* to support defence and missions like disaster relief. Drafted, then **approved by the project owner** before release.
- Team mode: a leaderboard rank reveal ("You're #3 today!") on every phone.
- **"Replay with bonus levels"** (the main button) and **"New run"**: a "🔓 There's more!" callout, then a stage picker that shows how many bonus levels each stage adds. A replay plays that one stage, then returns to these results. Also on Home while the last run is finished.
- End card designed to be **screenshot-friendly** (fits one screen, shows name-free score, rank, date).

---

## 9. Visual & UX guidelines

- **Mobile portrait first**: 360–430px wide. One-thumb reach, primary actions in the bottom 40% of the screen, tap targets ≥ 48px.
- Each discipline has a colour, used consistently (pipeline strip, buttons, tags): Data teal `#0FA595`, AI violet `#7C4DFF`, Logic amber `#E8950C`, Cloud blue `#2E8FE8`. Replace these with brand colours if D2 is supplied.
- A persistent **pipeline strip** at the top shows progress through the 4 teams (carried over from the prototype).
- Light and dark themes (follow the system setting and allow a toggle).
- Fonts: one display and one highly legible body font, both self-hosted (for offline).
- Copy: reading age 12–14, sentence case, active verbs, ≤25 words per instruction card, no acronyms without a plain explanation.
- Tone: encouraging, a little playful, never patronising. No "hacker" clichés.

---

## 10. Accessibility (WCAG 2.2 AA)
- Every gesture has a button alternative (swipe → Keep/Fix/Trash buttons, drag box → corner handles plus nudge buttons).
- Never rely on colour alone (shapes and icons as well).
- Text scales to 200% without breaking layout.
- Screen-reader labels on all interactive elements, and live-region announcements for results.
- Timers: a "relaxed mode" setting gives ×1.5 time (important for SEN players and classrooms).
- `prefers-reduced-motion` disables shake/bounce and shortens the Reality Check animations.

---

## 11. Technical requirements

- **Stack:** Vite + React + TypeScript (strict), Zustand for state, CSS Modules or Tailwind, Framer Motion for UI motion, `<canvas>` or SVG for the grid and cluster sims. No backend by default.
- **Web app:** online required. Cache static assets for fast reloads; full offline play isn't required.
- **Performance:** initial JS ≤ 250 KB gzipped, playable within 3s on mid-range Android over 4G, 60fps in sims on a 2019-era phone.
- **Privacy (PDPA-minded; many players are minors):** no cookies beyond functional localStorage, no third-party trackers, no PII stored server-side. The only network calls go to the leaderboard/realtime backend (§11.2).

### 11.2 Backend (free tier)
- **Supabase**: a `runs` table (fields in §3.5.4) plus Realtime channels for lobbies, team sync and hand-offs.
- Row Level Security: anonymous clients may **insert** one run per team token and **select** non-hidden rows only. Hide/unhide goes through a server-side function that checks the facilitator PIN.
- Basic anti-cheat: a server-side check rejects families > 1200 or implausibly short runs (< 3 min, migration `0002`). Rate-limit submissions. A rejected run tells the team why (too quick, name not allowed).
- Daily board = `board_date = (now() at time zone 'Asia/Singapore')::date`.
- Keys in env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`), with a committed `.env.example`. Never commit secrets.
- The static frontend deploys to Vercel.
- **Testing:**
  - Vitest unit tests for all scoring formulas, the cluster sim, puzzle solvers and IoU.
  - Every Stage 3 puzzle must have an automated solver test proving it's solvable within the block limit.
  - Playwright e2e on mobile viewports (iPhone 12, Pixel 5): a full run completes and resume works.
  - Content schema validation in CI.
- **Debug:** `?debug=1` shows stage skip buttons, the seed and live scores. `?stage=3` jumps to a stage.
- **Facilitator params:** `?relaxed=1`. Route `/host` for the big-screen view.
- **Team testing:** a `?fakePeers=3` debug flag simulates teammates locally. Playwright runs a 3-browser-context team test.

### 11.1 Suggested folder structure
```
src/
  app/            # routing, shell, pipeline strip, settings
  state/          # zustand store, persistence, scoring formulas
  stages/
    data/  ai/  logic/  cloud/  finale/
  components/     # shared UI: Timer, StarResult, RealityCheck, Toast, Rulebook
  sim/            # cluster.ts, grid.ts (pure logic + tests)
  content/        # *.json + zod schemas
  assets/         # svg/webp, fonts
docs/
  GAME_SPEC.md  DECISIONS.md  PLAYTEST_NOTES.md
```

---

## 12. Build history

The game was built in playable milestones; all are complete.

| Milestone | Delivered |
|---|---|
| M0 | Scaffold, CI, PWA shell, theme, pipeline strip, state + persistence, debug params |
| M0.5 | Supabase schema, row-level security, leaderboard read/write, `/host` |
| M1 | Shared components (briefing, tutorial overlay, timer, stars, Reality Check, hand-off, rulebook) and the `/dev/components` gallery |
| M2–M5 | Stages 1–4, each with its Reality Check, pure logic and tests (puzzle solver, cluster sim, IoU) |
| M6 | Finale, debrief, replays |
| M6.5 | Team play: create/join via QR + code, lobby, rotation, sync, team submission, moderation |
| M7 | Polish: haptics, sound, relaxed mode, accessibility pass (axe clean), performance (Lighthouse mobile ≥ 90) |
| Oct 2026 | Simplified: one run length, Solo/Team with turn-taking, bonus levels on replays, an easier Stage 1 |
| Next | Playtests with 5+ teens; tune timings and difficulty (target median run 14–17 min) |

---

## 13. Playtest checklist
- Did they smile or say "one more go" at least once per stage?
- Where did they hesitate for more than 5 seconds without acting? (Fix the UI or copy there.)
- Can they explain in their own words what one of the four roles does?
- Did anyone get stuck without a way forward? (Must be zero.)
- Team mode: did the waiting players talk at least every ~20s? Did anyone tune out for a whole stage? (Must be zero.)
- Record findings in `docs/PLAYTEST_NOTES.md`.
