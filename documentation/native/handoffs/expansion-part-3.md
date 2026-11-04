# Expansion Part 3 → Part 4 handoff

**Written 5 November 2026**, from the unattended overnight run on `expansion-part-3`. Read the [living Part 3 report](../reports/expansion-part-3/report.md) first (§1 lists what was not run), then the [Part 4 brief](../expansion/part-4-integration-polish.md). Source wins over prose.

## State

- Part 3 is **built in part and entirely unverified**: no test suite, no build, no device and no server was run. Only `tsc` (native), ESLint on touched files and the boundary audit ran, and they are clean at HEAD.
- Branch `expansion-part-3` is pushed to its own remote branch. Nothing is merged, deployed or touched on hosted services. The tablet was not used.

## Built

AI Planner V2 journey in Plans; Sylvie rich text, status events, proposals with confirmation, Today briefing, quick-ask, "Review in Plans" handoff; Circle People, Messages, groups, notifications; Parties lifecycle; backend repairs S-15 and A-28. Details and paths are in the report §2.

## Not built (carry into the final verification or the next owner decision)

Plan materials upload, maths typesetting, Sylvie images, insights/memories, companion, Sylvie inside the Focus environment, Realtime client and presence, blocked list screen, **party session through the one session owner** (needs E-13), party room, World guard for party sessions. Reasons are in the report §3.

## Owner decisions open

E-13 (party time counts as study?), E-6 (hosted Planner flags and real provider spend), dependency approvals (file picker, KaTeX/Expo DOM, `@supabase/realtime-js`), the `Message` Realtime publication migration.

## Rules that still apply

Testing runs only after Part 4's features, on a disposable local backend (Docker Desktop is not running on the Mac). Stage only your own paths. HP stays off Native. No tablet without authorization.
