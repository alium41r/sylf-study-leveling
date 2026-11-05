# Expansion Part 5 handoff

**Written 5 November 2026.** Read the [Part 5 report](../reports/expansion-part-5/report.md) first: it lists what changed, the parity table against Web, the verification and the limits. Then the [expansion handoff](expansion.md) for everything still waiting on the owner (tablet, hosted checks, E-6, Realtime grants, rate limits).

## State

Branch `expansion-part-3`, pushed, not merged, not deployed. No hosted service, hosted database or real AI provider was touched. Stopped after Part 5 for the owner's review.

## Run it yourself

The commands are in [`expansion-part-5-progress.md`](expansion-part-5-progress.md): a disposable backend with Web on 3111, a seed script and a history backfill, and the Native browser host on 3200. Sign in as `alice@local.test`. Only one `next dev` can run per checkout, so stop the serving backend before running `run-backend-local.mjs --live` or `--native-checks`.

## Where the new code is

| Thing | Where |
| --- | --- |
| Bar charts, weekly quest card | `native/apps/sylf/src/shell/charts/` |
| Profiles (store, cosmetics mapping, sheet) | `native/apps/sylf/src/shell/profile/`, read in `packages/backend/src/profile.ts` |
| Today status, upcoming, weekly quest | `spaces/home/destinations/{TodayStatus,TodayAhead,ahead}` |
| Quest and goal redesign, calendar Day and week lane, natural-language add | `spaces/home/plan/{QuestsView,CalendarView}.tsx` |
| Chat view, avatar rows | `spaces/home/circle/{MessagesView,PersonRow}.tsx` |
| Sylvie history | `spaces/home/destinations/QuickAsk.tsx`, `shell/sylvie/useSylvieTurn.ts` |
| Local dev host, seed, backfill, API probe | `scripts/dev/` |
| Live Electron checks | `native/apps/desktop/src/journey-check.mjs` stage `live`, run with `scripts/test/run-backend-local.mjs --live` |

## Next, in order of value

1. Tablet run (the owner's authorization). 2. Phase 14 Notes, which fills four placeholders at once. 3. The pixel avatar renderer decision, which unlocks Shop, Locker and artwork. 4. Calendar connections and shared calendars. 5. Rewrite `home-check.mjs` and the `first`/`second` journey stages.
