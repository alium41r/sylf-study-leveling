# Expansion stage handoff

**Written 5 November 2026.** Parts 1 to 3 are built. Part 4 was **partly performed**: everything that can run on a disposable local backend ran and passed (see its [report](../reports/expansion-part-4/report.md)); the tablet, the hosted checks, measurements and a real Planner run did not, by rule or by missing authorization. Nothing is merged or deployed, hosted data was never touched, and the branch is `expansion-part-3` (it contains Parts 2 and 3).

Start with the [Part 4 report](../reports/expansion-part-4/report.md) §1 (what was not done), then the [Part 3 report](../reports/expansion-part-3/report.md) and [handoff](expansion-part-3.md).

## What the owner needs to decide or do

1. **Authorize the tablet run** and say which build to use. The [tablet checklist](tablet-checklist.md) has a new section for everything added. Three native modules were added (`expo-document-picker`, `expo-image-picker`, `@supabase/realtime-js`), so it needs a prebuild.
2. **E-6 and hosted checks.** Approve the Vercel team access so Planner V2's environment variable names can be read, or read them yourself (`PLANNER_V2_DURABLE_CORE_ENABLED`, `PLANNER_V2_STUDENT_WORKSPACE_ENABLED`, a worker, a provider key). Say whether a fixture-provider or a real, capped run may test the Planner journey. Run the deployment checklist's read-only queries.
3. **Realtime for messages (R-1).** Grant `SELECT` on `Message` and `ConversationParticipant` to `authenticated` and apply `20261105000000_native_message_realtime_publication`, or leave Realtime off. Give a build `EXPO_PUBLIC_SYLF_REALTIME_URL` and `_KEY` to use it.
4. **Rate limits (R-3)** on the remaining 53 writing routes, and the optional server rule against a solo session beside a party session (R-2).
5. **Rewrite the two stale Electron scripts** (R-4), or retire them in favour of the `live` stage plus a new one for Part 2's screens.

## Study together in one line

A party session is the one study session with a room attached. Its time and credit are the session's alone (E-13 answered yes), so there is no second session or reward, and the exit is journaled and replayable. See the [Circle guide](../circle/README.md) and [ADR 0015](../decisions/0015-session-modes-focus-environment-and-parties.md).

## Phase 14 requirements (restated)

Unchanged from the [Stage 3 handoff](stage-3.md) and not re-audited this stage: Workspace's tools and `LIMITED_TOOLS`, G-6, G-7 and G-13, and Notes joining Sylvie and Focus when it arrives. Two additions from this stage: Sylvie's chat already carries image attachments and readable maths through `shell/rich-text` and `shell/sylvie/ChatImage`, so Notes should reuse them; and `reads.upload` plus `PickedFile` are the one way to send a chosen file. Do not start Phase 14 without the owner.

## Rules that still apply

Disposable local backends only. Stage only your own paths. HP stays off Native. No tablet without authorization. No deploy.
