# Owner inputs needed

Items waiting for the project owner. The game currently runs on the default shown for each one, so none of them block building.

**How to answer:** tell Claude the item numbers, e.g. `1 ok, 6 ok, 7 change: 3★ at 85%`. Anything you don't mention keeps its default. Claude ticks the box, applies the change and logs it in `docs/DECISIONS.md`.

Last updated: 2026-10-07 (during M4).

## A. Text that needs your approval (D14)
Preview these at `/dev/components`, under "Reality Check". The text lives in `src/content/realityChecks.json`.

- [ ] **1. Data:** "You cleaned {n} records by hand. Data scientists write each rule once as code. A pipeline, an automatic chain of steps, then applies it to millions of records in seconds."
- [ ] **2. AI:** title "Your {n} labels did this" (new in M3: shows the player's own count); "Every picture you labelled helped train your model…" and "Your model says this road is clear, 91% sure. It's flooded. Your model never saw night photos. Real AI teams hunt for gaps like this and keep humans checking the results."
- [ ] **3. Software:** "Your blocks just turned into Python…" and "Software engineers also write automatic tests: small checks that run your program on thousands of maps before real people use it. Each tick is a passed test."
- [ ] **4. Cloud:** "Site reliability engineers (SREs) keep apps like this running for millions of people. They set up alerts so a human only gets woken up when automation can't fix it."

## B. Stage 1 gameplay (play it first)
Try it: https://digital-vocation-activity.vercel.app/?debug=1&stage=1

- [ ] **5. Level sizes:** the tutorial has 3 cards. Level 1 is 10 cards in 40s. Level 2 is 10 cards in 60s. *Default: keep as is.*
- [ ] **6. Rules per level:** the spec says one new rule per level, but levels 1 and 2 each show two (2+3, then 4+5). *Default: two.*
- [ ] **7. Stars:** 1★ at 30%, 2★ at 65%, 3★ at 88%. A careful player gets about 3★ and a first-timer about 2★. *Default: keep.*
- [ ] **8. Automate question:** "Which rule would you turn into code first?" The correct answer is "trash repeated household IDs". The wrong answers are "trash households over 12 people" and "trash every typo". *Default: keep.*
- [ ] **9. Full mode is short:** Stage 1 takes about 2.6 min against the 5–6 min budget. *Default: add content after the M8 playtests.*
- [ ] **10. Extra Rulebook examples:** these aren't in the spec: "People: 0", "Water: 900 L", "ID 1042 (second time)". *Default: keep.*

## C. Branding and look
- [ ] **11. Colours (D2):** teal, violet, amber and blue from spec §9. Do you have DIS brand colours to use instead? *Default: spec colours.*
- [ ] **12. Logos (Q1):** none; text "DIS" and "C4X Digital" only. *Default: no logos.*
- [ ] **13. Fonts:** the phone's system fonts. *Default: system fonts.*

## D. Spec defaults to confirm
- [ ] **14. Ranking (Q5):** most families first; on a tie, the faster group wins. *Default: keep.*
- [ ] **15. Group names (Q6):** pick a generated name ("Swift Kingfisher") or type your own (filtered, and the facilitator can hide it). *Default: keep.*
- [ ] **16. Big screen (Q7):** I've assumed the booth has a TV for `/host`. *Default: yes; the game works without it.*
- [ ] **17. Prizes (Q9):** none in the game. *Default: none.*
- [ ] **18. Local place names (`[FILL]`):** records use sector letters A–F. Do you want real Singapore areas instead? *Default: letters.*

## E. Backend safety
- [ ] **19. Rate limit:** at most 30 group scores per minute across all players. Is that OK for your event size? *Default: 30.*

## F. Stage 2 gameplay (play it first)
Try it: https://digital-vocation-activity.vercel.app/?debug=1&stage=2 (add `&mode=full` for Draw the Box)

- [ ] **20. Draw the Box pictures:** the spec asks for real open-dataset photos. M3 uses the game's own drawings (no licence risk, boxes exact). Want real photos? If so, send ~5–8 you like (no faces or number plates, reusable with attribution) and Claude adds them with credits. *Default: drawings.*
- [ ] **21. Level sizes:** tutorial 2 pictures (the spec says 1). Level 1 is 12 pictures in 30s. Covered Up is 8 pictures in 60s, a tile every 0.6s, 2 tiles shown at the start, and 2 Reveal taps. Audit is 8 in 40s with 3 wrong. Draw the Box is 5 in 45s. *Default: keep.*
- [ ] **22. Stars and scoring:** 55% labels, 15% early-guess bonus, 30% audit, plus 5% box in full mode. Stars at 30% / 62% / 87%. Accurate but always waiting for every tile gives 2★, and 3★ needs some quick guesses and a clean audit. *Default: keep.*
- [ ] **23. Stage 2 is short:** booth about 2.1 min against 3; full about 2.9 min against 5–6. Covered Up plays in 10–25s against "~60s". *Default: tune after the M8 playtests (e.g. slower tiles, more pictures in full mode).*
- [ ] **24. The 64 pictures:** review them all at `/dev/components` → "Stage 2 pictures". *Default: keep.*

## G. Stage 3 gameplay (play it first)
Try it: https://digital-vocation-activity.vercel.app/?debug=1&stage=3 (add `&mode=full` for Debug It and Ask the AI)

- [ ] **25. Choose the Road block limit:** the spec says 7. The solver proved no 7-block answer a 12-year-old would write exists, so the limit is 9 (the best answer uses 8). *Default: 9.*
- [ ] **26. Stars and scoring:** all puzzles solved with no help gives 3★ at any block count within the limit, and each hint costs about a star. Stars at 20% / 60% / 90%. *Default: keep.*
- [ ] **27. "AI misread" link (§3.2):** the spec puts it in "Level 3". It's built into the full-mode bonus Ask the AI, where a weaker Stage 2 model makes wrong drops. Booth players don't play that level. Should booth players see it too, for example as a note in the Stage 3 Reality Check? *Default: full mode only.*
- [ ] **28. Stage 3 length:** the designer estimates about 3.5 min for booth (budget 3) and about 4.9 min for full (budget 5–6). Stages 1–3 together still fit the 16-min booth run. *Default: tune in M8.*

## H. Setup notes (no answer needed)
- Supabase keys: Claude keeps them in `.env.local` (git-ignored) and never commits them. The live site reads them from Vercel → Project → Settings → Environment Variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
- **Deploys:** Vercel deploys `main`. Claude works on the branch `claude/beautiful-allen-ne188s`. Merge it into `main` (PR or fast-forward) to put M3 live.
