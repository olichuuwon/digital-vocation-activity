# Decisions & assumptions log

| Date | Item | Decision / default used | Owner to confirm? |
|------|------|-------------------------|-------------------|
|      | D1–D17 | See GAME_SPEC.md §0 | Yes |
| 2026-10-06 | D11 Hosting | **Owner chose Vercel.** `vercel.json` added (Vite preset, SPA rewrite for `/host` etc., no-cache on `sw.js`, immutable `/assets`). Deploys via Vercel's Git integration once the owner creates the repo. GitHub Pages workflow removed. | Done |
| 2026-10-06 | D1 Game name `[FILL]` | Using working title "Ship It" in `src/content/copy.json`. | Yes |
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

## Copy needing owner approval
_None yet._

## Milestone status
- [x] M0 · [ ] M0.5 · [ ] M1 · [ ] M2 · [ ] M3 · [ ] M4 · [ ] M5 · [ ] M6 · [ ] M6.5 · [ ] M7 · [ ] M8

### M0 notes (2026-10-06)
- Lint, typecheck, unit tests (Vitest) and e2e (Playwright, iPhone 12 + Pixel 5) green.
- Initial JS ≈ 97 KB gzipped (budget 250 KB).
- QA fixes: bad saves no longer blank the screen; debug reload resumes mid-stage; sw returns a network error instead of `undefined`.
- a11y fixes: header survives 200% text; focus moves to each new screen heading; tab titles per screen; shared polite live region (`useAnnouncer`); current pipeline stage has ▶ + bold + underline; borders ≥3:1; decorative emoji hidden; "Coming soon" buttons stay focusable (`aria-disabled`).
- Carried to M2+: wire `MotionConfig reducedMotion="user"` and `useRelaxed()` into timers once they exist.
- "Deploys" acceptance waits on the owner creating the git repo and importing it into Vercel.
