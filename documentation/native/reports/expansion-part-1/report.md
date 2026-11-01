# Sylf Native — Expansion Part 1 report: Web-to-Native audit and design blueprint

**1 November 2026. Complete, awaiting the owner's review. Stop here.** Part 2 starts from the [handoff](../../handoffs/expansion-part-1.md).

**Read this first.**

- **No application code, schema or hosted service changed.** Nothing was committed, stashed or deleted. Only documentation changed, in `documentation/` and `native/README.md`.
- **A [recovery baseline](recovery-baseline.md) exists,** outside the repository, and a full restore was rehearsed: 4,938 of 4,938 files matched.
- **Four production defects were proved that no earlier report had right:** cosmetics aren't checked, messages have no limits, email change needs no password, and stored image addresses aren't validated. They are in [urgent issues](urgent-issues.md), apart from the plan.
- **The audit removed work as well as adding it.** Five planned repairs or blockers turned out to be unnecessary.
- **Every approved direction held up.** Plan, the Focus environment and moving Calendar and Planner to Home all fit the backend.
- **Not done: anything on a device.** No tablet run was authorized, so the device spikes moved to Part 2 step 0. Each has a fallback.

## 1. What was asked, and what happened

| Asked | Result |
| --- | --- |
| Recovery baseline, without committing, stashing or deleting | Done, rehearsed |
| Audit features, backend, architecture, performance, security, UX | Done, by source and a local server. Below |
| Verify previously identified issues | [§4](#4-earlier-findings-rechecked) |
| Comprehensive feature map | [Feature map](../../expansion/feature-map.md), corrected in place, with 29 findings |
| Premium redesign blueprint | [Blueprint](../../expansion/blueprint.md) |
| Prioritized roadmap for Parts 2 to 4 | [Stage plan](../../expansion/README.md#7-parts-and-order) and the three briefs, updated |
| Urgent issues, documented separately | [Urgent issues](urgent-issues.md) |
| Part 2 handoff | [Handoff](../../handoffs/expansion-part-1.md) |

**Owner decisions recorded.** Home navigation with Plan, the immersive Focus environment, and relocating Calendar and Planner to Home after parity are approved. ADRs 0014 and 0015 and the master plan say so.

**The entry gate.** Part 1 started with gate items open, on the owner's instruction, and the baseline stood in for the commit. The other items moved to Part 2 step 0, so nothing was dropped.

## 2. Method

| Layer | What was done |
| --- | --- |
| All 155 routes | Static inventory of methods, auth, validation, rate limiting, origin checks, cookies, multipart, streams, writes in `GET`, unbounded reads: [`route-inventory.json`](evidence/route-inventory.json) |
| Contract probes | About 175 requests as a bearer client with no cookie, against a production build on a disposable PostgreSQL, with hosted variables blanked and four fixture students: [`contract-probe.json`](evidence/contract-probe.json), [`-2`](evidence/contract-probe-2.json), [`-3`](evidence/contract-probe-3.json), [`overlap`](evidence/contract-probe-overlap.json). Access tokens were stripped from these files |
| Portability | Import walks of 32 shared modules: [`portability.json`](evidence/portability.json) |
| Workflows | Web source traced for onboarding, quest rules, goals, Planner's eight steps, chat, blocks, parties, confirmations |
| UX | The Phase 13 journey captures read by eye, with Native's Home source |

Empty-database timings measure almost nothing, so **this report quotes none as performance.** The scripts stayed in the session's scratchpad, and their requests are in the evidence.

## 3. Questions closed

| # | Question | Answer |
| --- | --- | --- |
| Q1 | Is chat paging a gap? | **No.** `GET conversations/[id]?before=` pages back 50 at a time with `hasMore`, and marks the conversation read |
| Q2 | How does a client change timezone? | `PATCH user/account` with `timezone`, validated |
| Q3 | Does `calendar/personal` return connected events? | Partly proved. The route starts a sync after reading, and external events read by id. **Merging into a range read needs a real connection** |
| Q4 | Can `calendar/month` be avoided? | It needn't be. It is the only source of per-day study data, and its reconciliation is idempotent with a cursor |
| Q5 | What does V2 need? | Bearer works, with `x-sylf-planner-contract: 2`. `rebalance`, `reoffer` and `stretch` refuse V2 with 409. `friction` and `check-result` don't refuse, but the student workspace uses neither |
| Q6 | Does the document route accept a native body? | By source, yes: `key`, `title`, `file`, PDF or text, 3 MiB. Electron's proxy forwards bytes. With flags off it answers 503, so the success path was not run |
| Q7 | How does a confirmation travel? | `pendingAction` on a reply or history message, sent back as `confirmationToken`. Single use, refused after a newer turn |
| Q8 | Where is the focus background preference? | On the account, versioned, through `focus-backgrounds/preference`. Custom images use 1-hour signed URLs, with a rate-limited refresh route |
| Q9 | Is there one good account read? | Yes. `user/stats` already has every field, including `hasPassword`, `hp`, `timezone` and active cosmetics. `userStatsSchema` only needs widening |
| Q10 | What does `check-deadlines` do? | A cron job that fails overdue quests and applies HP. **Nothing in the repository schedules it** (U-5) |
| Q11 | What else leaves a Native student behind? | Heartbeat and `calendar/month` are the only lazy reconciliations. Web's other client jobs are the journal, reminders and invites, each already planned |
| Q12 | What gives a day's order? | Only `createdAt`. Quests have no time or position, which confirms G-3 |

## 4. Earlier findings rechecked

| Finding | Now |
| --- | --- |
| A-1, heartbeat | **Proved.** `isOnline` false, then true after one |
| A-2, HP | **Confirmed by source,** and `enableHpPenalty` defaults to true (R23) |
| A-3, A-4, onboarding, writing | **Confirmed.** All routes work with a bearer token |
| A-6, `calendar/month` | **Downgraded.** No repair |
| A-8, Planner off | **Proved.** 503 `WORKER_UNAVAILABLE` with readable detail |
| A-9, streaming | **Better than feared.** `expo/fetch` is in SDK 58. Not run on Hermes |
| A-11, Realtime | **Harder than feared on Electron.** [ADR 0016](../../decisions/0016-realtime-streaming-and-remote-media.md) |
| A-12, chat paging | **Retracted** |
| G-4, password reset | **Overstated.** Email delivery exists |
| S-12, email change | **Proved, and raised** to High |
| S-15, block check | Confirmed still failing open on a query error |
| S-17, message limits | **Proved, and raised** to High |
| P-3, list limits | Bounded, confirmed |
| Revocation (S-2) | **Holds.** After `logout-all`, bearer and refresh are both refused. An early probe looked otherwise, because that route needs the password |
| Bearer with `Sec-Fetch-Site` | Refused, as ADR 0009 says |
| Ownership | **Holds on everything probed:** quests, goals, subjects, nodes, conversations, messages, events, parties all refused another student |
| Blocks | Hold: a blocked person can't message |
| `requireOrigin` (G-13) | Still only Notes and Calendar's OAuth connect. `calendar/*` writes refuse only `cross-site`, which a native client doesn't send |
| Not rechecked here | T-7, P-5, R15, layout memory, and every device item |

**Corrections to my own plan.** The earlier feature map and briefs said Today had a tick (it doesn't), that party rewards settle through RPCs (they appear not to), that replanning might apply to V2 (it doesn't), and proposed repairing `calendar/month` and chat paging (neither needs it). All are fixed in place.

## 5. Architecture

| Finding | Recommendation |
| --- | --- |
| **The design is sound.** One session owner, one journal, typed reads and resources need extending, not replacing | Keep |
| 30 of 32 shared modules are portable. The calendar's pure modules, catalogs and engines need no extraction | Add to `@sylf/shared`, heavy ones behind `import()` |
| Only three things are trapped: mode rules in `FocusScreen`, Planner's transport, and chat's transport | One extraction, two sets of named reads |
| `reads.ts` will outgrow one file | Split by domain inside the package when slice C starts |
| `mapPlanner` and `mapCalendar` belong to Home already | Move in slice C |
| Realtime against `SpacesShell` keyed by account | The connection lives beside `backend`, not in a Space, so a change of account closes it once |
| Home keeps destinations mounted | Sub-views as separate chunks, mounted on first use |
| `POST /api/cosmetics` writes appearance and purchasable items through one route | Native stays off it for appearance |

## 6. Performance, security and UX

**Performance.** Nothing here justifies a change yet. On Phase 11's seed, `detailed-stats?summary=true` remains the right read, and `user/rankings` is fine. New static flags: 27 routes have an unbounded `findMany`, most of them small by nature. Two matter: P-10 (`check-deadlines`) and P-11 (`currency/stats`, avoided). A range read of `calendar/personal` starts a sync, so Plan must not read it repeatedly. Part 4 measures on the seed.

**Security.** The core held everywhere it was pushed. The gaps are at the edges: [U-2 to U-8](urgent-issues.md). Rate limiting reaches 14 of 155 routes, and 53 routes write with none. RLS was not rerun, because no migration or policy changed, and the last pass is in the [verification report](../stage-3-verification/report.md). `Message` needs its Realtime policy to be a migration rather than a manual script. Hosted state stays unknown.

**UX.** The [blueprint](../../expansion/blueprint.md#1-what-the-current-screens-taught) has the full critique. The app is calm and honest, but pages share one template, Today offers no way to do the main thing a student has (a quest), and Progress doesn't answer "am I studying enough?". The direction is **one line through Sylf**, extending Today's best idea through planning, Focus, parties and progress.

## 7. Dependencies

Versions are from SDK 58's `bundledNativeModules.json`. **None is installed, and none has been measured.** Each needs the owner's approval (E-11), and stays only if its spike passes.

| Package | Version | For | Part |
| --- | --- | --- | --- |
| `expo-keep-awake` | ~58.0.3 | The Focus environment | 2 B |
| `expo-audio` | ~58.0.10 | Ambient sound | 2 B |
| `expo-notifications` | ~58.1.7 | Local alerts only | 2 B, C |
| `expo-image` | ~58.0.18 | `RemoteImage`, backgrounds | 2 B |
| `expo-document-picker` | ~58.0.4 | Planner materials | 3 A |
| `expo-image-picker` | ~58.0.10 | Sylvie's images, avatars | 3 B |
| `@supabase/realtime-js` | 2.112.4 | Realtime | 3 C |

**Needs nothing new.** Streaming (`expo/fetch`), charts and calendars (plain views), sprites (prerendered images), Markdown (a small renderer), maths (an Expo DOM component, as Notes will use). **Rejected for now:** Skia (`2.14.0` is available, but nothing here needs it), and `supabase-js` in full.

## 8. Spikes

| Spike | Result |
| --- | --- |
| Realtime | **Not run:** needs a device and a Realtime server. Desk result in ADR 0016 |
| Streaming | **Not run on Hermes.** Module confirmed present |
| Audio, notification, keep-awake, background | **Not run:** need the tablet |
| Avatar and companion | **Desk result:** prerendered images, because Pixel Display's content is pure and adding Skia isn't justified |

Part 1's brief asked that no unproven dependency enter Part 2 without a fallback. Each has one, listed in [Part 2 step 0](../../expansion/part-2-study-progression-personalization.md#step-0--preconditions-and-repairs). **The criterion that every spike has a result is not met,** and the owner should know that.

## 9. Roadmap

| Order | Work | Why now |
| --- | --- | --- |
| 1 | Commit, then urgent repairs | Production has them today |
| 2 | Foundations | Presence, HP, tick, navigation, onboarding: everything else stands on these |
| 3 | **Plan** | The owner's central decision, the most daily value, and no unproven dependency |
| 4 | Focus and modes | The signature experience. Needs spikes |
| 5 | Progress and Codex | Answers "am I doing enough?" |
| 6 | Account and profile | Includes the store's deletion requirement |
| 7 | AI Planner V2 | Depends on Plan |
| 8 | Sylvie | Hands off to Planner |
| 9 | Social and Realtime | Depends on Part 2's account and repairs |
| 10 | Parties | Depends on Focus, Realtime and E-13 |
| 11 | Integration and polish | Then Phase 14 |

**Moved to Later:** subject constellations, `compile`, `forge-apex`, shared calendars, the notebook, custom audio, dictation. **Stays web:** Classic Planner, Planner Modes, Quick Plan, Copilot, connecting external calendars, uploading backgrounds for now.

## 10. Risks now

Highest first: R21 (uncommitted tree), the urgent repairs touching live routes, R17 (Home's memory, unmeasured), R18 (Realtime on Hermes), R19 (Planner V2 unqualified, and off by default), R23 (HP turning on).

## 11. Process notes

- **The server build rewrote `.next`,** which is ignored output. `git status` still matches the baseline, apart from this part's documents.
- **The harness's container outlived the stop,** so I stopped it by hand. It was disposable and mine. `sylf-planner-phase1-*` is not mine, and it is still running.
- **Registration is rate limited.** The third probe hit a 429, which is correct behavior, so it reused accounts. Note for Part 2's two-student harness.
- **Fixture data** in the evidence is synthetic, including `example.test` addresses and hostile strings.
- **The restore rehearsal** left a 1.7 GB copy in this session's scratchpad, which goes with the session.

## 12. Files

**New.** `expansion/blueprint.md`, ADR 0016, this report with `urgent-issues.md`, `recovery-baseline.md` and `evidence/`, `handoffs/expansion-part-1.md`.

**Updated.** `expansion/README.md`, the feature map, all four part briefs, ADRs 0013 to 0015, master plan, native and handoff indexes, Home and Workspace guides.

**Outside the repository.** `~/Desktop/sylf-recovery/2026-11-01-expansion-part-1/`.
