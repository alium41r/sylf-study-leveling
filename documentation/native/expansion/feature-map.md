# Expansion stage: Web-to-Native feature map

**Written 1 November 2026 from `f5a900b` plus its uncommitted changes, then verified and corrected by [Expansion Part 1](../reports/expansion-part-1/report.md).** This is the authoritative map for the [Expansion stage](README.md). Source, tests, schema and configuration win over anything here.

**How it was verified.** A static inventory of all 155 routes ([`route-inventory.json`](../reports/expansion-part-1/evidence/route-inventory.json)). About 175 requests as a bearer client, against a production build on a disposable local database, including a second and third student ([contract probes](../reports/expansion-part-1/evidence/)). An import walk of 32 shared modules ([`portability.json`](../reports/expansion-part-1/evidence/portability.json)). Reading web workflows and Native's screens. **Nothing ran on a device, on Hermes, against a hosted service or a real AI provider.** Rows marked ✓ were proved by a request.

## Status words

| Word | Meaning |
| --- | --- |
| **Implemented** | Native does this with real data, for a signed-in person. |
| **Partial** | Native does some of it. The row says what is missing. |
| **Missing** | Native has no surface for it, though the backend has an owner. |
| **No owner** | The backend has nothing, so it is deferred unless a small addition is approved. |

| Priority | Meaning |
| --- | --- |
| **Must** | The stage cannot finish without it. |
| **Should** | Build it unless Part 1 shows it is not worth it. |
| **Later** | Named so it is not forgotten. Not in this stage. |
| **Stays web** | Remains on Sylf for the web, with nothing imitated. |

## 1. How far Native reaches today

Native reaches **26 of 155** `route.ts` files. `TimerSync` also holds the Focus Party timer route, but no native party session exists to use it.

| API group | Routes | Native reaches | Which |
| --- | ---: | ---: | --- |
| `planner` | 27 | 1 | `capabilities` |
| `user` | 21 | 3 | `stats`, `detailed-stats`, `earned-this-week` |
| `auth` | 15 | 6 | The native routes |
| `calendar` | 9 | 1 | `personal` |
| `focus-party` | 8 | 1 | The list |
| `friends` | 7 | 3 | List, requests, answering a request |
| `subjects` | 6 | 1 | List |
| `quests` | 5 | 2 | Today, completing one |
| `system-messages` | 4 | 2 | History, chat |
| `conversations` | 4 | 0 | |
| `notes` | 5 | 0 | Phase 14 |
| `goals` | 3 | 1 | List |
| `profile` | 3 | 0 | |
| `focus-backgrounds` | 3 | 0 | |
| `chats` | 2 | 1 | List |
| `notifications`, `invites`, `skills`, `shop`, `inventory` | 2 each | 0 | |
| One-route groups reached | | 4 | `sessions`, `cosmetics`, `acoustics`, `achievements` |
| Others | | 0 | `realtime`, `pixel-creations`, `users`, `insights`, `currency`, `cognitive-stats`, `admin`, `cron`, `waitlist`, AI accounting |

The schema has 73 models and the history has 81 ordered migration folders.

## 2. Findings that change the plan

These were not in an earlier report, except where noted.

| ID | Finding | Evidence | Consequence |
| --- | --- | --- | --- |
| **A-1** ✓ | **Native never sends a heartbeat.** Friends read online from `lastSeenAt` inside two minutes, so a student on Native alone always reads as offline. Proved: `isOnline` false before a heartbeat, true after one. | `app/api/user/heartbeat/route.ts`, `app/api/friends/route.ts:151`. No match in `native/` | Fix in Part 2 slice A |
| **A-2** | **HP penalties do not reconcile for a Native-only student.** The lazy job runs from `heartbeat` and `calendar/month`, and Native calls neither. | `app/api/user/heartbeat/route.ts:51`, `app/api/calendar/month/route.ts:40` | Fixing A-1 turns penalties on, so HP must become visible first. Decision E-8 |
| **A-3** | **Native has no onboarding.** `hasCompletedOnboarding` stays false, and web redirects to its four-step flow. A Native student gets no subjects, class or avatar. | `proxy.ts:125`, `app/api/user/onboarding/route.ts`, no match in `native/` | Part 2 slice A |
| **A-4** | **Native cannot write subjects, quests, goals or the study schedule.** `restDays` defaults to Sunday, the server refuses quests on a rest day, and a student here cannot change that. | `prisma/schema.prisma:188`, `reads.ts`, Stage 3 handoff §6 | Part 2 slices A and C |
| **A-5** | **Timer modes live inside a web component.** The seven modes' phase logic is in `FocusScreen.tsx`, and their defaults in `ModesSettingsScreen.tsx`. Configuration is device-local in `study_mode_config`. | `app/focus/components/FocusScreen.tsx:673-727`, `app/settings/modes/` | A pure module must be extracted, not copied. [ADR 0015](../decisions/0015-session-modes-focus-environment-and-parties.md) |
| **A-6** | **Downgraded by Part 1.** `calendar/month` writes during a read, but reconciliation is idempotent, keeps a cursor, and also runs from the heartbeat. It is safe for Native to read, for study data on Month only. **No server change needed.** Trap: `month` is 0 to 11. | `lib/hp-penalty-service.ts`, `app/api/calendar/month/route.ts` | Read it, no repair |
| **A-7** | **Planner's client is not portable.** It uses `apiFetch`, `client-data-cache`, `credentials: "include"` and a contract header. Its types are. | `lib/planner/v2/client/transport.ts`, `lib/planner/v2/client/workspace.ts` | Named reads in `@sylf/backend`, sending `x-sylf-planner-contract: 2` |
| **A-8** | **AI Planner V2 is off by default and needs a worker.** It needs two flags, a same-host worker and a provider credential, and no formal educational qualification has happened. | [Student workspace](../../planner/STUDENT_WORKSPACE.md), `planner/capabilities` | Native must read `studentWorkspace.enabled` and state plainly when it is off. Decision E-6 |
| **A-9** | **Streaming arrives whole on React Native.** Sylvie's reply took about ten seconds with no progress (T-6), and Planner's live trace depends on streaming. **Likely answer with no new dependency:** SDK 58 ships `expo/fetch`, with a streaming body and multipart. Not yet run on Hermes. | Stage 3 verification report, `native/node_modules/expo/src/winter/fetch/` | Prove in Part 2's device spikes. Planner works from its read-only poll either way |
| **A-10** | **The rule "nothing polls" conflicts with "preserve polling fallbacks".** | Stage 3 handoff §7 rule 2, `AGENTS.md` | Narrowed by [ADR 0013](../decisions/0013-expansion-stage.md) decision 7 |
| **A-11** | **Native has no Realtime client, and Electron's rules block a simple one.** There is no Supabase package, and nothing subscribes. `connect-src 'self'` and "no token in the renderer" rule out running it in Electron's page. Migrations publish only the four party tables, and `Message` depends on a manual script, so chat's hosted state is unknown. | `native/apps/desktop/src/security.mjs`, `scripts/db/supabase-realtime-setup.sql` | [ADR 0016](../decisions/0016-realtime-streaming-and-remote-media.md), Part 3 slice C |
| **A-12** ✓ | **Retracted by Part 1.** `GET conversations/[id]?before=` pages backwards, 50 at a time, with `hasMore`. It also marks the conversation read. | `app/api/conversations/[id]/route.ts` | No repair |
| **A-13** | **Appearance is on the account for web and on the device for Native.** Web writes `activeTheme` and `activeBackground` through `POST /api/cosmetics`. Theme Studio is reachable only with `DEV_TOOLS`. | `AppearanceSettingsScreen.tsx:272`, `shell/SpacesShell.tsx:29` | Part 2 slice E |
| **A-14** | **A party session has no native owner.** `TimerSync` has a `party` branch, and the model has no concept of one. | `lib/timer-sync.ts:185`, `session/model.ts` | [ADR 0015](../decisions/0015-session-modes-focus-environment-and-parties.md) |
| **A-15** | **Native has no avatar or companion drawing.** It has `react-native-svg` and no Skia. The Pixel Display engine is portable and its renderer is Canvas 2D. | `native/apps/sylf/package.json`, master plan §6.1 | Part 1 chooses the renderer before Parts 2 and 3 need it |
| **A-16** | **Web's mode, wake lock and fullscreen behavior has no native equivalent.** No keep-awake, audio or notification dependency is installed. | `native/apps/sylf/package.json` | New dependencies need approval. Decision E-11 |
| **A-17** | **Account deletion has no native surface.** Stores normally require it in-app for an app that creates accounts. An unverified account confirms with a password, and a verified one with an emailed code, so both paths are needed. | `app/api/user/account/delete/route.ts`, Stage 3 handoff §3 | Must, Part 2 slice E |
| **A-18** ✓ | **Cosmetics and titles are not checked against ownership.** Any account can set any value, including free-text titles. | `app/api/cosmetics/route.ts`, `app/api/profile/customization/route.ts` | [U-2](../reports/expansion-part-1/urgent-issues.md), before Part 2 slice E |
| **A-19** ✓ | **Messages have no limit:** 1,000,000 characters accepted, and 40 in 337 ms. Only 14 of 155 routes are rate limited. | Contract probe | U-3, before Part 3 slice C |
| **A-20** ✓ | **Image addresses are not validated,** and hostile ones are served to other people. | Contract probe | U-6. Native loads approved hosts only |
| **A-21** | **No scheduler for three server jobs exists in the repository.** | No `vercel.json` or workflows | U-5, owner checks |
| **A-22** ✓ | **A solo session can run during a party, and party time appears not to reach `StudySession`, totals or ledgers.** | `contract-probe-overlap.json`, `leave_focus_session` | U-7, decision E-13, Part 3 slice D |
| **A-23** | **Today can't tick a quest.** Only Workspace's Planner can, so Today must gain it before that tool leaves. | `TodayDestination.tsx` | Part 2 slice A |
| **A-24** ✓ | **`PATCH quests/[id]` ignores `targetMinutes`,** while the title changed. Editable fields are narrower than creation's. | Contract probe | Part 2 slice C designs to it, and web's editor is checked |
| **A-25** | **Password reset no longer needs new infrastructure.** `lib/email.ts` already sends verification and security codes, and `SMTP_*` names exist in `.env`. G-4 is a small route, not a blocker. It must follow the fix for S-12. | `lib/email.ts`, `user/security/send-code` | Decision E-3, Part 2 slice E |
| **A-26** | **Most shared logic is portable.** Of 32 modules walked, 30 reach no server or browser API. The calendar's `recurrence`, `dates`, `scheduling` and `quick-add`, the achievements, archive and cosmetics catalogs, and `session-math` can all be shared. Only Planner's and Sylvie's clients are bound to web transport. | `portability.json` | Reuse them. No copies |
| **A-27** | **Subjects need a `code`, and onboarding silently defaults to CAIE, A-Level,** creating 48 nodes per subject. | `app/api/subjects/route.ts`, contract probe | Part 2 slice A |
| **A-28** | **A group whose creator leaves can no longer be managed.** Only `createdBy` may rename or add. | `app/api/conversations/[id]/route.ts` | Part 3 slice C, small repair |
| **A-29** | **Maths rendering.** Web's Markdown uses KaTeX, and Native has no equivalent. | `app/components/MarkdownRenderer.tsx` | Part 3 slice B, decided there |

## 3. Study and Focus

| Web feature | Owner | Native today | Status | Disposition |
| --- | --- | --- | --- | --- |
| Countdown and stopwatch | `lib/timer-engine.ts`, `SessionService` | `createStudySessionModel`, lengths 15 to 90 and No limit | **Implemented** | Keep |
| Delivery, replay, settlement | `TimerSync`, `SessionProtocolV2` | `createSessionBridge` | **Implemented** | Keep. Never a second journal |
| Seven modes: Free Flow, Pomodoro, 52/17, Animedoro, Deep Work, Sprint, Flowtime | `FocusScreen`, `ModesSettingsScreen`, `study_mode_config` | Lengths only | **Missing** | Must, Part 2 B |
| Breaks, phases, auto-start, end chime | `transitionSnapshot`, `breakMs` | `breakMs` stays 0 (ADR 0008 decision 20) | **Missing** | Must, Part 2 B |
| Immersive Focus: full window, wake lock, eye comfort | `FocusScreen`, `ImmersiveModeContext`, `useScreenWakeLock`, `useFocusEyeComfort` | Home's Focus page | **Missing** | Must, Part 2 B. A shell layer, not a fourth Space |
| Focus backgrounds | `FocusBackground`, `focus-backgrounds/*`, `lib/focus-background-preference.ts` | Removed from a signed-in Focus | **Missing** | Must, Part 2 B, extending the same preference flow |
| Timer layouts: Classic, Anime, Fantasy, Landscape | `app/focus/components/layouts/` | None | **Missing** | Should, redesigned. Do not copy |
| Ambient audio | `AcousticTrack`, `lib/acoustics/`, `AcousticsContext` | Catalog, playback disabled | **Partial** | Must, Part 2 B. Native engine |
| Custom audio | `CustomAudioContext`, Locker tab | None | **Missing** | Later |
| Subject and quest on a session | `subjects`, `quests` | Picker, `plan` | **Implemented** | Keep |
| Adopting a session from another device | `SessionProtocolV2.restore` | A note in Focus | **Partial** | Should, Part 2 B |
| Countdown-end alert in the background | Web notice | None (R9) | **Missing** | Must, Part 2 B, local notification |
| Focus tools: AI, audio, calculator, formulas, scratchpad | `app/focus/components/tools/` | Sylvie, Audio and Calculator are Workspace tools | **Partial** | Quick-ask in the environment. The rest stay Workspace's. Scratchpad belongs to Phase 14 |
| Daily labels, targets | `dailyGoalMinutes`, stats | Not shown | **Missing** | Should, Part 2 D |

## 4. Plan: calendar, quests, objectives, schedule

| Web feature | Owner | Native today | Status | Disposition |
| --- | --- | --- | --- | --- |
| Today's quests, Study this | `quests` | Today and Workspace Planner | **Implemented** | Keep in Today. Workspace's copy goes |
| Ticking a quest | `quests/[id]` | Workspace Planner only (A-23) | **Partial** | Must, Part 2 slice A, in Today |
| Create, edit, delete a quest ✓ | `POST /api/quests`, `quests/[id]`, mutation guards. Creating may use AI quota for scope | None | **Missing** | Must, Part 2 C |
| Quest scope and difficulty | `quests/evaluate-scope`, `lib/difficulty-engine.ts` | None | **Missing** | Should, Part 2 C |
| Weekly missions | `quests/weekly` | None | **Missing** | Should, Part 2 C |
| Deadlines and HP | `quests/check-deadlines`, `lib/hp-penalty-service.ts` | None | **Missing** | Must, with A-2 |
| Goals: list | `goals` | Workspace Planner | **Implemented** | Moves to Plan |
| Goals: create, edit, adjust, delete ✓ | `goals`, `goals/[id]`, `goals/[id]/adjust` | None | **Missing** | Must, Part 2 C |
| Subjects: create, edit, archive, restore ✓ | `subjects`, `lib/subject-service.ts` | Read only | **Missing** | Must, Part 2 A for creating, C for the rest |
| Study schedule, rest days, floating rest days ✓ | `user/study-schedule`, `floating-rest-day?dateKey=`, `lib/study-schedule-service.ts` | None | **Missing** | Must, Part 2 A for the basics, C in full |
| Calendar month | `calendar/personal`, `calendar/month` | Workspace Calendar: month, one-day add | **Partial** | Moves to Plan |
| Week, day and agenda views | `CalendarWorkspace`, `CalendarTimeline` | None | **Missing** | Must, Part 2 C |
| Event edit, delete, categories ✓ | `calendar/personal`. `revision` is required, and a stale one answers 409 | Add only | **Partial** | Must, Part 2 C |
| Repeating events, exceptions | `CalendarEventException` | Read through expansion | **Partial** | Should, Part 2 C |
| Time blocks | A `CalendarEvent` category | None | **Missing** | Should, Part 2 C |
| Reminders | `calendar/reminders`, `CalendarReminderAgent` | None | **Missing** | Should, Part 2 C, local notifications |
| Calendar preferences | `calendar/preferences` | None | **Missing** | Should, Part 2 C |
| Daily notebook, annotations | `CalendarNote`, `calendar/notebooks` | None | **Missing** | Later. Depends on Phase 14's ink |
| Shared calendars | `calendar/shared` | None | **Missing** | Later unless Part 1 argues otherwise |
| External calendars | `calendar/connections`, G-13 refuses native | `personal` runs a sync after reading, and external events can be read by id. How they merge into a range read needs one check with a real connection | **Partial** | Stays web to connect. Part 2 C shows what `personal` returns |
| Handwriting recognition | `CalendarNoteRecognition`, a web worker | None | **Missing** | Later |

## 5. AI Planner

| Step | Owner | Native today | Status | Disposition |
| --- | --- | --- | --- | --- |
| Applied plans appear as quests | `PlannerQuestLink` | Yes | **Implemented** | Keep |
| Readiness and plan list ✓ | `GET planner/workspace`, bearer works, with `readiness` | `capabilities` only | **Partial** | Must, Part 2 C reads it |
| Create a plan: goal, deadline, topics, availability | `POST planner/workspace` `CREATE` | None | **Missing** | Must, Part 3 A |
| Conversation, notes, assistant advice | `NOTE`, `planner/[id]/assistant` | None | **Missing** | Must, Part 3 A |
| Materials: PDF and text upload | `planner/[id]/documents`, multipart with `key`, `title`, `file`. PDF or plain text, 3 MiB. The handler is fine for a native body, and Electron's proxy forwards bytes | None | **Missing** | Must, Part 3 A |
| Authorize, resource ceiling | `GENERATE` | None | **Missing** | Must, Part 3 A |
| Six stages: Research, Strategy, Translation, Schedule, Review, Ready | `activity.ts`, SSE, polling | None | **Missing** | Must, Part 3 A |
| Clarification and continuation | `CONTINUE` | None | **Missing** | Must, Part 3 A |
| Strategy, research notes, review findings, history | `GET planner/workspace?planId&attemptId` | None | **Missing** | Must, Part 3 A |
| Review changes, acknowledge, confirm | `planner/[id]/commit`, `ApplyService` | None | **Missing** | Must, Part 3 A. Never bypassed |
| Replanning after Apply | **Not for V2 plans.** `rebalance`, `reoffer`, `stretch`, commit-style operations call `assertVersion`, which answers 409 `PLANNER_V2_PATH_REQUIRED`. The student workspace uses none of them | None | **Missing** | **Stays web** for classic plans. A new V2 request is how a student replans today |
| Classic Planner, Planner Modes, Quick Plan, Copilot | `AiPlannerPanel`, `ExamPlanner`, `MasteryPlanner`, `RoadmapPlanner`, `QuickPlan`, `PlannerCopilot` | None | **Missing** | **Stays web.** Their quests still appear |

## 6. Progress, Codex and personalization

| Web feature | Owner | Native today | Status | Disposition |
| --- | --- | --- | --- | --- |
| Level, rank, XP, streak | `user/stats`, `lib/game-engine.ts` | Progress | **Implemented** | Keep |
| Week chart, subject shares | `detailed-stats?summary=true` | Progress | **Implemented** | Extend |
| 30-day rhythm, objectives, recent sessions | `StatsSettingsScreen` | Partly in Focus | **Partial** | Must, Part 2 D |
| Cognitive attributes and investing | `lib/cognitive-stats.ts`, `cognitive-stats/invest` | None | **Missing** | Should, Part 2 D |
| Rankings: global, friends, four orderings ✓ | `user/rankings`, `cache-service` | None | **Missing** | Must, Part 2 D |
| Achievements: claim | `achievements` | Progress, with a double-tap flaw | **Partial** | Must, full catalog and categories |
| Attributes-first skills | `lib/skill-tree.ts`, `skills` (6 KB) | None | **Missing** | Should, Part 2 D |
| Subject constellations, compile, forge-apex | `subjects/[id]/nodes`, `compile` (paid AI, quota), `forge-apex`, Locker | None | **Missing** | **Later.** Heavy, a canvas, and a paid call. Part 1 moved it |
| AI insights | `insights`, `AiInsight` | None | **Missing** | Should, with Sylvie |
| Codex | `lib/archive-catalog.ts`, `ArchiveSettingsScreen` | None | **Missing** | Must, Part 2 D. A pure catalog, also read by Sylvie |
| Level-up moment | `LevelUpProvider` | None | **Missing** | Should, quiet, Part 2 D |
| Currency | `currency/stats`, ledgers | Sylph in the lobby | **Partial** | Show in Progress |
| Onboarding | `app/onboarding/`, `user/onboarding` | None | **Missing** | Must, Part 2 A |
| Account: name, email, username | `user/account` | Name only | **Partial** | Must, Part 2 E. S-12 |
| Password, security codes | `user/security`, `user/security/send-code` | None | **Missing** | Must, Part 2 E |
| Devices | `user/sessions`, `auth/logout-all` | None | **Missing** | Must, Part 2 E |
| Connected accounts | `user/connections` | None | **Missing** | Should, Part 2 E. Linking is an OAuth flow, and `link` is a 501 stub |
| Two-factor | `user/security` `2fa` | None | **No owner**, a 501 stub | Do not surface |
| Delete account, reset progress | `user/account/delete`, `user/reset-progress` | None | **Missing** | Must, Part 2 E (A-17) |
| Password reset | No route, though email delivery exists (A-25) | Stated plainly | **Missing** | Should, Part 2 E, after S-12. Decision E-3 |
| Privacy | `user/privacy`, `lib/privacy.ts` | Respected when reading friends | **Partial** | Must, Part 2 E |
| Notification preferences | `notifications/preferences` | None | **Missing** | Should, Part 2 E |
| Notification list | `notifications` | None | **Missing** | Should, Part 3 C |
| Appearance | `app/settings/appearance`, `POST /api/cosmetics` | Six themes, device only, Studio behind `DEV_TOOLS` | **Partial** | Must, Part 2 E (A-13) |
| Profile customization: bio, banner, avatar, frame, title, aura, name color, links | `profile/customization`, `inventory/equip`, `characterConfig`, `PixelCreation` | None | **Missing** | Must, Part 2 E. Choosing from what is owned |
| Locker, Shop, Inventory | `shop`, `inventory`, `cosmetics` | World's Collection panel | **Partial** | Phase 15, by H1 |

## 7. Social

| Web feature | Owner | Native today | Status | Disposition |
| --- | --- | --- | --- | --- |
| Friends list, presence, hidden fields | `friends`, `visible` | Circle | **Implemented**, apart from A-1 | Keep |
| Friend requests: answer | `friends/requests/[id]` | Circle | **Implemented** | Keep |
| Find people, send a request | `users/search`, `friends/requests` | None | **Missing** | Must, Part 3 C |
| Remove, block, unblock | `friends/remove`, `friends/block`, `friends/unblock`, `lib/block-service.ts` | None | **Missing** | Must, Part 3 C |
| Public profile | `profile/[username]`, `user/[username]`, `profile/stats`, `PublicProfileModal` | None | **Missing** | Must, Part 3 C |
| Direct messages ✓ | `conversations`, `Message`. `before=` pages history. Text only: no attachments in the schema | None | **Missing** | Must, Part 3 C |
| Group chats, members, avatar ✓ | `conversations/[id]` `PATCH` with `name`, `avatarUrl`, `addMemberIds`, `removeMemberIds` | None | **Missing** | Must, Part 3 C |
| Edit and delete a message | `conversations/[id]/messages/[messageId]` | None | **Missing** | Must, Part 3 C |
| Unread counts | `lastReadAt`, `GET conversations` | None | **Missing** | Must, Part 3 C |
| Realtime and presence | `realtime/token`, `usePostgresChanges`, `useRealtimePresence` | None | **Missing** | Must, Part 3 C, with a bounded fallback |
| Focus Party: list | `focus-party` | Circle | **Partial** | Extends |
| Create, join, leave, invite, members ✓ | `focus-party/*`. Invites answer `ACCEPTED` or `DECLINED`. Non-members refused, joining needs an invite | None | **Missing** | Must, Part 3 D |
| Party session and room ✓ | `focus-party/[id]/session`, `session/timer` with `start`, `pause`, `resume`, `leave` | None | **Missing** | Must, Part 3 D, after decision E-13 |
| Session invites | `invites`, `SessionInvite`, `SessionInviteToast` | None | **Missing** | Should, Part 3 D |

## 8. Sylvie

| Web feature | Owner | Native today | Status | Disposition |
| --- | --- | --- | --- | --- |
| Threads, plain streamed turn | `chats`, `system-messages/chat` | Workspace tool | **Implemented**, whole reply on React Native (T-6) | Keep, with a progress state |
| Rich text | `ChatText`, Markdown | Plain text | **Partial** | Must, Part 3 B |
| Confirming a proposed change | `pendingAction` on a message or reply, sent back as `confirmationToken` on the next turn. Single use, refused if a newer turn exists | Web only | **Missing** | Must, Part 3 B |
| Images | `ai-chat-attachments`, `image-contract.ts` | None | **Missing** | Should, Part 3 B |
| Dictation | Browser speech | None | **Missing** | Later, native speech |
| Quick-ask overlay (H3) | Same runtime | None | **Missing** | Must, Part 3 B |
| Daily briefing | `system-messages?type=DAILY_BRIEFING&global=true&limit=1&unreadOnly=true`. Needs the cron in U-5 | None | **Missing** | Should, Part 3 B, on Today |
| Planner handoff | `planner-bridge.ts`, `planner-handoff-client.ts` | None | **Missing** | Must, Part 3 B, after Part 3 A |
| Companion presence | `PixelCompanion`, `lib/pixel-display/`, `sylvs/` | None | **Missing** | Should, Part 3 B, once Part 1 picks a renderer (A-15) |
| Memories | `AiMemory` | None | **Missing** | Should, with confirmation |

## 9. Excluded

`admin`, `dashboard-design`, `dashboard-variants`, `companion-prototype`, `sylv-preview`, `studio`, `dev`, `waitlist`, `ai-costs`, `ai-usage` and `cron` are operators' or developers' tools, or server jobs. The landing page is web's.

## 10. Backend defects carried into the stage

| ID | Priority | Issue | Where it goes |
| --- | --- | --- | --- |
| A-1, A-2 | High | Presence and HP for a Native-only student | Part 2 A |
| A-18 | **High** | Cosmetic ownership ([U-2](../reports/expansion-part-1/urgent-issues.md)) | Part 2 step 0 on approval |
| S-17, A-19 | **High, raised by Part 1** | Messages have no length or rate limit (U-3) | Part 2 step 0 on approval |
| S-12 | **High, raised by Part 1** | Email change needs no password (U-4) | Part 2 step 0, decision E-5 |
| A-20 | Medium | Stored image addresses (U-6) | Part 2 step 0 on approval |
| A-21 | High if unscheduled | Server jobs (U-5) | Owner |
| A-22 | Medium | Solo beside party, party credit (U-7) | Decision E-13, Part 3 D |
| A-28 | Low | A group with no creator | Part 3 C |
| A-24 | Low | Quest edit narrower than creation | Part 2 C |
| S-15 | Low | `areUsersBlocked` fails open on a query error. Confirmed still so | Part 3 C |
| P-3 | Low | `chats`, `conversations/[id]/messages?after=` limits | Bounded, rechecked by Part 1 |
| P-10 | Medium | `check-deadlines` loads every open quest with its full user (U-8) | With U-5 |
| P-11 | Low | `currency/stats` reads a student's whole Sylph and HP ledgers with no limit | Part 2 D uses `user/stats` instead, or a small read |
| P-5 | Low | Open-session lookup. An index migration is written | Part 4 |
| P-7 | Medium | The leaderboard's one cached value refuses over 2 MB | Part 2 D checks it, Part 4 measures it |
| P-8 | Medium | Web's 15 s and 30 s polling must not be copied | Part 3 C |
| I-2 | Medium | Study time is a client claim, with no daily ceiling | Decision E-10 |
| T-3 | Low | Calendar's add form sits below the visible area | Part 2 C replaces that surface |
| T-6 | Medium | A long reply has no progress indicator | Part 3 B |
| T-7 | Low | A revoked device learns late | Part 4 |
| — | Low | A quick second tap on Claim lands on the next item | Part 2 D |
| — | Low | Today's scroll jank is twice other pages | Part 2 A measures, Part 4 closes |
| — | Low | Layout switching adds about 0.6 MB per cycle | Part 4 |

Owner operations in the [deployment checklist](../backend/deployment-checklist.md), including D-2, D-3 and the unapplied migrations, stay the owner's.
