# Owner inputs needed

Items that need a decision, content or approval from the project owner. The game runs on the defaults shown until you answer. Full history is in `docs/DECISIONS.md`.

Reply by editing this file (put your answer under **Your answer**) or by telling Claude in a session.

---

## Open now

### 1. Approve career/DIS copy (D14)
Reality Check cards marked `needsApproval: true` in `src/content/realityChecks.json`. You can preview them at `/dev/components`. The text is listed under "Copy needing owner approval" in `docs/DECISIONS.md`.
**Default:** shown as drafted.
**Your answer:**

### 2. Stage 2 "Draw the Box": real photos or drawings? (§5.4, M3)
The spec asks for real open-dataset photos (e.g. Open Images, CC BY) for this bonus level. M3 ships in-repo SVG drawings because the milestone calls for placeholders and every photo needs a licence check by a person. Options:
- **a)** Keep drawings (zero licence risk, true boxes exact). The credit line says they're stand-ins.
- **b)** Pick ~5–8 photos (no faces or number plates, licence allows reuse with attribution) and send links. Claude will compress them to WebP (≤60 KB), add boxes and add `assets/CREDITS.md` plus a "Photo credits" link in settings.

**Default:** a.
**Your answer:**

### 3. Stage 2 balance and scoring (M3)
Proposed by the game designer, to be checked in M8 playtests:
- Stage score = 55% labels + 15% early-guess bonus + 30% audit (+5% box, full run only). Stars at 0.30 / 0.62 / 0.87.
- Being accurate but always waiting for every tile gives 2★. 3★ needs some early guessing and a clean audit.
- L1 is 12 pictures in 30 s (spec value). That may feel fast for 12-year-olds.

**Default:** as above.
**Your answer:**

### 4. Earlier defaults still waiting for a yes/no
These are marked "Owner to confirm? Yes" in `docs/DECISIONS.md`:
- Brand colours (D2): spec §9 discipline colours
- No logos, text-only "DIS" / "C4X Digital" (Q1)
- System fonts (no web fonts)
- Leaderboard: extra columns `mode` and `group_token`; global rate limit of 30 runs per minute
- Stage 1 extras: rulebook examples, two new rules per level, scoring and stars, the "which rule to automate" options, and full-run Stage 1 length (≈2.6 min against a 5–6 min budget)

**Your answer:**

### 5. Optional: local place or sector names (§4.4)
Stage 1 uses sectors A–F. If you'd like Singapore place names instead, list them here.
**Your answer:**

---

## Setup notes (no answer needed)
- **Supabase keys:** in a session, Claude puts them in `.env.local`, which git ignores, and never commits them. The live site reads them from Vercel's environment variables (Project → Settings → Environment Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). If the deployed leaderboard ever says "unavailable", check them there.
