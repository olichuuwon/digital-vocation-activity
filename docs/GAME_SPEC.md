# Ship It: Game Design & Build Spec

> Working title. A 15–30 minute mobile web game, played **solo or in groups of 2–4 on their own phones**. It shows students (ages 12–25, Singapore) how the four **C4X Digital** specialisations in the **Digital and Intelligence Service (DIS)** work and combine into one system: **Software Development, Cloud Engineering, Artificial Intelligence Engineering and Data Science**.
> Played at a booth in a high-potential students programme. Groups rotate booth to booth in a classroom-like setting.
>
> Items marked **`[FILL]`** are decisions or content the project owner must supply. Claude Code must not invent answers for `[FILL]` items. It should use the stated default (if any) and log the assumption in `docs/DECISIONS.md`.

---

## 0. Decisions

### 0.1 Settled
| # | Decision | Answer |
|---|----------|--------|
| D1 | Game name | "Ship It" (working title, final name `[FILL]`) |
| D3 | Country | Singapore. Times shown in SGT (UTC+8). Spelling: British/Singapore English. |
| D4 | Audience | Ages 12–25, tech-savvy. Don't talk down to them. The tone must work for a 12-year-old *and* a 23-year-old: smart, quick, light humour. |
| D5 | Language | English |
| D6 | Roles | **C4X Digital** specialisations in DIS: Software Development, Cloud Engineering, Artificial Intelligence Engineering, Data Science. Use these exact names in-game. Descriptions are self-explanatory one-liners (§8.3). |
| D7 | Call to action | No hard sell. The end screen recaps **what they learned** in each specialisation and **why digital matters to DIS** (§8.3). |
| D8 | Venue | Booth in a high-potential students programme. Groups rotate between booths, classroom-like. |
| D9 | Leaderboard | Yes, **groups only** (2–4 players). Solo runs are not ranked. The board resets daily (SGT) and has a "View all" history. Shows group name, group size and completion time HH:MM. See §3.6. |
| D11 | Hosting | Free static hosting, service name `[FILL]`. The leaderboard and realtime need a free backend tier (§11.2). |
| D12 | Stage 2 images | Hybrid (§5.4): in-repo SVG illustrations for most levels, plus open-dataset photos with attribution for the "Draw the Box" level. |
| D13 | Scenario | Keep flood relief (humanitarian, no combat). |
| D14 | Content approver | The project owner (human) approves all DIS/recruitment-facing copy before release. Claude Code flags this copy and does not finalise it. |
| D15 | Accessibility | WCAG 2.2 AA |
| D16 | Connectivity | Online web app (internet required). Fail gracefully on a weak connection (§3.5.6). Offline caching is not required. |
| D17 | Devices | Generalist: current-ish iOS Safari and Android Chrome, 360px+ width |
| D18 | Booth rotation | **20 min**, including joining and the debrief. The booth default is **Booth mode ≈ 16 min of play** (§2). |
| D19 | Group play | **One main phone + support phones** (asymmetric co-op, §3.5.2). The main player role **rotates each stage**, so everyone is involved and talking. |
| D20 | Leaderboard time | **Clock time finished**, `HH:MM` SGT (e.g. 14:32) |

### 0.2 Still open (use the default until answered)
| # | Question | Default |
|---|----------|---------|
| Q1 | DIS logo / official branding allowed in-game? | No logos; text mention of "DIS" and "C4X Digital" only |
| Q5 | Ranking order | Families reached (high to low), tie-break shorter run duration (duration is stored but not displayed) |
| Q6 | Group names | Pick from a generated list (e.g. "Swift Kingfisher") **or** type a custom name that passes a profanity filter and the facilitator can hide |
| Q7 | Is there a big screen / TV at the booth? | Assume yes: a `/host` view shows the join QR plus a live leaderboard (optional, game works without it) |
| Q8 | Free backend choice | Supabase free tier (Postgres + Realtime). Firebase is the alternative. |
| Q9 | Prizes or daily winner announcement? | None in-game |

---

## 1. Goals

1. **Fun first.** Earlier versions failed because they felt like lessons. Every screen must have something to *do* within 5 seconds. Reading is kept to a minimum.
2. **Show how it comes together.** Each stage's output is a real input to the next stage and to the finale. Players must *feel* that bad data leads to a worse AI and a worse outcome.
3. **"Reality Check" moments.** After players struggle manually, reveal how professionals solve it: automation, pipelines, Kubernetes, testing, human-in-the-loop AI. This is the "aha" and the career hook.
4. **No coding knowledge needed.** Problem solving, pattern spotting and logic only. Tricky but fair.
5. **Own phone, no accounts, no install.** Scan a QR to play solo or to join a group. Progress is saved locally so a player can resume or rejoin.
6. **Play together.** Groups of 2–4 play side by side and compete on the daily leaderboard. Teamwork mirrors how the four specialisations really work.

### Non-goals
- No combat or weapons content.
- No real hacking or cyber-offence content (that's a separate team's game).
- No collection of personal data.

---

## 2. Session structure & timing

Two lengths from the same content:
- **Booth run ≈ 16 min of play** (default): core levels only. It fits the 20-min rotation with about 2 min to join and 2 min of debrief and leaderboard.
- **Full run ≈ 25–30 min**: core + bonus levels (other events / home).
URL values: `?mode=booth|full` (`quick` is an alias of `booth`).

The facilitator sets the length for the session via the `/host` view or URL param `?mode=booth|full`. A solo player picks it themselves. Within a group, everyone plays the same length, and the group leader's choice applies.

**Group timing:** the main phone owns the level timer. Support phones mirror it. Hand-off cards (also where the main player role rotates) are short, about 10s, with a "Ready" tap from the next main player.

| Segment | Booth | Full | Content |
|---|---|---|---|
| Prologue | 1 min | 1.5 min | Mission briefing, pick run length, 10-sec "how to play" |
| Stage 1: Data | 3 min | 5–6 min | §4 |
| Stage 2: AI | 3 min | 5–6 min | §5 |
| Stage 3: Problem solving | 3 min | 5–6 min | §6 |
| Stage 4: Cloud/SRE | 3 min | 5–6 min | §7 |
| Finale: Mission Live | 2 min | 3 min | §8 |
| Debrief & roles | 1 min | 1.5 min | §8.3 |

Each stage follows the same rhythm, so players learn the pattern:

```
Briefing card (≤25 words) → Tutorial (interactive, 20–30s) → Level 1 → Level 2 → [Bonus level: full only]
→ REALITY CHECK (animated reveal, ≤40s, tap to advance) → Stage result (stars) → Hand-off card to next team
```

Every level is **timeboxed** (timer shown). A stuck player can always progress: after 2 failed attempts, show a hint, and after 3 show the answer with reduced score. **No dead ends.**

---

## 3. Core systems

### 3.1 Game state (single store)
```ts
type Mode = 'booth' | 'full';
interface GameState {
  mode: Mode;
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
 └─ Home: [ Play solo ]  [ Create group ]  [ Join group ]  [ Leaderboard ]
     ├─ Solo: pick length, play. End card says "Solo runs aren't ranked. Team up to get on the board."
     ├─ Create group: pick or generate a group name, then the LOBBY shows a big QR + 4-letter code (e.g. K7QM)
     │      Teammates scan the QR on the leader's phone (or type the code), enter a nickname (device-only, never stored server-side)
     │      Lobby shows members (max 4) and the **main player rotation order** (drag to reorder, or shuffle). Leader taps START (needs ≥2 for a ranked run)
     └─ Join group: scan the leader's QR or type the code, enter a nickname, wait in the lobby
```
- Joining **closes at START**. A player who drops can **rejoin** from the same device (the session token is in localStorage).
- A lobby expires after 15 min without starting. A run expires 60 min after start.
- Optional `/host` view (booth big screen): a QR to the game, groups currently playing (name, size, current stage), and the live leaderboard.

#### 3.5.2 How a group plays: one main phone + support phones
Inspired by party games like *Keep Talking and Nobody Explodes* and *Spaceteam*. **The main player can't win alone: key information or controls live on the support phones**, so the group has to talk. This mirrors real C4X teams, where specialists depend on each other.

- **Main phone:** plays the stage (the board, swipes, taps). Held where everyone can see it.
- **Support phones:** each gets a **support card** for that stage: information, a tool or a power the main player needs. Supports shout, point and tap.
- **Rotation:** the main player role passes to the next member at every stage hand-off. With 4 players, each is main once. With 2–3, the rotation wraps (in a 3-player group, member 1 is also main in Stage 4).
- **Splitting support cards:** with 1 support, that phone gets all the support cards for the stage (tabs). With 2–3 supports, cards are dealt one per phone. Every support phone always has *something* to do.
- **Solo:** one phone gets everything. Support info appears as in-app panels (e.g. the Rulebook sheet), so solo players see the same content.

| Stage | Main phone does | Support cards (dealt across support phones) |
|---|---|---|
| 1 Data | Swipes Keep / Fix / Trash | **📘 Rulebook**: the main player *can't* see the rules in group mode, so a support reads them out. **🔍 Duplicate scanner**: shows the IDs already kept, so the support calls out "seen #14 already!". **🛠️ Fix kit**: the correct fix option for fixable records (the main player picks from 3 options). |
| 2 AI | Labels images, draws boxes | **👁️ Reveal power**: the support taps to uncover one extra tile (limited charges). **📖 Field guide**: what each class looks like ("medical kits have a red cross"). **🧪 Auditor**: in the Audit level, sees the model's confidence numbers, which are hidden on the main phone. |
| 3 Logic | Builds and runs the truck program | **🗺️ Scout map**: only support phones see which roads are flooded this run. The main player sees a fogged map. **📦 Manifest**: which supplies each house needs (for the AI block level). **🐞 Debugger**: in Debug It, sees a replay of the failing run step by step. |
| 4 Cloud | Watches the cluster dashboard, rolls back bad deploys | Manual phase: **each support controls one server's boost/restart button**. In a 2-player group, one phone holds all three. K8s phase: settings are split, e.g. **⚖️ load balancer + self-healing** on one phone, **📈 autoscaler sliders** on another, **💰 budget meter** shown to all. |
| Finale | Live family counter + incident feed | Each incident appears **only on the phone of the support who holds that specialisation**. They route it, and the main player confirms. Plus 2 "all hands" incidents where every phone taps within 5s. |

- **Haptics as signals:** a support phone buzzes when it has new info, so supports glance down only when needed and otherwise watch the main screen.
- Each support card shows **≤15 words of instruction** plus the info itself, readable at a glance.

#### 3.5.3 Group score & ranking
- The group shares one score per stage (the main phone's result, plus bonuses earned by support actions), then §3.2 for `groupFamilies`.
- Rank: `groupFamilies` high to low, then shorter `durationSec` (stored, not displayed).
- Submitted once, automatically, when the group reaches the debrief.
- Debrief "Your C4X Digital match" is per member, based on the stage they led plus their support contributions.

#### 3.5.4 Data stored server-side (only this)
`group_id, group_name, group_size, families, duration_sec, finished_at (timestamptz), board_date (SGT date), hidden (bool)`
Nicknames, device info, IPs, emails and any personal data are **never stored**. The group name is the only player-entered text stored. Live lobby presence (nicknames) lives only in ephemeral realtime channels, never in tables.

#### 3.5.5 Moderation
- Generated-name picker by default (adjective + Singapore animal/place, e.g. "Swift Kingfisher", "Bold Merlion").
- Custom names: max 20 chars, profanity filter (English plus common Singlish/Malay/Hokkien vulgarities, list in `src/content/blocklist.json`).
- The facilitator can hide a name from `/host` (PIN-protected, PIN checked server-side).

#### 3.5.6 Weak connection
- Gameplay runs locally. Only the lobby, hand-off syncs, finale incidents and score submission need the network.
- If the connection drops: keep playing, show a small "reconnecting" pill, and queue the score submission with retry.
- If a teammate disconnects for more than 30s at a hand-off: continue without them. They can rejoin at the current stage.

### 3.6 Leaderboard
- **Today** tab (default): resets 00:00 SGT, shows the top 20.
- **View all** tab: all-time top 50, plus a date filter.
- Row: rank · group name · 👥 size · families reached · finished at `HH:MM` (SGT clock time).
- The player's own group is highlighted, and pinned at the bottom if it's outside the top 20.
- Visible from the home screen, the debrief and `/host`.

---

## 4. Stage 1: Data Science "Clean the Data"

**Learning idea:** Data is messy. You need clear rules. Some errors can be fixed, not just deleted. Pros automate cleaning with rules and pipelines.

### 4.1 The Data Rulebook (instructions, always accessible)
A pinned "📘 Rulebook" button opens a bottom sheet. Show the **one new rule** as a card before each level. Rules:
1. **Every field must be filled.** Missing sector or people count means Trash.
2. **Numbers must make sense.** People 1–15, water 5–200 L per household.
3. **No duplicates.** Same household ID twice means trash the second.
4. **Fix what's fixable.** Typos (`Sectr B` → `B`), wrong units (`40000 ml` → `40 L`), lowercase (`b` → `B`).
5. **Outlier ≠ error.** A household of 14 is unusual but possible, so keep it.

### 4.2 Levels
| Level | Mechanic | Rules in play | Size / time |
|---|---|---|---|
| Tutorial | Swipe 3 obvious cards with an animated hand hint | 1 | 3 cards, untimed |
| L1 Keep or Trash | Swipe right = keep, left = trash (buttons also available) | 1–3 | 10 cards / 40s |
| L2 Keep, Fix or Trash | Swipe up (or Fix button) opens a quick-fix picker with 2–3 options | 1–5 | 10 cards / 60s |
| Bonus L3 Spot the Outlier | Bar chart of 20 households; tap bars that are **errors** (not just unusual) | 2, 5 | 3 charts / 45s |

- On an error, show a one-line toast naming the rule broken ("Rule 3: duplicate").

### 4.3 Reality Check: "Clean once, apply everywhere"
Animation: the player's 20 hand-sorted cards shrink, then a counter shoots up to **2,000,000 records**. Text: *"You cleaned 20 by hand. Data scientists write each rule once as code, and a pipeline applies it to millions of rows in seconds."* The player then gets **one tap** to choose which rule to automate (3 options). The correct choice gives a bonus.

### 4.4 Content needed
- `records.json`: ≥ 40 records (so replays vary), each with `valid | fixable | invalid`, the fix options, and the rule id. **`[FILL]` optional: local place or sector names.**

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
- **L1, L2 and L4:** flat SVG illustrations generated in-repo by Claude Code. Consistent style, no licensing issues, tiny size. Tile-reveal works on SVG.
- **Bonus L3 "Draw the Box":** real photos from open datasets that already include bounding boxes, e.g. **Open Images** (images CC BY 2.0, box annotations CC BY 4.0) or **COCO** (annotations CC BY 4.0; image licences vary per photo). For flood-road photos, search Kaggle / Hugging Face for road-flooding datasets and **check each dataset's licence** before use.
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
| Level | Concept | Twist that makes it tricky | Block limit |
|---|---|---|---|
| Tutorial | Sequence | Get to one house | none |
| L1 Order the Steps | Sequence | Two houses, one optimal order | 8 |
| L2 Say It Shorter | Loops | Same route must fit in fewer blocks, so a `Repeat` is needed | 5 |
| L3 Choose the Road | Conditions | Flooding is **random each run**, so one fixed route fails. Must use `If flooded`. | 7 |
| Bonus L4 Debug It | Debugging | A pre-built program fails. Press Run, watch where the truck goes wrong, tap the bad block and swap it. | fix 1–2 blocks |
| Bonus L5 Ask the AI | Integration | Houses need different supplies. Use the AI block. Low modelAccuracy leads to some wrong drops (tied to Stage 2). | 8 |

- **Run** animates the truck step by step. **Step** button available. Unlimited attempts; hints after 2 fails.
- Scoring: solved + under block limit = 3★. Each hint lowers the score.
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

### 7.3 Phase B: Configure the Cluster ~60s
The player sets:
- `Load balancer`: on/off toggle
- `Min pods` / `Max pods` steppers (1–12)
- `Scale up when CPU >` slider (40–90%)
- `Self-healing`: on/off
- `Rolling update + auto-rollback`: on/off

Show a live **cost meter** (credits per minute) against a **budget**.

### 7.4 Phase C: Replay the same traffic storm ~60–90s
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
Animated chain: 📊 data quality → 🧠 model accuracy → 🧩 logic score → ☁️ uptime, each showing the player's number. A family counter then ticks up.

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

~8 incidents, shuffled. Each correct route adds families, and each miss costs families. This makes the point: **one team can't do it alone.**

Use the specialisation names on the routing buttons: Data Science · AI Engineering · Software Development · Cloud Engineering.

**Group mode:** the main phone shows the live family counter and incident feed. Each incident's routing buttons appear only on the support phone holding that specialisation (§3.5.2), so teammates must call out to each other. Add 2 **"all hands"** incidents that need every member to tap within 5s (e.g. "Major storm: all teams confirm ready").

### 8.3 Debrief
- Big number: families reached / 1,200. Rank title. "New best" if applicable.
- **Your C4X Digital match**: the four specialisations ranked by the player's normalised stage performance (in a group, each member sees their own):
  - **Data Science**: turns messy data into trustworthy insight.
  - **Artificial Intelligence Engineering**: builds and checks AI that can see, predict and decide.
  - **Software Development**: builds the apps and systems people rely on.
  - **Cloud Engineering**: keeps systems running at scale, automatically.
- **What you learned** (one line per stage, based on what they actually did), e.g. *"You cleaned 20 records by hand and saw how one rule cleans millions."*
- **Why digital matters to DIS**: 2–3 short cards on how data, AI, software and cloud work *together* to support defence and missions like disaster relief. Drafted by `content-writer` and **approved by the project owner (D14)** before release.
- Group mode: a leaderboard rank reveal ("You're #3 today!").
- "Play again" and "Replay a stage" (chapter select unlocked after the first finish).
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
- Default **Supabase** (Q8): a `runs` table (fields in §3.5.4) plus Realtime channels for lobbies, hand-off sync and finale incidents.
- Row Level Security: anonymous clients may **insert** one run per group token and **select** non-hidden rows only. Hide/unhide goes through a server-side function that checks the facilitator PIN.
- Basic anti-cheat: a server-side check rejects families > 1200 or implausibly short durations (< 8 min booth, < 15 min full). Rate-limit submissions.
- Daily board = `board_date = (now() at time zone 'Asia/Singapore')::date`.
- Keys in env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`), with a committed `.env.example`. Never commit secrets.
- The static frontend deploys to the free host `[FILL: D11]`.
- **Testing:**
  - Vitest unit tests for all scoring formulas, the cluster sim, puzzle solvers and IoU.
  - Every Stage 3 puzzle must have an automated solver test proving it's solvable within the block limit.
  - Playwright e2e on mobile viewports (iPhone 12, Pixel 5): a full booth run completes and resume works.
  - Content schema validation in CI.
- **Debug:** `?debug=1` shows stage skip buttons, the seed and live scores. `?stage=3` jumps to a stage.
- **Facilitator params:** `?mode=booth|full`, `?relaxed=1`. Route `/host` for the booth screen.
- **Multiplayer testing:** a `?fakePeers=3` debug flag simulates teammates locally. Playwright runs a 3-browser-context group test.

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

## 12. Build milestones (each ends playable)

| M | Deliverable | Acceptance |
|---|---|---|
| M0 | Scaffold, CI, PWA shell, theme, pipeline strip, state + persistence, debug params | Deploys; resume works; lint/test green |
| M0.5 | Backend: Supabase schema, RLS, leaderboard read/write, `/host` skeleton | Insert + daily query work; RLS blocks tampering |
| M1 | Shared components: Briefing, Tutorial overlay, Timer, StarResult, RealityCheck, Hand-off, Rulebook sheet | Storybook-like demo route `/dev/components` |
| M2 | Stage 1 complete (all levels + Reality Check) | Quick path ≤ 3.5 min in playtest |
| M3 | Stage 2 complete with placeholder SVG assets | Occlusion reveal and IoU tested |
| M4 | Stage 3 complete with puzzle solver tests | All puzzles proven solvable |
| M5 | Stage 4 complete: manual, K8s explainer, configure, replay | Sim unit tests; manual < auto uptime for a sensible config |
| M6 | Finale + debrief + chapter select (solo) | Formula tests; screenshot card fits 360×740 |
| M6.5 | Groups: create/join via QR + code, lobby + rotation order, main/support views for every stage (§3.5.2 table), co-op finale, group submission, leaderboard tabs, moderation | 3-context Playwright test completes a group run that appears on Today's board |
| M7 | Polish: haptics, sound toggle, relaxed mode, a11y pass, perf budget | axe clean, Lighthouse mobile ≥ 90 |
| M8 | Playtest with 5+ teens, tune timings and difficulty | Median booth run 14–17 min; full 24–32 min |

---

## 13. Playtest checklist
- Did they smile or say "one more go" at least once per stage?
- Where did they hesitate for more than 5 seconds without acting? (Fix the UI or copy there.)
- Can they explain in their own words what one of the four roles does?
- Did anyone get stuck without a way forward? (Must be zero.)
- Group mode: did support players talk at least every ~20s? Did anyone sit idle for a whole stage? (Must be zero.)
- Record findings in `docs/PLAYTEST_NOTES.md`.
