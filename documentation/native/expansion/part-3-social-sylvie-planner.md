# Expansion Part 3 — Social systems, Sylvie and AI Planner

**Brief for a fresh session, updated by Part 1 on 1 November 2026. Not started, and it needs the owner's authorization.** Part 2's handoff updates this page, and its version wins. The [stage plan](README.md) holds the rules and gates.

## Goal

Finish the things that need a second party: a planning partner that can build a real plan, a Sylvie who is present and can act, and friends you can talk and study with.

## Prerequisites

- Part 2's gate is passed: Plan, Plans view, Focus environment and session modes exist.
- Part 2 step 0's Realtime and streaming spikes have results.
- U-3 and U-6 are fixed.
- Answers to E-6 before slice A, and E-13 before slice D.

## Read first

[Stage plan](README.md), `handoffs/expansion-part-2.md`, [blueprint](blueprint.md), [feature map](feature-map.md), [ADR 0015](../decisions/0015-session-modes-focus-environment-and-parties.md), [ADR 0016](../decisions/0016-realtime-streaming-and-remote-media.md), [Student workspace](../../planner/STUDENT_WORKSPACE.md), [Sylvie contract](../../sylvie/README.md), [timer contract](../../timer/README.md) on Focus Parties, [ADR 0009](../decisions/0009-native-authentication.md) on Realtime tokens.

**Skill:** `sylf-ui-implementation` applies to all UI. `securitymaxxing:llm-app-security` applies to Sylvie and Planner.

## Order

```
A AI Planner V2 ─► B Sylvie ─► C Social and Realtime ─► D Parties
```

Planner goes first because Sylvie hands off to it, and Part 2 left its seam fresh. Realtime comes before parties because a party needs it. Stop after D.

---

## Slice A — AI Planner V2 in Plan

**Everything happens inside Home's Plan destination, in the Plans view from Part 2. This slice adds no navigation and no second planner.** Web's workspace stays untouched and remains usable.

**Principle.** The server owns the journey. The client shows state and asks. It never picks a model, a budget, a compiler or a permission, and it never decides that work is approved. Reading never grants authority.

| Step | Routes | Native |
| --- | --- | --- |
| Readiness | `GET planner/workspace`, `capabilities` | Off, unavailable worker and missing provider each say so. Saved plans stay readable |
| 1 Accepted details | `POST` `CREATE`, intent `PATCH` | Goal, deadline, topics, availability. Saving is free, and it says so |
| 2 Background | `NOTE`, `planner/[id]/assistant` | Free notes. Advice is a separate, explicit authorization |
| 3 Materials | `planner/[id]/documents` | Pick PDF or text, with ownership rechecked by the server. Research needs explicit permission |
| 4 Authorize | `GENERATE` | The real ceiling, up to the server's maximum, and explicit consent. Stop-state retries reuse the original request identity |
| 5 Watch | `?stream=true`, or the read-only poll | Six stages, faithful to the server. **Nothing advances on a timer.** Leaving does not cancel |
| 5a Stop | Operation `CANCEL` | Durable, and it says what stopped |
| 6 Questions | `CONTINUE` | Exact retained questions, with changed details traveling with the answers |
| 7 Inspect | `planId`, `attemptId`, `history=true`, `artifactId` | Strategy, research notes, review findings, earlier versions. Unapproved work is labelled, never hidden |
| 8 Confirm | `planner/[id]/commit` | Exact changes, required acknowledgements, then a separate confirmation. `ApplyService` rechecks everything |
| After | Quests appear in Today and Plan | **No replanning routes:** `rebalance`, `reoffer` and `stretch` refuse V2 plans with 409 `PLANNER_V2_PATH_REQUIRED`, and web's student workspace doesn't use them. A new request is how a student replans |

| Requirement | How |
| --- | --- |
| Transport | Named reads in `@sylf/backend`, sending `x-sylf-planner-contract: 2`. Allow 60 s for reads, as web does |
| Types | `lib/planner/v2/client/workspace.ts` is types and constants, so export them through `@sylf/shared`. `transport.ts` is not portable |
| Long wait | `?activity=true` every few seconds while seen, stopping on a terminal state, as web's fallback does. `&stream=true` through `expo/fetch` if the spike passed. A stream is an improvement, never a dependency |
| Lost acknowledgement | **Retry same action,** with the same identity. No automatic mutation retries |
| Offline | Reads show the last copy. Mutations are refused plainly. Nothing queues |
| Sign-out | In-flight views are dropped, and old-owner events are rejected |
| Size | Plans can be large, with a 4 MiB transport ceiling. Long documents render in pages and stay out of memory when hidden |
| Rendering | Provider reasoning is untrusted text. It is shown as text and never executed |

**Backend.** Fix what breaks for a bearer client. Anything that touches `ApplyService`, a compiler or a resource policy stops and asks.

**Testing without spending.** Scripted provider fixtures already exist in the Planner suites, and `run-backend-local` blanks provider keys. A real provider run needs a named spend (E-6). Report educational quality as unverified, because Phase C is deferred by the owner.

**Done when.** With flags on and fixtures, a student goes from a goal to confirmed quests on Native, including a question, a stop, a retry, leaving mid-run and returning. With flags off, Native says so plainly and saved plans still read.

**Update:** [ADR 0012](../decisions/0012-connected-app.md) decision 16, `documentation/native/plan/README.md`, Planner docs if web changed, the journey.

---

## Slice B — Sylvie

**One Sylvie, on one runtime.** Quick-ask, Workspace's tool, the Focus environment and the Planner handoff all use `system-messages/chat`. Quotas, tools and model choice stay on the server.

| Build | Owner | Notes |
| --- | --- | --- |
| Progress during a reply | `client.stream`, Part 1's result | Fixes T-6. Honest status events, never a typing effect |
| Rich text | `ChatText`'s behavior, as `RichText` | Headings, lists, code, links, tables. **Maths must work:** web uses KaTeX. Render it in an Expo DOM component, as ADR 0001 already does for rich text, loaded only when a reply contains maths. Replaces ADR 0012 decision 18 |
| Proposals and confirmation | `pendingAction` on a `result` event or a history message, returned as `confirmationToken` on the next turn | Preview, exact confirm, cancel. Single use, and refused once a newer turn exists. A failed confirmation is consumed. Never automatic. `chatMessagesSchema` and `sendToSylvie` need widening, and the JSON answer shape differs from the stream's |
| Quick-ask | H3, Proposed in the master plan | An overlay from Home, reusing the same conversation machinery, not a mini-app |
| In the environment | Same | One small entry, with bounded subject hint as web's tutor does |
| Images | `image-contract.ts`, `ai-chat-attachments`, multipart `images` | Four images, size limits, cross-provider disclosure. `system-messages/[id]/images/[index]` needs a bearer header, so `RemoteImage` passes one, and Electron goes through its proxy. `lib/ai/sylvie/chat-client.ts` is portable in shape, so reuse its event handling |
| Daily briefing | `system-messages?type=DAILY_BRIEFING&global=true&limit=1&unreadOnly=true` | On Today, one line and a way in. Never forced. **Depends on the cron in U-5** |
| Planner handoff | `planner-bridge.ts`, `planner-handoff-client.ts` | "Review in Planner" opens Plans, proposal-only |
| Insights, memories | `insights`, `AiMemory` | Should. Confirmed writes only |
| Companion | Part 1's renderer, `lib/pixel-display/` | A quiet presence, from existing art and content. Not a mascot, and it does not interrupt study |

**Security.** Model output is untrusted. Links and any rendered content are escaped. A proposal is only ever what the server signed. Follow `securitymaxxing:llm-app-security`.

**Done when.** Sylvie's replies look right and show progress on the tablet. A proposed change can be confirmed on Native and refused safely when stale. Sylvie appears as one presence across Home, Workspace and Focus.

**Update:** [Sylvie contract](../../sylvie/README.md) (native note), [Workspace guide](../workspace/README.md) §5, master plan H3.

---

## Slice C — Social and Realtime

| Build | Owner | Notes |
| --- | --- | --- |
| Realtime client | `realtime/token`, `lib/realtime-status.ts`, `@supabase/realtime-js` | One connection for someone signed in, on [ADR 0016](../decisions/0016-realtime-streaming-and-remote-media.md)'s two hosts: in JavaScript on a device, in Electron's main process on desktop. `{ enabled: false }` is a normal answer. Token refreshed before its 30 minutes. Closed at sign-out and when nothing needs it |
| Fallback | `createResourceStore` | Bounded, seen only, per [stage plan rule 7](README.md#6-architecture-rules). **Web's 15 s and 30 s polling is not copied** (P-8) |
| Presence | `useRealtimePresence`'s behavior | Respects `showOnlineStatus`. Heartbeat falls back to its slower cadence |
| Find people | `users/search`, `friends/requests` | `allowFriendRequests` respected, with server words on refusal |
| Manage | `friends/remove`, `friends/block`, `friends/unblock` | Blocking is immediate on every surface |
| Public profile | `user/[username]`, `profile/stats` | Part 2's rendering. Hidden reads as hidden |
| Messages | `conversations`, `conversations/[id]?before=` (50, `hasMore`, marks read), `.../messages?after=`, `.../messages/[messageId]` | List with unread. Conversation at both widths. Send, edit, delete. Text only: the schema has no attachments. Optimistic only where it can be undone, with a real failure state |
| Groups | `conversations`, `conversations/[id]` `PATCH` | Create, name, members, leaving. `mayAddToConversation` already fails closed. Only the creator may manage a group |
| Notifications | `notifications` | The list, reached from Circle or Today as the blueprint chose. Local only |

**Backend, fix here.**

| ID | Repair |
| --- | --- |
| A-28 | A group keeps a manager when its creator leaves. Check web's expectation first |
| S-15 | `areUsersBlocked` fails closed for messaging |
| Realtime | `Message` publication and its RLS policy, from `scripts/db/supabase-realtime-setup.sql`, go in a migration if the owner agrees, because `20261101000000_rls_defense_in_depth` turns RLS on for that table |

**Privacy.** Every route used gets a blocked-user and non-member test. `allowDirectMessages` is respected. A message never reaches a client outside the conversation, including over Realtime: test with a second account.

**Done when.** Two real clients, one web and one Native, can find each other, chat, form a group and block, in real time, and it still works with Realtime off.

**Update:** new `documentation/native/circle/README.md`, [Home guide](../home/README.md) §4, [ADR 0009](../decisions/0009-native-authentication.md) on the token.

---

## Slice D — Parties and studying together

**One session, always. Read [ADR 0015](../decisions/0015-session-modes-focus-environment-and-parties.md).** A party session is a kind of the one active session. Its time comes from the server's party state, the dock and the environment show it, and a solo session cannot run beside it.

**Settle E-13 first.** Part 1 proved the server allows a solo session during a party, and read that party time banks only on `FocusSessionMember`, with no `StudySession`, total or ledger. Run one party to settlement to confirm, then build to the owner's answer.

| Build | Owner | Notes |
| --- | --- | --- |
| Party lifecycle | `focus-party` (answers `partyId`), `focus-party/[id]`, `join`, `invite`, `members/[memberId]`, `invites/[id]` (`ACCEPTED` or `DECLINED`) | One active party, four members, as the server says. Joining needs an invitation |
| Party session | `focus-party/[id]/session`, `session/timer` | Start, pause and resume are acknowledged server actions. No local authority |
| Leaving | `TimerSync`'s party branch | Local exit is immediate, durable and replayable. Uses the original `participationJoinedAt` |
| Room | `useFocusPartyRealtime`'s behavior, Part 1's blueprint | The Focus environment with people in it. Members' states, no chat wall. Realtime with a bounded read fallback |
| Inviting to study | `invites`, `SessionInvite` | Should. Appears in Today and Circle, never as an interruption during focus |

**Rules.** A running solo session must end or pause before joining, with a plain question. Party time obeys the server's clamp. World's guard covers a party session. Whatever E-13 decides, the client computes no reward.

**Done when.** Two real clients study together across web and Native, one drops offline and returns, one leaves, and what the student's record shows is exactly what the server settled, under E-13's answer.

**Update:** [timer contract](../../timer/README.md), [Spaces guide](../spaces/README.md), `documentation/native/circle/README.md`, the journey with a second student.

---

## Dependencies

Part 2's Plan, Focus environment and Account. Part 1's spikes. E-6 before slice A. Owner authorization for a tablet run, and for any real provider call.

## Risks

| Risk | Response |
| --- | --- |
| R18: Realtime on Hermes fails | The bounded fallback is a real path, and the feature ships without live updates |
| R19: Planner runs long and can cost money | Server limits stand. Fixtures for tests. Real runs by named approval only |
| Planner's surface is enormous | Follow the eight steps. Web's Classic Planner, Modes, Quick Plan and Copilot are out. Cut Should items first |
| Two-client testing is slow | Build the second student into the harness early, in slice C |
| Party timer drifts from the one owner | ADR 0015's single-kind model, with the session-owner test extended |
| Moderation | Blocking and limits only. No reporting system exists, so it is a future possibility |

## Deliverables

Slices A to D. `reports/expansion-part-3/report.md`, with evidence. `handoffs/expansion-part-3.md`. An updated [feature map](feature-map.md).

## Testing

[Stage plan §9 and §10](README.md#9-quality-gates). In addition:

- Planner: the whole journey on fixtures, with each stop state, on real SQL. `node scripts/test/test-backend-postgres.mjs --suite planner` and `--suite planner-v2` with Node 24, as the [harness](../handoffs/stage-3.md#6-harness) shows.
- Sylvie: confirmation replay and expiry.
- Social: two accounts, blocked and non-member cases, over HTTP and over Realtime.
- Parties: two clients, offline, leave, replay. `node scripts/test/test-backend-postgres.mjs --suite timer`.
- Report educational quality and real provider streaming as unverified unless a named spend ran them.

## Completion criteria

1. Every Must in slices A to D is built and verified on Electron, and on the tablet if authorized.
2. AI Planner V2's complete workflow runs in Home, and no second planner exists.
3. `ApplyService`, ledgers and resource policies are unchanged, unless the owner approved otherwise.
4. Web and Native interoperate in messaging and parties.
5. One session owner still holds, with parties.
6. The full local set passes on a named commit, with no new failure.
7. The owner has reviewed. **Stop here.**
