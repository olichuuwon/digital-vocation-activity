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
2. Tap **Play solo** and pick a length:
   - **Booth run**, about 16 minutes (main levels only)
   - **Full run**, about 25–30 minutes (adds bonus levels)
3. Each stage follows the same pattern: a short briefing, a quick tutorial, two or three timed levels, then a **Reality Check** that shows how professionals do the same job, and finally your stars (0–3).

**Stuck?** You can't get stuck for long. After 2 wrong answers the game gives you a hint, and after 3 it shows you the answer.

**Leaving mid-run?** Your progress is saved on your phone. Open the game again and tap **Resume run**.

### The stages

**📊 Stage 1: Clean the Data.** Swipe each relief request: right to keep, left to trash, up to fix. Swiping is optional, because every swipe also has a button. Open the 📘 Rulebook any time to see the rules.

**🧠 Stage 2: Teach the Machine to See.** Label pictures of relief supplies to train your AI. Then guess pictures hidden under tiles (guess early for more points), draw boxes around items (full run only), and audit your AI's answers. Being *sure* isn't the same as being *right*! The 📖 Field guide shows what each item looks like.

**🧩 Stage 3: Build the Logic** *(coming soon).* Snap together steps to drive a supply truck around flooded roads.

**☁️ Stage 4: Keep It Alive** *(coming soon).* Keep the servers running by hand, then meet Kubernetes and let automation do it.

**🚚 Finale: Mission Live** *(coming soon).* Everything you built comes together. Route live incidents to the right team.

### Playing as a group *(coming soon)*

Groups of 2–4 will each use their own phone. One person plays on the **main phone** while the others hold **support cards** with rules, tools or secret info the main player needs, so you'll have to talk to each other. The main player changes every stage. Group runs go on the daily **leaderboard**, which resets at midnight Singapore time.

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

- **Booth screen:** open `/host` on a laptop or TV (for example https://digital-vocation-activity.vercel.app/host). It shows a join QR code and the live leaderboard. Hiding a group name needs the facilitator PIN.
- **Set the run length for everyone:** add `?mode=booth` or `?mode=full` to the link.
- **Relaxed timers for a session:** add `?relaxed=1`. This lasts for one page load only, so a shared phone doesn't stay relaxed for the next player.
- **Timing:** a booth run is designed for a 20-minute rotation, with about 2 minutes to join and 2 minutes to debrief.

## Privacy

Many players are under 18, so the game collects as little as possible:

- There are no accounts, cookies, ads or trackers.
- Your progress and settings stay **on your phone** (browser storage).
- Nicknames are **never** sent to a server.
- The only thing stored online is a group's leaderboard entry: group name, group size, families reached, finishing time and date. Solo runs are never uploaded.

## Credits

Stage 2 pictures are simple drawings made for this game. Real AI teams train on large collections of labelled photos.

---

<details>
<summary><strong>For developers</strong></summary>

Vite + React + TypeScript, Zustand, Framer Motion, Supabase (leaderboard), Vitest and Playwright. The design spec is `docs/GAME_SPEC.md`, decisions are logged in `docs/DECISIONS.md`, and items waiting on the project owner are in `docs/OWNER_INPUTS.md`.

```bash
npm ci
cp .env.example .env.local   # add the Supabase URL and publishable key (optional; the game runs without them)
npm run dev                  # http://localhost:5173 · add ?debug=1 to skip stages
npm run lint && npm run typecheck && npm run test && npm run e2e
npm run build
```

All game text and level data live in `src/content/` (JSON, checked by zod), so you can edit them without touching components.
</details>
