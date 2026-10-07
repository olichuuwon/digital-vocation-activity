# Owner inputs needed

Items waiting for the project owner. The game currently runs on the default shown for each one, so none of them block building.

**How to answer:** tell Claude the item numbers, e.g. `1 ok, 6 ok, 7 change: 3★ at 85%`. Anything you don't mention keeps its default. Claude ticks the box, applies the change and logs it in `docs/DECISIONS.md`.

Last updated: 2026-10-07 (after M2).

## A. Text that needs your approval (D14)
Preview these at `/dev/components`, under "Reality Check". The text lives in `src/content/realityChecks.json`.

- [ ] **1. Data:** "You cleaned {n} records by hand. Data scientists write each rule once as code. A pipeline, an automatic chain of steps, then applies it to millions of records in seconds."
- [ ] **2. AI:** "Every picture you labelled helped train your model…" and "Your model says this road is clear, 91% sure. It's flooded. Your model never saw night photos. Real AI teams hunt for gaps like this and keep humans checking the results."
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
