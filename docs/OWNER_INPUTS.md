# Owner inputs needed

Items waiting for the project owner. The game currently runs on the default shown for each one, so none of them block building.

**How to answer:** tell Claude the item numbers, e.g. `1 ok, 6 ok, 7 change: 3★ at 85%`. Anything you don't mention keeps its default. Claude ticks the box, applies the change and logs it in `docs/DECISIONS.md`.

Last updated: 2026-10-07 (after M5, during M6).

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
- [ ] **28. Stage 3 length:** at a first-timer's pace QA measured about 4 min for booth (budget 3) and 5.8 min for full (budget 5–6). An expert takes about 1 min. *Default: tune in M8 (e.g. shorter intros, or fold the tutorial into Level 1).*

## H. Stage 4 and the finale
Try them with stage select (Play solo → pick a length → pick a stage).

- [ ] **29. Stage 4 length:** a first-timer takes about 4.4 min against a 3 min budget, mostly because the spec's two storms are 75 s each. Phase C now has a ×3 fast-forward button. *Default: keep 75 s storms and tune in M8 (e.g. 50 s storms).*
- [ ] **30. Stage 4 scoring:** 3★ means at least 99% uptime and under budget. A hardware fault at 50 s makes self-healing matter. "Around 60–70%" is the sweet spot, and the hint says so. *Default: keep.*
- [ ] **31. Finale text (D14):** the C4X match one-liners, the three "Why digital matters to DIS" cards and the rank titles ("Ops commander" sounds slightly military; swap it if you prefer) in `src/content/finaleCopy.json`. *Default: shown as drafted.*
- [ ] **32. Live Ops balance:** 8 incidents, 8 s each, +15 families for a right answer and −12 for a wrong one or time-out. Live Ops can move you about one rank. *Default: keep.*
- [ ] **33. Stage select flag:** on for development (`src/content/flags.json`). *Default: switch off before the event, unless you want it.*

## J. Group play (M6.5)
Try it: open the site on 2–3 phones, Create group on one, scan its QR with the others.

- [ ] **34. Profanity list:** `src/content/blocklist.json` has English plus common Singlish, Hokkien and Malay swear words and slurs. Please check it covers what students at your event would try, and that nothing innocent is blocked. Names like "Kan" and "Lan" are allowed on purpose (common names). *Default: as drafted.*
- [ ] **35. Generated group names:** 30 adjectives × 30 Singapore animals and places in `src/content/groupNames.json` (e.g. "Swift Kingfisher", "Bold Merlion", "Lucky Changi"). Remove any you don't like. *Default: keep.*
- [ ] **36. Who plays the finale:** the main-phone turn keeps rotating into the finale. With 4 players, player 1 plays it; with 3, player 2 gets a second turn; with 2, they alternate. Alternative: the leader always plays the finale. *Default: keep rotating.*
- [ ] **37. Live group names on `/host`:** groups playing now (name, size, stage) appear on the booth screen. A custom name shows there before a facilitator could hide it from the board. Show only generated names there, or hide the list? *Default: show all names.*
- [ ] **38. Joining replaces a solo run:** a phone that creates or joins a group drops any unfinished solo run on it. *Default: keep (booth phones play one run at a time).*
- [ ] **39. Quiet support cards:** in some booth levels a support card has little to do (e.g. Reveal has only 2 charges; Manifest matters mostly in full mode). Play a 3–4 phone group and note any phone that sat idle for a whole level. *Default: re-balance after playtests (M8).*
- [ ] **40. Two-phone check on the live site:** group play uses Supabase Realtime, which Claude couldn't test from the cloud sandbox (no WebSockets there; the e2e tests use a local relay). Please create a group on one phone and join from another on the live site. If they never see each other: Supabase → Project Settings → Realtime → make sure public channels are allowed (not "private channels only"). *Default: n/a, needs your check.*

## K. Polish (M7)
- [ ] **41. Fonts:** the game uses each phone's built-in font (fast, nothing downloaded). Want a brand font? Send the font files (licensed for web use) and Claude will self-host them. *Default: built-in fonts.*
- [ ] **42. Sound:** off by default; Settings → Sound plays a soft two-note chime for right and a low two-note tone for wrong. Keep, change, or remove? *Default: keep.*

## I. Setup notes (no answer needed)
- Supabase keys: Claude keeps them in `.env.local` (git-ignored) and never commits them. The live site reads them from Vercel → Project → Settings → Environment Variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
- **Deploys:** Vercel deploys `main`. Claude works on the branch `claude/beautiful-allen-ne188s`. Merge it into `main` (PR or fast-forward) to put M3 live.
