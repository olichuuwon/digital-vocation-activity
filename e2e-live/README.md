# Live group checks

Real browsers against the **deployed site and real Supabase Realtime** (the `e2e/` suite uses a local relay instead). Run before an event, after deploying. Not part of CI.

```
npm run live:groups      # 2, 3 and 4 phones: lobby, rotation, support cards every stage, rejoin, late join refused, co-op finale, debrief (18 checks each)
npm run live:race        # host taps Start the instant teammates join, 5 rounds: nobody may be dropped
```

- Score submission is intercepted, so nothing is written to the real leaderboard. Lobbies expire on their own.
- `LIVE_URL=https://… npm run live:groups` tests another deployment.
- Screenshots land in `test-results/`.
