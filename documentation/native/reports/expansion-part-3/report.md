# Expansion Part 3 report — social systems, Sylvie and AI Planner

**Status: built and verified locally against a disposable backend; not run on a tablet, not run against a hosted service, no real AI provider called.** Built on `expansion-part-3` on 4 and 5 November 2026. The owner's second brief (5 November) settled E-13 and approved the dependencies and the local Realtime migration, and Part 3 was finished under it. Verification results are in the [Part 4 report](../expansion-part-4/report.md); the tablet and hosted checks are listed there as **unverified**.

## 1. What was built

| Slice | What a student can now do | Where |
| --- | --- | --- |
| A AI Planner V2 | Save accepted details (free), choose a spending ceiling up to $1.75 and consent, build a plan, watch it (seen-only 5 s poll), stop it, answer the exact questions the server kept, inspect strategy and research, add PDF or text **materials** (up to 3 MB) for research, and confirm into quests with the required acknowledgements. The server decides what is allowed at each step; one idempotency key per action, reused when an answer is lost | `packages/backend/src/planner.ts`, `spaces/home/plan/{usePlanner,NewPlanSheet,PlannerFlow,PlansView}` |
| B Sylvie | Streamed answers with honest status words; replies drawn through a safe Markdown reader with **readable maths** (LaTeX to Unicode); **image attachments** (up to 4, 5 MB each) shown back through the signed-in session; a proposal she signs is previewed and applied once (Apply or Not now); her daily note and recent **insights** on Today; quick-ask from Today and from inside the Focus environment; "Review in Plans" carries her words into the New plan sheet | `shell/rich-text/`, `shell/sylvie/`, `SylvieTool.tsx`, `destinations/{TodayBriefing,QuickAsk}.tsx` |
| C Social | **People** (find, request, remove, block, and a **Blocked** list with Unblock), **Messages** (conversations, send, edit, delete, earlier messages, groups: create, rename, leave), a notifications list, and **Realtime** as a nudge with the polling fallback kept | `social.ts`, `spaces/home/circle/`, `realtime.ts` |
| D Parties | Start a party, invite friends, answer invitations, leave; **study together** through the one study session (below); a room panel with who is focusing; an invitation card on Today | `party.ts`, `party-presence.ts`, `shell/party/`, `circle/PartiesView.tsx` |
| Backend | **S-15** messaging block checks fail closed. **A-28** a group keeps a manager. `GET /api/friends/blocked` (own blocks only). Migration `20261105000000_native_message_realtime_publication` (local development only) | `lib/block-service.ts`, `app/api/conversations/**`, `app/api/friends/blocked/route.ts`, `prisma/migrations/` |

## 2. How party time counts (owner decision E-13)

A party session is the **one** study session with a room attached (ADR 0015 decisions 11 and 12). Its time and its credit are the study session's alone, delivered by the existing journal to `/api/sessions` and settled by the server's own XP and ledger code, so there is **no second session and no second reward**. The room is only where the others see you:

- The session record carries `party {partyId, name, roomSessionId, joinedAt}`. `createPartyPresence` mirrors "focusing" or "paused" to the room's acknowledged actions and never blocks or changes the session. If the room cannot be reached the session keeps counting and says so.
- Leaving the room is journaled through TimerSync's existing `party` branch with the original seating and exit instants, so a lost answer or days offline replays exactly. A session that ended before its seat was learned recovers the seat first.
- Beginning a party session asks nothing when idle. With a session already running (solo, or in another room) the person is asked first, because Sylf keeps one session at a time.
- The server's room seconds (`FocusSessionMember`) still exist for the room's display and are not a credit path. No server ledger code changed. Proved on a real server: one study session is created, and the room exit leaves nobody seated.

## 3. Defects found and fixed during Part 3

| ID | Where | Fix |
| --- | --- | --- |
| S-15 | Block check failed open for messaging | `failClosed` on messaging paths. Real-server test passes: neither side can write into a blocked conversation or start one |
| A-28 | A group lost its manager when its creator left | Creator hands over to the longest-standing member. Real-server test passes |
| New | Native called `DELETE focus-party/[id]/members/[memberId]` to leave. That route is the **leader removing someone by user id**; leaving is `DELETE focus-party/[id]` | Client rewritten to the server's real routes and `FocusPartyStateView` shape |
| New | Server answers a repeated room action without `sessionId` | Optional in the client; the room is asked for it with `enter` |
| New | Part 2 or earlier tests/checks were stale: two ADR 0010 bridge tests counted the presence heartbeat as a session POST; a restore test assumed no request at start; three horizontal `ScrollView`s lacked `keyboardShouldPersistTaps`; `home-check.mjs` used removed test IDs | Fixed (see Part 4 report for what still fails) |

## 4. Not built, with reasons

| Item | Why | What it would take |
| --- | --- | --- |
| Companion drawing | Part 1 chose prerendered sprites, and no sprite pipeline exists. Building one is an art-asset project | Render a catalogue of companion frames to images with a script; show them in Circle and the room |
| Insights **dismiss**, AI **memories** | The server has no dismiss route and no read API for `AiMemory` | Additive routes first, then UI |
| True maths typesetting | Needs KaTeX in an Expo DOM component and a web view on the tablet. Readable Unicode maths ships instead | Add after a tablet run decides it is worth a web view |
| Realtime **presence** channel | Presence already comes from `/api/friends` and the heartbeat; a presence channel adds privacy surface (`showOnlineStatus`) for little gain | Revisit with E-10 |
| Streaming of Planner progress (`?stream=true`) | The seen-only poll is faithful and simpler to keep correct | Optional later |
| `SylvieTool` on `useSylvieTurn` | Two copies of one turn's logic remain; both are covered by the same server route | A tidy-up, no behaviour change |

## 5. Decisions made (reversible)

- Planner schemas are loose zod schemas in `@sylf/backend` (the server enforces the strict contracts).
- Realtime is **only a nudge**: an event invalidates a resource tag and the screen re-reads through REST, so a forged, late or duplicated event costs a refresh and nothing else. It is off unless `EXPO_PUBLIC_SYLF_REALTIME_URL` and `EXPO_PUBLIC_SYLF_REALTIME_KEY` are set, and runs only signed in and in front.
- Auth never leaves the gateway, so authenticated images are fetched through the client and drawn from bytes (`ChatImage`), and Electron goes through the host's proxy.
- The party choice is never sticky ("On my own" is the default).

## 6. Needs the owner

See the [expansion handoff](../../handoffs/expansion.md) for the consolidated list. Part 3 specifics: E-6 hosted status (the Vercel connector needs team access approved before environment variables can be read; from code, Planner V2 needs `PLANNER_V2_DURABLE_CORE_ENABLED` and `PLANNER_V2_STUDENT_WORKSPACE_ENABLED` both `"true"` plus a worker and a provider key, and Native reports "not enabled in this deployment" plainly when they are off); the Realtime project address and key for a build that should use it; the migration to the hosted database when the owner chooses.
