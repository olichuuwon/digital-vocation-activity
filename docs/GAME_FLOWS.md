# Let's Ship It: game flows and test walkthrough

A picture guide to what players see in solo, 2, 3 and 4-player games, what happens in unusual situations, and what each automated test checks.

- **Screenshots:** taken on 8 Oct 2026 from the live site (https://digital-vocation-activity.vercel.app) with real Supabase.
- **Phones:** simulated at 360 × 740 (a small Android).
- **Regenerate them:** `node e2e-live/capture-flows.mjs`. To capture only some, add `solo`, `2`, `3` or `4`.
- **Skipped stages:** in the group screenshots, stages were skipped with the debug panel, so stars show as 0. Stage-by-stage play is covered by the solo section and the automated tests.

---

## 1. The whole game at a glance

```mermaid
flowchart LR
  H[Home] -->|Play solo| L[Pick length] --> P[Prologue]
  H -->|Create / Join group| LB[Lobby] -->|Host taps Start| P
  P --> S1[Stage 1 Data] --> S2[Stage 2 AI] --> S3[Stage 3 Software] --> S4[Stage 4 Cloud] --> F[Finale: Mission live] --> D[Debrief]
  D -->|group only| R[Leaderboard rank]
```

**Every stage follows the same pattern:**

Briefing → level intro (shows any new rule) → levels (timed) → Reality Check → stars → hand-off to the next stage.

**Run lengths:**
- **Booth run:** about 16 min, core levels only.
- **Full run:** about 25–30 min, with bonus levels.

---

## 2. Who does what

| Word | Meaning |
|---|---|
| **Main phone** 🎮 | The phone actually playing the stage. Held where everyone can see it. |
| **Support phone** | Everyone else. Each gets a card with information or controls the main player needs. |
| **Host** | The phone that created the group. Only the host can reorder players and tap Start. |
| **Leader / IC** | Player 1 in the lobby order. Plays the prologue and the finale. |

### Who holds the main phone each stage
These were observed in the live runs (player 1 = Ann, then Ben, Cai, Dee).

| Players | Prologue | Stage 1 | Stage 2 | Stage 3 | Stage 4 | Finale |
|---|---|---|---|---|---|---|
| **1 (solo)** | you | you | you | you | you | you |
| **2** | Ann | Ben | Ann | Ben | Ann | Ann |
| **3** | Ann | Ben | Cai | Ann | Ben | Ann |
| **4** | Ann | Ben | Cai | Dee | Ann | Ann |

With 4 players, everyone leads exactly one stage. With 2–3, the turns wrap around.

### Support cards each stage
Every support phone always has something to do (CLAUDE.md rule 7).

| Stage | Cards to deal | 2 players (1 support) | 3 players (2 supports) | 4 players (3 supports) |
|---|---|---|---|---|
| 1 Data | 📘 Rulebook, 🔍 Duplicate scanner, 🛠️ Fix kit | all 3, as tabs | 1 + 2 | 1 each |
| 2 AI | 👁️ Reveal power, 📖 Field guide, 🧪 Auditor | all 3 | 2 + 1 | 1 each |
| 3 Software | 🗺️ Scout map, 📦 Manifest, 🐞 Debugger | all 3 | 2 + 1 | 1 each |
| 4 Cloud | One Boost/Restart button per server (3 servers) | all 3 servers | 1 + 2 servers | 1 server each |
| Finale | Incident routing for the 4 teams | all 4 teams | 2 + 2 | 2 + 1 + 1 |

**Solo players** see the same information as in-app panels (Rulebook button, Field guide button, and so on).

---

## 3. Solo game (1 player)

### Start
![Solo start](flows/solo-start.png)

Home → length → stage select → prologue.
- **Stage select** appears only while the testing flag is on. Switch it off before the event (OWNER_INPUTS item 33).

### Stage 1: Clean the Data
![Stage 1](flows/solo-stage1.png)
![Stage 1 end](flows/solo-stage1-end.png)

**Levels:**
- tutorial with a hand hint
- Keep or Trash (40s)
- Keep, Fix or Trash (60s), where the fix picker shows 2–3 options

**Help and the end of the stage:**
- **Hints:** after 2 mistakes a hint appears; after 3, the answer.
- **Then:** Reality Check (20 records → 2,000,000), a one-tap "which rule to automate", stars, and the hand-off.

### Stage 2: Teach the Machine to See
![Stage 2](flows/solo-stage2.png)

Label pictures (with a field guide), Covered Up (tiles lift over time), and Audit the AI. Full mode adds Draw the Box.

### Stage 3: Build the Logic
![Stage 3](flows/solo-stage3.png)

Tap blocks to build the truck's program, then tap Run. Later levels add loops, "if flooded" and debugging.

### Stage 4: Keep It Alive
![Stage 4](flows/solo-stage4.png)

**Phases:**
1. **Manual Mode:** Boost and Restart servers by hand during a 45s storm.
2. **Meet Kubernetes:** explainer cards.
3. **Configure the cluster.**
4. **Replay:** the same storm, now handled automatically.

### Finale and debrief
![Finale](flows/solo-finale.png)

**Finale:**
- **Pipeline reveal:** data → model → logic → uptime gives the families reached.
- **Live Ops:** route each incident to the right team within 8s.

**Debrief:**
- score card and rank
- your C4X Digital match
- what you learned
- why digital matters to DIS

**Solo note:** solo runs aren't ranked.

### Leaderboard and booth screen
![Leaderboard and host](flows/leaderboard-host.png)

- **Leaderboard:** Today (top 20, resets at midnight SGT) and View all.
- **`/host`:** a big QR code, a live board that refreshes every 10s, and the facilitator panel for hiding names.

---

## 4. Group games

### Lobby (same for 2, 3 and 4 players)
![Lobby](flows/group4-lobby.png)

1. **Host:** picks a generated name (or types one, letters only), enters a nickname and picks a length.
2. **Lobby:** shows a QR code and a 4-letter code, plus the players and who leads which stage. The host can reorder players.
3. **Teammates join:** by scanning the QR or typing the code, then entering a nickname. Nicknames stay on the phones and are never stored on the server.
4. **Start:** only the host can tap it, and it needs at least 2 players. If someone is still connecting, the first tap warns and a second tap starts without them.

### 2 players (1 main + 1 support)
Prologue: Ann leads, Ben supports.
![2p prologue](flows/group2-prologue.png)

Stage 1: Ben plays, and Ann holds all 3 support cards as tabs.
![2p stage 1](flows/group2-stage1.png)

Stage 2:
![2p stage 2](flows/group2-stage2.png)

Stage 3:
![2p stage 3](flows/group2-stage3.png)

Stage 4: the support phone holds all 3 server buttons.
![2p stage 4](flows/group2-stage4.png)

Finale: one support phone routes all 4 teams.
![2p finale](flows/group2-finale.png)

All-hands call: every phone must tap within 5s.
![2p all hands](flows/group2-allhands.png)

Debrief: shared rank ("You're #2 today!"). The rank shown is from the faked submission in this capture.
![2p debrief](flows/group2-debrief.png)

### 3 players (1 main + 2 supports)
Prologue:
![3p prologue](flows/group3-prologue.png)

Stage 1:
![3p stage 1](flows/group3-stage1.png)

Stage 2:
![3p stage 2](flows/group3-stage2.png)

Stage 3:
![3p stage 3](flows/group3-stage3.png)

Stage 4:
![3p stage 4](flows/group3-stage4.png)

Finale:
![3p finale](flows/group3-finale.png)

All-hands call:
![3p all hands](flows/group3-allhands.png)

Debrief:
![3p debrief](flows/group3-debrief.png)

### 4 players (1 main + 3 supports)
Prologue:
![4p prologue](flows/group4-prologue.png)

Stage 1: Ben plays, and Ann, Cai and Dee hold the Fix kit, Rulebook and Duplicate scanner.
![4p stage 1](flows/group4-stage1.png)

Stage 2: Cai plays, and the others hold the Field guide, Auditor and Reveal power.
![4p stage 2](flows/group4-stage2.png)

Stage 3:
![4p stage 3](flows/group4-stage3.png)

Stage 4: each support phone controls one server.
![4p stage 4](flows/group4-stage4.png)

Finale: Ann (the IC) sees the incident, and the phone holding that team's button routes it.
![4p finale](flows/group4-finale.png)

All-hands call:
![4p all hands](flows/group4-allhands.png)

Debrief: every phone sees the same score and group rank.
![4p debrief](flows/group4-debrief.png)

---

## 5. What happens when things go wrong

| Situation | What the game does | Tested by |
|---|---|---|
| Player keeps getting it wrong | Hint after 2 mistakes, answer after 3. They can always move on. | `stage1–4.spec`, unit tests |
| Timer runs out | The level ends, scores what was done, and moves on. A "+30 seconds" button appears from 20s left. | `stage1.spec`, component tests |
| Phone reloads mid-level (solo) | Home shows **Resume run**. The level restarts from its intro, and earlier levels are kept. | `shell.spec`, `stage1.spec` |
| Reload after a stage's last level | Resumes at the same step (Reality Check, stars…). Stars can't be re-rolled. | `stage1.spec`, `stage4.spec` |
| Group phone reloads | Home shows **Back to {group}**. One tap rejoins at the current stage. | `group.spec`, live checks |
| Late joiner after Start | Refused: "already started". | `group.spec`, live checks |
| Host taps Start while someone is still connecting | Warning: "{name} still connecting. Tap Start again to go without them." | live race check (fixed 8 Oct) |
| Main phone drops mid-stage | Teammates see a pause. After 20s, the next player takes over. | `group.spec` |
| Weak or no connection | Gameplay continues; a "Reconnecting…" pill shows; the score submission retries. Later stages open offline after the first visit. | `offline.spec`, unit tests |
| Rude group name | Profanity filter (English, Singlish, Hokkien, Malay). The facilitator can hide it from `/host`. | unit + `host.spec` |
| Someone tries to cheat the board | The server rejects >1,200 families, too-short runs, direct edits and floods. | SQL tests (PGlite), live check |

---

## 6. What the tests do

| Suite | Command | What it covers |
|---|---|---|
| **Unit** (506 tests) | `npm run test` | Scoring formulas, the Stage 3 puzzle solver, the Stage 4 cluster sim, deck building, hints, timers, the group engine, content checks, and the SQL security rules (run in an in-memory Postgres) |
| **End-to-end** (110 runs, iPhone 12 + Pixel 5) | `npm run e2e` | Each stage played perfectly and badly, resume, finale, leaderboard, `/host`, offline, privacy, 3-phone group play (local relay), and an axe accessibility scan in light and dark |
| **Live groups** (18 checks × 3 sizes) | `npm run live:groups` | 2, 3 and 4 phones on the **real** site and Supabase: lobby, rotation, a support card every stage, rejoin, late join refused, co-op finale with all-hands, debrief, one submission, no third parties |
| **Live Start race** | `npm run live:race` | The host taps Start the instant teammates join, 5 times. Nobody may be dropped. |
| **Screenshots** | `node e2e-live/capture-flows.mjs` | Regenerates every image in this file |

**Notes:**
- **CI:** GitHub Actions runs the unit and e2e suites on every push.
- **Live suites:** these hit the deployed site and fake only the score submission, so the real leaderboard stays clean.

### The 18 live checks, in order
1. The host creates a group (generated name)
2. Teammates join (by QR link and by typed code)
3. Every phone sees all players
4. Only the host can start
5. Prologue: one main phone, the rest support
6. Stage 1: one main, every support phone has a card
7. Stage 2: same
8. Stage 3: same
9. Stage 4: same (server controls appear when the storm starts)
10. Rotation: the main phone changes between stages, and with 4 players everyone leads once
11. A support phone reloads mid-game and rejoins the current stage
12. A late joiner is refused after Start
13. The finale goes to the IC (player 1); everyone else supports
14. Live Ops: each team's button is dealt to exactly one support phone
15. Live Ops: all 8 incidents are routed from the right phone, plus 2 all-hands calls
16. Every phone reaches the debrief with the shared group rank
17. The score is submitted exactly once, with no nicknames
18. No third-party requests

---

## 7. Still to check by hand
- **Observed in these screenshots:** during the prologue (about 1 min), support phones show only "Your support card appears here." Consider giving them something to read, such as the mission goal or their team. See OWNER_INPUTS item 44.
- **Real devices:** a group run played to the end on a real iPhone (Safari) and an Android phone.
- **Playtests (M8):** 5+ teens. Record the results in `docs/PLAYTEST_NOTES.md`.
- **Owner decisions:** see `docs/OWNER_INPUTS.md`.
