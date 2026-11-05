# Expansion Part 3 → Part 4 handoff

**Rewritten 5 November 2026** after the owner's second brief. Read the [Part 3 report](../reports/expansion-part-3/report.md), then the [Part 4 report](../reports/expansion-part-4/report.md). Source wins over prose.

## State

Part 3 is **built and verified locally**: Native unit tests, real-server integration (33), the Electron backend check (39), a live Electron check of Circle and parties (19), root security tests, and an RLS audit with a Message Realtime probe. Not run: the tablet, any hosted service, any real AI provider. Branch `expansion-part-3` is pushed. Nothing is merged or deployed.

## Built

Everything in report §1: Planner V2 with materials upload, Sylvie (rich text, readable maths, images, proposals, insights, quick-ask on Today and in the environment), Circle (people, messages, groups, blocked list, notifications), Realtime as a nudge, parties and **study together through the one study session** (E-13), plus S-15, A-28 and `GET /api/friends/blocked`.

## Not built

Companion drawing, AI memories and insight dismissal (no server API), KaTeX typesetting, a presence channel, Planner `?stream=true`, `SylvieTool` on `useSylvieTurn`. Reasons and effort in report §4.

## Owner decisions still open

- **E-6**: whether Planner V2 runs on the hosted server. From code it needs `PLANNER_V2_DURABLE_CORE_ENABLED` and `PLANNER_V2_STUDENT_WORKSPACE_ENABLED` both `"true"`, plus a worker and a provider key. The Vercel connector needs you to approve team access before environment variable *names* can be read. No paid provider was called.
- **Realtime for messages** needs `SELECT` grants for `authenticated` on `Message` and `ConversationParticipant` (not in the history), the project address and key in the build, and the migration `20261105000000_native_message_realtime_publication` applied. All local-only today.
- **Electron checks** `home-check.mjs` and the whole-student `journey-check.mjs` stages `first` and `second` are stale against Part 2's onboarding and Focus redesign (a few selectors were updated; the rest need a rewrite). The `live` stage replaces them for Part 3's screens.

## Rules that still apply

Disposable local backends only. Stage only your own paths. HP stays off Native. No tablet without authorization.
