# CLAUDE.md: Ship It

Mobile web game (≈16-min booth run in a 20-min rotation, or 25–30 min full; solo or groups of 2–4: one main phone + support phones, rotating each stage) for students aged 12–25 in Singapore. It shows how the four DIS C4X Digital specialisations (Software Development, Cloud Engineering, AI Engineering, Data Science) combine into one system. **The full spec is `docs/GAME_SPEC.md`. Read it before any task.**

## Golden rules
1. **Fun first.** Every screen needs an action within 5 seconds. Keep instruction cards to 25 words or fewer.
2. **Never invent `[FILL]` items.** Use the spec default and log the assumption in `docs/DECISIONS.md`.
3. **Content lives in `src/content/`** as JSON/TS validated by zod. Never hard-code level data in components.
4. **Sims and scoring are pure functions** in `src/sim/` and `src/state/scoring.ts`, with unit tests.
5. **Mobile portrait first** (360px). Tap targets are 48px or larger. Every gesture has a button alternative.
6. **No PII, no trackers.** Many players are minors. The only server-side data is the group leaderboard row (spec §3.5.4). Nicknames stay on the device.
7. **Nobody idle.** In group mode every support phone must hold info or a control the main player needs (spec §3.5.2).
8. **No dead ends.** Show a hint after 2 fails and the answer after 3.
9. **DIS / career copy is drafted, not finalised.** Mark it `<!-- NEEDS OWNER APPROVAL -->` and list it in `docs/DECISIONS.md`.
10. Each milestone in spec §12 must end **playable and deployed**.

## Stack
Vite + React + TypeScript (strict) · Zustand · Framer Motion · Supabase (free tier: Postgres + Realtime) · Vitest · Playwright · zod · `qrcode`

## Commands
- `npm run dev`: local dev (use `?debug=1` for stage skipping)
- `npm run test`: unit tests
- `npm run e2e`: Playwright mobile e2e
- `npm run lint && npm run typecheck`
- `npm run build`: production build

## Working style
- Work milestone by milestone (spec §12). At the start of each, write a short plan. At the end, run lint, typecheck, test and e2e, and update `docs/DECISIONS.md`.
- Use subagents in `.claude/agents/` for their specialties. Delegate content writing to `content-writer`, groups/backend to `realtime-engineer`, balancing to `game-designer`, verification to `qa-playtester`, and accessibility review to `a11y-reviewer`.
- Commit after each green milestone with a clear message.
