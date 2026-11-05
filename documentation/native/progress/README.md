# Progress on Sylf Native

Home's Progress destination answers three questions: am I studying enough, how do I compare, and how does this all work. Six views, chosen with `SubNav` and kept in the Home snapshot. Source wins over this page.

## Views

| View | Answers | Reads | Notes |
| --- | --- | --- | --- |
| Overview | Am I on track? | `user/stats`, `detailed-stats?summary=true`, `user/study-schedule` | Today against the daily target, the week against the week that target makes, thirty days with the Marker on today. **Bars scale to the target**, never to the longest day. Level and rank are one line |
| Stats | Where does my time go? | summary, `sessions?limit=50` | 7 or 30 days, subjects, time of day from the last fifty sessions, recent sessions with Show more. Never the full 186 KB report |
| Standing | How do I compare? | `user/rankings?sortBy=` | Friends or everyone, four orderings, you in context (two above, two below), then the top. The server already leaves out anyone who hides rank or hours from this viewer, and the page says so |
| Honours | What have I earned? | `achievements` | By category. Ready items gather into one row with **Claim all**: one request each, never two for the same, and a refusal stops the run and says why |
| Skills | How is my ability growing? | `cognitive-stats/invest` | Five attributes, tier and next tier. Raising one asks first, in the server's price (skill points or Sylph), then `POST`. Copy that mentions HP is left out |
| Codex | How does Sylf work? | `@sylf/shared/catalogs` behind `import()` | The web's `lib/archive-catalog.ts`, unchanged: chapters, search, related entries, locks from the catalog's own requirement |

Files: `spaces/home/destinations/ProgressDestination.tsx`, `spaces/home/progress/`, reads in `packages/backend/src/progress.ts`, the catalogs entry in `packages/shared/src/catalogs.ts`. With nobody signed in, Progress keeps its small sample view and shows nothing about standing or honours.

## Rules that hold

- **No HP** ([ADR 0017](../decisions/0017-hp-stays-off-native.md)). No read here carries it, and `mentionsHp` removes any attribute copy that speaks of it.
- Every number is the server's or a shared catalog's. Nothing computes a reward, a rank or a price.
- A level-up is one quiet line (`shell/LevelNotice.tsx`), shown once after the server reports a higher level, and never while the Focus environment is open.
- Views mount on first visit and stay, so the page costs nothing to move around (R17). Codex's text loads only when it is opened.

## Moved to Later, with the reason

- **Skill nodes** (`skills`, `skills/unlock`): the catalog is a generic 48-node frame with no names or perks, so there is nothing for a student to choose. Subject constellations, `compile` and `forge-apex` stay out as the brief said.
- **Objectives** on Stats: the summary does not carry them, and a full read would break the budget.
- **Weekly milestone** on Overview: the week is measured against the schedule's own target instead.
- A Codex deep link from "what's this?": the view exists, and the entry route does not yet.

## Part 5 (5 November 2026)

Overview and Stats now draw real bar charts (`shell/charts/Bars.tsx`) scaled to the person's own target, and show the **weekly focus quest** (`GET /api/quests/weekly`, `WeeklyQuestCard`). Standing rows open a profile. Meters use `meterUnits` so a minutes target never becomes a hundred segments.
