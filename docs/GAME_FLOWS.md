# Let's Ship It: game flows and test walkthrough

A picture guide to what players see in **Solo** and **Team** play (2, 3 and 4 phones), replays with bonus levels, what happens when things go wrong, and what each automated test checks.

Screenshots were taken on 17 Oct 2026 from a production build with real Supabase Realtime, at phone size (360 × 740). Regenerate them with `node e2e-live/capture-flows.mjs` (see `e2e-live/README.md`).

---

## 1. The whole game at a glance

```
Home ── Play solo ─────────────┐
     └─ Play as a team ─ Create / Join ─ Lobby ─ Start ─┤
                                                         ▼
Prologue → Stage 1 Data → Stage 2 AI → Stage 3 Software → Stage 4 Cloud → Finale → Debrief
                                                                                     │
                                         🔓 "There's more!" Replay with bonus levels ◄┘
```

- **One run length:** about 16 minutes of play, which fits a 20-minute booth rotation.
- **Every stage has the same rhythm:** briefing → tutorial → 2–3 timed levels → Reality Check → stars → hand-off.
- **No dead ends:** a hint after 2 mistakes, the answer after 3.
- **Each stage feeds the next:** clean data → a better AI → smarter trucks → a reliable app → more families reached.

| | Solo | Team (2–4 phones) |
|---|---|---|
| Who plays | You play everything | One player per stage, turns rotate |
| Everyone else | — | **Waiting screen**: who's playing, level, team stars, your next turn |
| Leaderboard | Not ranked | One row per team, daily board |
| After the debrief | Replay any stage with bonus levels | Everyone replays any stage solo on their own phone |

---

## 2. Solo game

### Start: an action within seconds
Home → **Play solo** → the mission → the Stage 1 briefing → the first card. There's no length or stage menu to get through.
![Solo start](flows/solo-start.png)

### Stage 1: Clean the Data (the hook)
The tutorial opens on a clean card, so the first swipe is a win. Level 1 teaches **one** new rule (numbers must make sense). Every good card adds to the **💧 people reached** counter. Level 2 adds just one thing: the **Fix** button. The rules in play always show as chips above the card.
![Stage 1](flows/solo-stage1.png)
![Stage 1 end](flows/solo-stage1-end.png)

### Stages 2–4
![Stage 2](flows/solo-stage2.png)
![Stage 3](flows/solo-stage3.png)
![Stage 4](flows/solo-stage4.png)

### Finale and debrief
The pipeline shows your numbers, then you route 8 live incidents to the right team. The debrief card fits one screen for a screenshot. Underneath, a **🔓 There's more!** callout invites a replay.
![Finale](flows/solo-finale.png)

### Replays unlock the bonus levels
After a finished run, Home and the debrief offer **Replay with bonus levels**. The picker tells players exactly what's new in each stage. Replays are never ranked.

| Stage | Bonus levels on a replay |
|---|---|
| 📊 Clean the Data | Bonus: Spot the Outlier |
| 🧠 Teach the Machine to See | Bonus: Draw the Box |
| 🧩 Build the Logic | Bonus: Debug It, Bonus: Ask the AI (uses your Stage 2 model) |
| ☁️ Keep It Alive | none |

![Replay](flows/solo-replay.png)

### Leaderboard and booth screen
![Leaderboard and host](flows/leaderboard-host.png)

---

## 3. Team game

### How turns work
- **Player 1 is the Leader.** They start the mission and play the finale. Stages 1–4 rotate from player 2.
- **The player** plays on their own phone exactly as in solo: Rulebook, Field guide, every button.
- **Everyone else** sees the **Waiting screen** and helps out loud, crowded round the player's phone.
- **Hand-off:** the next player's phone shows **You're up next!** with an **I'm ready** button.

| Team size | Prologue | Stage 1 | Stage 2 | Stage 3 | Stage 4 | Finale |
|---|---|---|---|---|---|---|
| 2 | P1 | P2 | P1 | P2 | P1 | P1 |
| 3 | P1 | P2 | P3 | P1 | P2 | P1 |
| 4 | P1 | P2 | P3 | P4 | P1 | P1 |

### Team of 3: the full walkthrough (Ann, Ben, Cai)
**Create and join.** The leader's lobby shows a QR code, a 4-letter code and the turn order (the host can reorder it).
![Team of 3: lobby](flows/team3-lobby.png)

**Prologue.** Ann (the leader) starts the mission; Ben and Cai wait.
![Team of 3: prologue](flows/team3-prologue.png)

**Stage 1.** Ben plays. Ann and Cai see "Ben is playing", the level, the team's stars and their own next turn.
![Team of 3: stage 1](flows/team3-stage1.png)

**Hand-off.** Ben's phone names the next player; Cai's phone says **You're up next!**
![Team of 3: hand-off](flows/team3-handoff.png)

![Team of 3: stage 2](flows/team3-stage2.png)
![Team of 3: stage 3](flows/team3-stage3.png)
![Team of 3: stage 4](flows/team3-stage4.png)

**Finale.** The leader routes the incidents while the team calls out answers.
![Team of 3: finale](flows/team3-finale.png)

**Debrief.** Every phone shows the team's rank on today's board.
![Team of 3: debrief](flows/team3-debrief.png)

**Free play.** Once the team is ranked, anyone can replay a stage solo on their own phone, with the bonus levels.
![Team of 3: free play](flows/team3-freeplay.png)

### Team of 2 (Ann, Ben)
![Team of 2: lobby](flows/team2-lobby.png)
![Team of 2: prologue](flows/team2-prologue.png)
![Team of 2: stage 1](flows/team2-stage1.png)
![Team of 2: stage 2](flows/team2-stage2.png)
![Team of 2: stage 3](flows/team2-stage3.png)
![Team of 2: stage 4](flows/team2-stage4.png)
![Team of 2: finale](flows/team2-finale.png)
![Team of 2: debrief](flows/team2-debrief.png)

### Team of 4 (Ann, Ben, Cai, Dev)
![Team of 4: lobby](flows/team4-lobby.png)
![Team of 4: prologue](flows/team4-prologue.png)
![Team of 4: stage 1](flows/team4-stage1.png)
![Team of 4: stage 2](flows/team4-stage2.png)
![Team of 4: stage 3](flows/team4-stage3.png)
![Team of 4: stage 4](flows/team4-stage4.png)
![Team of 4: finale](flows/team4-finale.png)
![Team of 4: debrief](flows/team4-debrief.png)

> The team walkthroughs skip through stages 2–4 with the debug panel, so their stars and families are lower than a real run.

---

## 4. What happens when things go wrong

| Situation | What the game does | Tested by |
|---|---|---|
| Player keeps getting it wrong | Hint after 2 mistakes, answer after 3. They can always move on. | `stage1–4.spec`, unit tests |
| Timer runs out | The level ends, scores what was done, and moves on. A "+30 seconds" button appears from 20 s left. | `stage1.spec`, component tests |
| Phone reloads mid-level (solo) | Home shows **Resume run**. The level restarts from its intro; earlier levels are kept. | `shell.spec`, `stage1.spec` |
| Reload after a stage's last level | Resumes at the same step (Reality Check, stars…). Stars can't be re-rolled. | `stage1.spec`, `stage4.spec` |
| Team phone reloads | Home shows **Back to {team}**. One tap rejoins at the current stage. | `group.spec`, live checks |
| Late joiner after Start | Refused: "That team has already started." | `group.spec`, live checks |
| Host taps Start while someone is still connecting | "{name} still connecting. Tap Start again to go without them." | live race check |
| The player's phone drops mid-stage | Teammates see a pause. After 20 s the next player takes over from the start of that level. | `group.spec`, screenshot below |
| Weak or no connection | Play continues; a "Reconnecting…" pill shows; the score submission retries. | `offline.spec`, unit tests |
| Rude team name | Profanity filter (English, Singlish, Hokkien, Malay). The facilitator can hide it from `/host`. | unit + `host.spec` |
| Someone tries to cheat the board | The server rejects >1,200 families, too-short runs, direct edits and floods. Replays are never sent. | SQL tests (PGlite) |

![Team of 2: phone drops](flows/team2-drop.png)

---

## 5. What the tests do

| Suite | Command | What it covers |
|---|---|---|
| **Unit** (503 tests) | `npm run test` | Scoring formulas, the Stage 3 puzzle solver, the Stage 4 cluster sim, deck building, hints, timers, bonus levels on replays, the team engine and rotation, content checks, and the SQL security rules (in-memory Postgres) |
| **End-to-end** (110 runs, iPhone 12 + Pixel 5) | `npm run e2e` | Each stage played well and badly, bonus levels on replays, resume, finale and the "There's more!" replay, leaderboard, `/host`, offline, privacy, team play with 3 phones (local relay), and an axe accessibility scan in light and dark |
| **Live teams** (18 checks × 3 sizes) | `npm run live:groups` | 2, 3 and 4 phones with real Supabase Realtime: lobby, rotation, waiting screens, rejoin, late join refused, finale, debrief, one submission, free play, no third parties |
| **Live Start race** | `npm run live:race` | The host taps Start the instant teammates join, 5 times. Nobody may be dropped. |
| **Screenshots** | `node e2e-live/capture-flows.mjs` | Regenerates every image in this file |

### The 18 live checks, in order
1. The host creates a team (generated name)
2. Teammates join (by QR link and by typed code)
3. Every phone sees all players
4. Only the host can start
5. Prologue: the leader plays, everyone else sees the waiting screen
6. Stage 1: one player; every other phone says who is playing
7. Stage 2: same
8. Stage 3: same
9. Stage 4: same
10. Rotation: the player changes between stages
11. A waiting phone reloads mid-game and rejoins the current stage
12. A late joiner is refused after Start
13. The finale goes to the leader (player 1); everyone else waits
14. Live Ops: the leader routes every incident
15. Every phone reaches the debrief with the shared team rank
16. The score is submitted exactly once, with no nicknames
17. Free play: a teammate replays a stage solo, with bonus levels
18. No third-party requests

Last run on 17 Oct 2026, local build + real Supabase Realtime: **18/18 for 2, 3 and 4 phones**; race check 5/5 rounds kept every player.
