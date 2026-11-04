# Expansion Part 3 report — social systems, Sylvie and AI Planner

**Status: in progress (living document).** Started 4 November 2026 on `expansion-part-3`, in an unattended overnight run. **Nothing described here has been run or tested.** The owner deferred all testing to the end of Part 4, so the only checks that ran are `tsc` (native and root), ESLint on touched files and the boundary audit. Tests were written alongside the code and are listed below as unrun.

## 1. What was not run (read this first)

- No Vitest suite, no integration suite, no Electron check, no tablet run, no build. Docker was not running, so no disposable PostgreSQL existed and no backend defect was reproduced against real SQL.
- Everything built here is therefore **unverified on screen, on Hermes and against a live server.** Plan for failures when verification runs.
- No real AI provider was called. Educational quality of plans is unverified (E-6 not answered).
- The Samsung tablet was not touched.

## 2. Built

| Slice | What | Where |
| --- | --- | --- |
| A AI Planner V2 | Named reads and writes with `x-sylf-planner-contract: 2`, a `buildIntent` for accepted details, one idempotency key per action (reused when a lost answer is retried), the planner hook, a New plan sheet, and the journey in Plans: authorize (ceiling, consent, optional research), live view by seen-only 5 s poll, stop, questions, inspect, confirm with required acknowledgements | `packages/backend/src/planner.ts`, `spaces/home/plan/{usePlanner,NewPlanSheet,PlannerFlow,PlansView}` |
| B Sylvie | `RichText` (safe Markdown parser, no HTML, http(s) links only), status events, proposal preview with Apply and Not now through `confirmSylvieAction`, Today's briefing, quick-ask on Today, "Review in Plans" handoff | `shell/rich-text/`, `shell/sylvie/useSylvieTurn.ts`, `SylvieTool.tsx`, `destinations/{TodayBriefing,QuickAsk}.tsx`, `plan/prefill.ts` |
| C Social | People (find, request, message, remove, block), Messages (list, conversation, send, edit, delete, earlier, groups: create, rename, leave), notifications list. Fallback poll 30 s seen-only | `packages/backend/src/social.ts`, `spaces/home/circle/`, `HOME_VIEWS.circle` |
| D Parties | Lifecycle: invitations, start, invite, leave. Client calls for session enter and timer actions exist with no UI | `packages/backend/src/party.ts`, `circle/PartiesView.tsx` |
| Backend | **S-15** messaging block checks fail closed. **A-28** a group keeps a manager | `lib/block-service.ts`, `app/api/conversations/**` |

Unrun tests written: `planner.test.ts`, `rich-text/parse.test.ts`, `home.test.ts` (circle views), `__tests__/security/s15-block-fails-closed.test.ts`, `__tests__/security/a28-group-keeps-manager.test.ts`.

## 3. Not built (and why)

| Item | Reason |
| --- | --- |
| Materials upload for a plan | Needs a file-picker dependency the owner has not approved |
| Streaming (`?stream=true`, Sylvie progress beyond status events) | Streaming spike has no result (ADR 0016) |
| Maths typesetting (KaTeX in an Expo DOM component) | New dependency, needs approval. Maths shows as source in a code face |
| Images in Sylvie (multipart, `RemoteImage` with bearer) | Not reached |
| Realtime client and live presence | `@supabase/realtime-js` is approved for a spike only and not installed; needs a real device and a Realtime server. The bounded fallback is the working path |
| `Message` Realtime publication migration | Touches RLS: the owner decides |
| Party session through the one session owner, party room, leave with replay, invites in Today, World guard | Needs E-13 (does party time count as study?) and careful work on `createStudySessionModel` |
| Blocked list and unblock screen, insights and memories, companion, Sylvie entry inside the Focus environment | Not reached |

## 4. Decisions made (reversible)

- Planner schemas are **loose** zod schemas in `@sylf/backend`, not exports from `@sylf/shared`: the server enforces the strict contracts, and a loose parse survives additive fields.
- The spending ceiling offered is $0.50, $1.00 or $1.75 (web's student maximum); the server remains the authority.
- The Planner handoff only carries Sylvie's words into the New plan sheet. The web's handoff targets the older Copilot planner and is not reused.
- Quick-ask lives on Today's non-empty page only for now.
- Circle's "Parties" view replaces the old read-only party section; the People view keeps the ring.

## 5. Needs the owner

1. **E-13** before party sessions settle anything.
2. **E-6**: whether Planner V2's flags and worker run on the hosted server, and whether a real provider may be used for testing, with a spend.
3. Approve dependencies: a file picker (plan materials), KaTeX/Expo DOM, `@supabase/realtime-js` for the spike.
4. The `Message` Realtime publication migration.

## 6. Defects found

| ID | Where | State |
| --- | --- | --- |
| S-15 | `areUsersBlocked` failed open for messaging | Fixed (additive `failClosed`), test unrun |
| A-28 | Group lost its manager when the creator left | Fixed, test unrun |
| New | `members/[memberId]` semantics (member row id vs user id) unverified; `PartiesView` assumes the member row id from `GET focus-party/[id]` | Check when parties are tested |
| New | `home-check.mjs` still names `circle-invite`, which only the sample path renders; live Circle changed | Review when Electron checks run |
