# Let's Ship It

**Floods hit the city. Four teams, one system. Get supplies to 1,200 families.**

Let's Ship It is a short mobile web game about how the four **C4X Digital** specialisations in the Digital and Intelligence Service (DIS) work together:

| | Specialisation | In the game you… |
|---|---|---|
| 📊 | **Data Science** | clean messy relief requests so they can be trusted |
| 🧠 | **Artificial Intelligence Engineering** | teach an AI to recognise supplies, then check its mistakes |
| 🧩 | **Software Development** | program a supply truck with simple blocks |
| ☁️ | **Cloud Engineering** | keep the relief app online when everyone uses it at once |

Each stage feeds the next. Clean data makes a better AI, a better AI makes smarter trucks, and a reliable app gets help to more families. At the end you see how many families your team reached.

No coding knowledge needed. No account, no app to install, and no personal data collected.

▶️ **Play now:** https://digital-vocation-activity.vercel.app

---

## How to play

1. Open the link (or scan the QR code at the booth) on your phone. Hold it upright.
2. Tap **Play solo** to start straight away, or **Play as a team** to play with 2–4 friends (see below). A run takes about 16 minutes.
3. Each stage follows the same pattern: a short briefing, a quick tutorial, two or three timed levels, then a **Reality Check** that shows how professionals do the same job, and finally your stars (0–3).
4. **There's more!** After the debrief, tap **Replay with bonus levels** to replay any stage. Replays add bonus levels you haven't seen (they aren't ranked).

**Stuck?** You can't get stuck for long. After 2 wrong answers the game gives you a hint, and after 3 it shows you the answer.

**Leaving mid-run?** Your progress is saved on your phone. Open the game again and tap **Resume run**.

### The stages

**📊 Stage 1: Clean the Data.** Swipe each relief request: right to keep, left to trash, up to fix. Swiping is optional, because every swipe also has a button. Every good card adds to your 💧 *people reached* counter. Open the 📘 Rulebook any time to see the rules. *Bonus on replay: Spot the Outlier.*

**🧠 Stage 2: Teach the Machine to See.** Label pictures of relief supplies to train your AI. Then guess pictures hidden under tiles (guess early for more points) and audit your AI's answers. Being *sure* isn't the same as being *right*! The 📖 Field guide shows what each item looks like. *Bonus on replay: Draw the Box.*

**🧩 Stage 3: Build the Logic.** Tap blocks (Move forward, Turn, Drop supplies, Repeat, If the road ahead is flooded…) to program a supply truck, then press Run and watch it go. Step runs one block at a time. At the end you see your blocks turned into real Python. *Bonus on replay: Debug It (fix a broken program) and Ask the AI (your Stage 2 AI works out what each house needs).*

**☁️ Stage 4: Keep It Alive.** Keep three servers alive by hand through a traffic storm: boost, restart, roll back a bad update. Then meet Kubernetes, choose its settings within a budget, and watch it handle the same storm.

**🚚 Finale: Mission Live.** See how your data, AI, logic and uptime add up to families reached, then route live incidents to the right team. The debrief shows your C4X Digital match and what you learned, with a card that's easy to screenshot. Then replay any stage with its bonus levels.

### Playing as a team

Teams of 2–4 each use their own phone. One person taps **Play as a team → Create a team** and picks a team name; the others scan the QR code on that screen (or tap **Join a team** and type the 4-letter code). Everyone adds a nickname, which stays on their own phone.

**Take turns.** Each stage, one player plays on their own phone, exactly like solo. Everyone else sees a **Waiting screen** ("Ben is playing", the level, the team's stars and when their own turn comes), so crowd round, watch and call out answers together. When a stage ends, the next player's phone says **You're up next!** and they tap **I'm ready**.

Player 1 in the lobby list is the team **Leader**: they start the mission and play the finale. Stages 1–4 rotate through everyone from player 2, so turns are as even as possible. Whoever created the team (the host) can reorder the list before starting.

If the player's phone drops, the others wait 20 seconds, then the next player takes over. Reload the page and tap **Back to** your team name to rejoin. Team runs go on the daily **leaderboard**, which resets at midnight Singapore time. After the debrief, everyone can replay any stage solo on their own phone, with the bonus levels.

---

## Settings and accessibility

Tap ⚙️ (top right) for:

- **Theme**: match your phone, light or dark
- **Relaxed timers**: 1.5× time on every level
- **Sound**: off by default
- **Quit run**

The game also supports:

- **Buttons for every gesture.** You never have to swipe or drag.
- **Screen readers**: labelled controls and spoken results
- **Reduced motion**: follows your phone's setting
- **Large text**: works at up to 200% text size
- **"+30 seconds"**: appears when a timer runs low

## For facilitators

- **Booth screen:** open `/host` on a laptop or TV (for example https://digital-vocation-activity.vercel.app/host). It shows a join QR code, the teams playing now and the live leaderboard. Hiding a team name needs the facilitator PIN.
- **Relaxed timers for a session:** add `?relaxed=1`. This lasts for one page load only, so a shared phone doesn't stay relaxed for the next player.
- **Timing:** a run is designed for a 20-minute rotation, with about 2 minutes to join and 2 minutes to debrief.

## Privacy

Many players are under 18, so the game collects as little as possible:

- There are no accounts, cookies, ads or trackers.
- Your progress and settings stay **on your phone** (browser storage).
- Nicknames are **never** sent to a server.
- The only thing stored online is a team's leaderboard entry: team name, team size, families reached, finishing time and date. Solo runs and replays are never uploaded.

## Credits

Stage 2 pictures are simple drawings made for this game. Real AI teams train on large collections of labelled photos.

---

<details>
<summary><strong>For developers</strong></summary>

Vite + React + TypeScript, Zustand, Framer Motion, Supabase (leaderboard), Vitest and Playwright. The design spec is `docs/GAME_SPEC.md`, a picture walkthrough of every flow is `docs/GAME_FLOWS.md`, decisions are logged in `docs/DECISIONS.md`, and items waiting on the project owner are in `docs/OWNER_INPUTS.md`.

```bash
npm ci
cp .env.example .env.local   # add the Supabase URL and publishable key (optional; the game runs without them)
npm run dev                  # http://localhost:5173 · add ?debug=1 to skip stages
npm run lint && npm run typecheck && npm run test && npm run e2e
npm run build
```

All game text and level data live in `src/content/` (JSON, checked by zod), so you can edit them without touching components.

Where things live:

| Folder | What's in it |
|---|---|
| `src/content/` | All text, levels, records, puzzles (JSON + zod schemas) |
| `src/stages/` | One folder per stage (`data`, `ai`, `logic`, `cloud`, `finale`): the screen plus its pure logic |
| `src/sim/` | Pure simulations: truck grid, cluster, image reveal, IoU |
| `src/state/` | The run (`GameState`), saving, scoring formulas |
| `src/net/group/` | Team play: lobby, turn rotation, sync, hand-off, drop takeover |
| `src/net/leaderboard.ts` | The only server calls (Supabase RPCs) |
| `src/app/` | App shell, Home, team screens (lobby, Waiting screen), `/host` |
| `e2e/` | Playwright tests (local relay, mocked Supabase) |
| `e2e-live/` | Checks and screenshot capture against a real build and Supabase |
</details>
