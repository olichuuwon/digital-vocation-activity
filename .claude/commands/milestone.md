---
description: Build the next (or a specified) milestone from docs/GAME_SPEC.md §12
---
Build milestone $ARGUMENTS from `docs/GAME_SPEC.md` §12 (if blank, pick the next incomplete one listed in `docs/DECISIONS.md`).

1. Re-read the relevant spec sections and write a short plan (files, components, content, tests).
2. Delegate: `game-designer` for level data and balance, `content-writer` for copy, `sim-engineer` for sims and scoring.
3. Implement. Keep content in `src/content/`.
4. Run `qa-playtester`, then `a11y-reviewer`. Fix the issues they report.
5. Update `docs/DECISIONS.md` (assumptions, `[FILL]` defaults used, milestone status) and commit.
