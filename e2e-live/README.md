# Live team checks and screenshots

Real browsers against a real build and **real Supabase Realtime** (the `e2e/` suite uses a local relay and a mocked Supabase instead). Run before an event, after deploying. Not part of CI.

```
npm run live:groups      # teams of 2, 3 and 4: lobby, turn rotation, waiting screens, rejoin, late join refused, finale, debrief, free play (18 checks each)
npm run live:race        # host taps Start the instant teammates join, 5 rounds: nobody may be dropped
node e2e-live/capture-flows.mjs [solo|replay|board|2|3|4|drop]   # screenshots for docs/GAME_FLOWS.md
```

- Score submission is intercepted, so nothing is written to the real leaderboard. Lobbies expire on their own.
- By default these run against the deployed site. To check a local build first (it reads `.env.local`):
  ```
  npm run build && npx vite preview --port 4173 &
  LIVE_URL=http://localhost:4173 npm run live:groups
  ```
- Check screenshots land in `test-results/`; flow screenshots in `docs/flows/`.
