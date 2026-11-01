# Sylf Native — Feature Expansion and Experience Redesign stage

**Planned 1 November 2026. Part 1 is complete and awaiting the owner's review. No application code has changed.** This is the plan for the stage between Phase 13 and Phase 14, corrected by what Part 1 proved. **No part begins without the owner's authorization.** Source, tests, schema and configuration remain authoritative. Statements are labelled Confirmed (the owner's brief), Proposed (open to change) or Open.

| Read | For |
| --- | --- |
| This page | The whole stage: structure, order, rules and gates |
| [Feature map](feature-map.md) | What exists, on Web and Native, with evidence |
| [Blueprint](blueprint.md) | The redesign: every surface, its structure, states and motion |
| [Part 1 report](../reports/expansion-part-1/report.md), [urgent issues](../reports/expansion-part-1/urgent-issues.md), [Part 2 handoff](../handoffs/expansion-part-1.md) | What the audit proved, and where to start next |
| [Part 1: audit and design blueprint](part-1-audit-and-blueprint.md) | The first brief, now complete |
| [Part 2: study, progression and personalization](part-2-study-progression-personalization.md) | The second brief |
| [Part 3: social systems, Sylvie and AI Planner](part-3-social-sylvie-planner.md) | The third brief |
| [Part 4: integration, optimization and polish](part-4-integration-polish.md) | The fourth brief |
| [ADR 0013](../decisions/0013-expansion-stage.md), [0014](../decisions/0014-home-hub-and-workspace-scope.md), [0015](../decisions/0015-session-modes-focus-environment-and-parties.md), [0016](../decisions/0016-realtime-streaming-and-remote-media.md) | The decisions this plan rests on |

**A fresh session starts here.** Read this page, then the current part's brief, then the latest handoff in [`handoffs/`](../handoffs/README.md). Each brief lists what else to read. Follow the [repository instructions](../../../AGENTS.md).

## 1. Goal

**Confirmed.** Bring the useful Sylf Web features into Native, redesign their experiences completely in Aloft, improve what they do, and audit their backend integration as they arrive.

**What success looks like (Proposed).** A student can run their whole study life on a tablet. They start an account, shape their week, ask for a plan, study in a place that feels made for it, see themselves improve, and study beside friends, all without opening the web app. Notes and the game are the exceptions, because Phases 14 and 15 own them.

**Quality over quantity (Confirmed).** A feature earns its place by being useful to a student. The feature map marks each one Must, Should, Later or Stays web, and Part 1 may move anything but a Must.

## 2. Where it sits

| Stage | Phases | State |
| --- | --- | --- |
| 1 Vision and architecture | 1–3 | Done |
| 2 Frontend templates | 4–10 | Done |
| 3 Backend integration | 11–13 | Done on the Mac, portrait on the tablet. Awaiting the owner |
| **Expansion: Feature Expansion and Experience Redesign** | **Parts 1–4, unnumbered** | **Planned** |
| 4 Advanced features | 14 Notes, PDFs, Whiteboard, Resources. 15 World | Waits for the Expansion stage |
| 5 Testing and release | 16, 17 | Waits for Stage 4 |

Phases 14 to 17 keep their numbers and their scope (Confirmed). Stages keep their numbers too, so every existing reference stays true. [ADR 0013](../decisions/0013-expansion-stage.md) records why.

## 3. Entry gate

**Confirmed: stabilization and tablet verification are a prerequisite.** Part 1 starts when every item below is done, or the owner has accepted it in writing.

| # | Item | Who | Source |
| --- | --- | --- | --- |
| E0-1 | The owner reviews Stage 3. ADRs 0009 to 0012 are accepted or changed | Owner | [Stage 3 handoff](../handoffs/stage-3.md) |
| E0-2 | **A committed baseline.** Over 400 paths are changed or untracked at HEAD `f5a900b`, including all of `native/`, `documentation/native/` and eleven migrations. Nothing here is safe to build on until it is committed | Owner authorizes, then either | [Deployment checklist](../backend/deployment-checklist.md) §1 |
| E0-3 | The final local set passes on that commit | Agent | [Verification report](../reports/stage-3-verification/report.md) |
| E0-4 | By-hand tablet checks: landscape, split screen, pop-up, S Pen, timer dock numbers 1, 2 and 8 to 14, the owner's judgment of feel (numbers 15 to 35) | Owner, with explicit authorization | [Tablet checklist](../handoffs/tablet-checklist.md) |
| E0-5 | Backup restore, a locked-device read of secure storage, the dock panel, and five sign-in cycles with `dumpsys meminfo` | Owner, with explicit authorization | Tablet checklist |
| E0-6 | Spaces check's World step, which `uiautomator` cannot read, has a replacement | Agent | Verification report |
| E0-7 | `ink.test.ts` under full load is resolved or accepted | Agent | Verification report |
| E0-8 | The `.env.local` change and the 10:42 Antigravity run are explained | Owner | Verification report |

**Not gates for local work, and each is required before Part 4 can finish:** real OAuth, a hosted database check, and deployment. **Production still has the fixed defects until the owner deploys,** S-1 above all, and the deployment checklist should not wait for this stage.

**State at the start of Part 1.** The owner started Part 1 with these items open, and told me to make a recovery baseline without committing. So **E0-2 is met for Part 1 only:** a [rehearsed baseline](../reports/expansion-part-1/recovery-baseline.md) exists, and **the commit is still required before Part 2 changes application code.** E0-1 and E0-3 to E0-8 stay open, and Part 2 step 0 takes them.

**The tablet stays out of bounds** until the owner authorizes each run. Authorization does not carry between parts. Security prompts and device settings are never touched without approval.

## 4. What the audit found

Native reaches 26 of 155 routes. Every core loop works, and most of a student's control over their own life is still on the web. The [feature map](feature-map.md) has the evidence, and the [Part 1 report](../reports/expansion-part-1/report.md) has the method. The findings that shaped this plan:

- A Native-only student always reads as offline, and HP penalties never reconcile for them (A-1, A-2, proved).
- There is no onboarding, and a student cannot write subjects, quests, goals or their schedule (A-3, A-4). Today can't even tick a quest (A-23).
- Timer modes live inside a web component, so they need extracting before anything else can use them (A-5).
- AI Planner V2's client is not portable, and it is off by default (A-7, A-8). It works by polling, so streaming is an improvement, not a dependency.
- Native has no Realtime client, and Electron's security rules shape where it can live (A-11, [ADR 0016](../decisions/0016-realtime-streaming-and-remote-media.md)).
- **New, and urgent:** cosmetics aren't checked, chat has no limits, email change needs no password, and stored image addresses aren't validated ([urgent issues](../reports/expansion-part-1/urgent-issues.md)).

**Part 1 removed work too.** Chat history already pages backwards (A-12). `calendar/month` needs no repair (A-6). Password reset needs a route, not an email service (A-25). V2 plans don't use the classic replanning routes. 30 of 32 shared modules are portable, so far less needs extracting than feared (A-26).

## 5. Target structure

**Confirmed.** Calendar, AI Planner, quests and objectives belong in Home. Home is the central hub for planning, daily objectives, schedules and educational progress. Workspace is a dedicated multitasking study environment.

**Approved by the owner, 1 November 2026:** the Home navigation, including Plan as one new destination, and the immersive Focus environment. Everything else fits inside what exists. The [blueprint](blueprint.md) designs each surface.

```
Spaces switcher ─┬─ Home
                 │   ├─ Today     What now. Next action, today's quests, tick, Study this, briefing
                 │   ├─ Plan      What's ahead. Calendar, Quests and goals, Plans (AI Planner V2), schedule
                 │   ├─ Focus     The Threshold: what, rhythm, where, then enter
                 │   ├─ Circle    People, Messages, Parties
                 │   ├─ Progress  Overview, Stats, Standing, Honours, Skills, Codex
                 │   └─ Account   Rail foot. Profile, account, privacy, study, appearance, notifications
                 │
                 ├─ Workspace     Notes, PDFs, Whiteboard, Sylvie, Timer, Calculator, Audio, Resources
                 │                Planner and Calendar leave, once Plan has parity
                 │
                 └─ World         Unchanged until Phase 15

Above the Spaces:
   Timer dock          One session, everywhere but the game and the Focus environment
   Focus environment   A full-window layer entered from anywhere. Not a fourth Space
   Quick-ask           Sylvie's overlay, same runtime, Home first
```

| Surface | Answers | Must not become |
| --- | --- | --- |
| **Today** | What should I do right now? | A planner. It reads, ticks and starts |
| **Plan** | What is ahead, and how do I shape it? | A second Today. Its spine is the calendar |
| **Focus** | What am I about to study, and how did it go? | The session itself |
| **Focus environment** | Nothing. It holds the student in the work | A dashboard, or a place with tools |
| **Workspace** | What am I working on? | A place to organize the week |

**Why one destination.** Three rail entries for Calendar, Quests and Plans would be the unnecessary sections the owner ruled out, and the three are one activity. Folding them into Today would turn the first page into a long scroller, and Today already has the worst scroll on Home. [ADR 0014](../decisions/0014-home-hub-and-workspace-scope.md) records the options.

**Inside a destination.** A sub-view is a control on the page, using `Segmented` at wide widths and a compact equivalent. It is not a second rail. A long flow, such as a plan under review, is a pushed page inside the destination, with its own place in the snapshot. A compact window keeps the five-item bottom bar, and at 340 pt with the account control each item has about 59 pt.

## 6. Architecture rules

Everything in [Stage 3 handoff §1 and §7](../handoffs/stage-3.md#1-architecture) still holds. This stage adds to it.

| One authority | Owner | Change in this stage |
| --- | --- | --- |
| A running session | `createStudySessionModel` | Gains mode, phases and a party kind. **Still the only owner** ([ADR 0015](../decisions/0015-session-modes-focus-environment-and-parties.md)) |
| Delivery | `TimerSync`, `SessionProtocolV2` | Unchanged. Reaches its party branch |
| Mode rules | **New:** `lib/timer-modes.ts`, a pure extraction from `FocusScreen` | Web and Native both read it. No copy |
| Which Home page | `createHomeNavigation` | Gains `plan` and each destination's sub-view |
| Cached reads | `createResourceStore` | Gains a bounded, visible-only refresh for what Realtime cannot reach |
| Realtime | **New:** one connection in `@sylf/backend`, behind `import()` | Opens only for someone signed in, while a surface needs it |
| Presence | **New:** one heartbeat in the shell | Foreground only, web's cadence |
| Planning | The server: `lib/planner/server`, `lib/planner/v2/server`, `ApplyService` | Clients read and ask. They never decide |
| Rewards | The server | Unchanged |

**Rules.**

1. **Name the owner first.** A feature names its existing route, model or `lib/` owner before any screen exists. No owner means defer it and write it down.
2. **No screen calls `fetch`.** A read has a name in `reads.ts`, and a schema in `contracts.ts` parsed against the real server by the integration suite. As `reads.ts` grows it may split by domain inside the package, with no other change to the rule.
3. **No web component is copied.** Web is a reference for behavior only. Native's look comes from Aloft ([design guide](../design/README.md)), and "does it feel like a calm instrument someone made for studying?" is still the test.
4. **Shared logic moves, it is not duplicated.** If Native needs logic trapped in a web component, extract a pure module into `lib/`, keep web's behavior, keep its tests passing, and add it to `@sylf/shared`.
5. **Sample stays out.** A store build shows no sample. A new surface supplies live, empty and, in a development build, sample adapters, with the five states: loading, empty, ready, offline, failed.
6. **Home's memory rule holds.** A destination stays mounted after its first visit, so a heavy sub-view mounts on first use and releases what it can. Nothing loops in a settled Home.
7. **Polling is narrow.** Realtime first. A fallback may read only while the surface is seen, only at a bounded interval no faster than the Part 1 budget, and through the resource store. Nothing polls in the background, and a running session makes no requests of its own (ADR 0013 decision 7).
8. **Remote images load from approved hosts only,** through one component, whatever a stored address says (U-6). Model and user text is untrusted when rendered.
9. **Keyboard rules from the tablet stay.** `useKeyboardLift` on any surface with fields, `keyboardShouldPersistTaps="handled"` on any scroll view. Reduced motion, screen readers, large text and 44 pt targets are part of done.

## 7. Parts and order

| Part | Delivers | Depends on |
| --- | --- | --- |
| [**1. Audit and blueprint**](part-1-audit-and-blueprint.md) | Complete: a verified contract audit, Aloft designs for every surface, and this order | Entry gate |
| [**2. Study, progression and personalization**](part-2-study-progression-personalization.md) | Preconditions and repairs, Foundations, Plan, Focus and modes, Progress and Codex, Account and profile | Part 1's gate |
| [**3. Social, Sylvie and AI Planner**](part-3-social-sylvie-planner.md) | AI Planner V2 in Plan, Sylvie, Realtime and Circle, parties | Part 2's gate |
| [**4. Integration, optimization and polish**](part-4-integration-polish.md) | Full verification, security and database audits, performance, a cohesive finish | Parts 2 and 3 |

```
Entry gate ─► Part 1 ─► 2-0 ─► 2A ─► 2C ─► 2B ─► 2D ─► 2E ─► 3A ─► 3B ─► 3C ─► 3D ─► Part 4 ─► Phase 14
```

| Slice | Needs first |
| --- | --- |
| 2-0 Preconditions and repairs | Part 1's gate |
| 2A Foundations | 2-0 |
| 2C Plan, then 2B Focus and modes | 2A. Plan goes first because it is the owner's central decision and has no unproven dependency, while 2B needs device spikes |
| 2D Progress and Codex, 2E Account and profile | 2A |
| 3A AI Planner V2 | 2C |
| 3B Sylvie | 3A |
| 3C Social and Realtime | 2E, for profiles |
| 3D Parties | 2B and 3C |

Parts run in order. **One slice at a time, in the order shown, unless the owner asks otherwise.** The owner may reorder slices within what the table allows. Parallel slices are unlikely to work, because `home.ts`, `reads.ts` and `contracts.ts` are shared.

**The Planner seam (Confirmed: coordinated, not duplicated).**

| | Part 2 slice C | Part 3 slice A |
| --- | --- | --- |
| Owns | The Plan destination, Calendar, Quests and goals, the Plans view's shell, plan list and readiness | Everything between asking for a plan and confirming it |
| Reads | Applied work, `planner/workspace` list | `planId`, attempt, history, activity |
| Writes | Events, quests, goals, subjects, schedule | `CREATE`, `NOTE`, `GENERATE`, `CONTINUE`, documents, `commit` |
| Leaves ready | A slot that opens a plan, an honest state when V2 is off, one schedule component | Nothing new in Plan's navigation |

There is one `plan` module under `spaces/home/`, one set of reads, and no second planner surface. Sylvie reaches it through the existing handoff in Part 3 slice B.

**Workspace's Planner and Calendar leave in Part 2 slice C,** after the parity list there passes, in one change, so no window ever points at nothing.

## 8. Backend policy

**Confirmed.** Each implementation part fixes the backend defects it finds. Part 4 is not where repairs wait.

- **Fix in place** when a defect is inside the slice's own surface: reproduce it first on real PostgreSQL, fix it, and leave a regression test.
- **Log and hand on** when it is outside the slice: add it to the running defect list in that part's report.
- **Stop and ask** when a fix touches a ledger, an RPC, RLS, a migration that changes existing data, the web app's visible behavior, or a security decision.
- **Do not recreate** what exists. Additive read fields and small reads are fine, as in Phase 13. A new table needs a reason, a migration, `SCHEMA_BUILD_VERSION`, and the owner's approval.
- **Web keeps working.** Extraction and repairs run web's own tests, and mobile checks when a shared client changes.
- **Hosted services are never touched.** Disposable databases only, and hosted variables are blanked on every command ([harness](../handoffs/stage-3.md#6-harness)).

## 9. Quality gates

**Every slice.** Owner named. Reads typed and parsed against the real server. Five states present. Unit tests, and regression tests for every defect fixed. `npm run verify` in `native/`, root typecheck, ESLint on changed files. The journey still passes. Reviewed by eye in at least three themes, light and dark, one custom color set, and four window shapes. The current guide is updated.

**Every part.** The full local set from the [verification report](../reports/stage-3-verification/report.md), with no new failure. A student journey extended to cover the part. Electron checks. Mobile checks if a shared client changed. A build, for any server or routing change. A report in `reports/expansion-part-<n>/`, a handoff in `handoffs/expansion-part-<n>.md`, and an explicit stop for the owner. Tablet results where the owner authorized a run, and a clear list of what was not run.

**Budgets, finalized by Part 1 (Proposed).** Memory figures are provisional, because no tablet ran in Part 1. Part 2's device spikes confirm them.

| Measure | Today | Budget |
| --- | --- | --- |
| Opening Today | 4 requests | Stays at 4, or the change justifies more |
| Opening any other destination | Not measured for Plan | At most 5 requests, none duplicated |
| Requests from a running session | 0 in 6 s | 0. The shell's heartbeat is separate and at least 60 s apart |
| Main bundle | 2.50 MB | Under 2.8 MB. New surfaces are separate chunks |
| Backend chunk | 73 KB | Under 180 KB, with Realtime loaded only when needed |
| Android package | 34.1 MiB | Reported at each part. A rise over 5 MiB needs a reason |
| Native memory, first visit to a destination | Home destinations added nothing to the re-entry heap in Phase 6 | At most 8 MB of native heap per destination, and 12 MB for Plan, with no growth over 100 switches. Provisional |
| Native memory, Focus environment | New | Returns to within 5 MB of its entry level after leaving. Provisional |
| Polling fallback | New | At most once per 30 s, seen only. 60 s for presence |
| Heartbeat | Web: 60 s, or 5 min with Realtime | The same, foreground only |
| Home scroll jank | 2.2 to 5.3% | Every page under 3% on the tablet |
| Workspace drag | 0.7% | Unchanged |

## 10. Testing expectations

| Layer | Expected |
| --- | --- |
| Pure logic | Vitest beside the code. Mode transitions tested from one table against web's behavior |
| Contracts | Every schema parsed against a real handler on disposable PostgreSQL, on an empty account and a full one |
| Mutations | Through the client against a real server, including refusal, conflict and replay |
| Security | Ownership and blocked-user cases for every new route used. A second account in the harness |
| Real time | Two real clients. Connection loss, reconnection, and the bounded fallback |
| Journey | One student: onboarding, a week planned, a Pomodoro with breaks, progress moved. Then a second student for chat and a party |
| Platform | Electron for everything, and the tablet where authorized. Hermes is proof, and V8 is not |
| Accessibility | Screen-reader labels, focus order, reduced motion, large text. TalkBack by hand when authorized |
| Providers | Never called unless the owner authorizes a named spend |

## 11. Risks

| ID | Risk | Response |
| --- | --- | --- |
| R16 | **Scope.** This is about as much work as everything so far | Priorities are explicit, Part 1 can cut anything but a Must, and each part stops for review |
| R17 | **Home's memory.** Mounted destinations hold more than ever | Sub-views mount lazily and release. Budgets per destination, measured on the tablet |
| R18 | **Realtime on Hermes.** `supabase-js` has never run here, and WebSockets through Electron's boundary are unproven | A Part 1 spike, with the fallback as a real path rather than an afterthought |
| R19 | **AI Planner V2 is heavy and unqualified.** It is flag-gated, needs a worker, costs real money, and may run for hours | Honest states, no client-side decisions, no real provider without a named spend |
| R20 | **Extraction disturbs web.** `FocusScreen` is 1,642 lines and fragile | One narrow extraction, web's timer suites before and after, no behavior change |
| R21 | **An uncommitted, moving tree.** Antigravity changed 52 web files during Phase 13 | The baseline commit is an entry gate. Each part records the commit it ran on |
| R22 | **Background audio and notifications.** Store policies, foreground services and battery | Part 1 spike. Local notifications only, with no push service |
| R23 | **Heartbeat turns HP on.** A Native-only student starts losing HP the day it ships | HP is visible first, and the change is called out in the part's report |
| R24 | **`@sylf/shared` grows.** Catalogs and Planner types add to the bundle | Chunk budgets. Heavy catalogs load behind `import()` |

## 12. Decisions for the owner

Each has a default, so work can proceed if the owner agrees with it. The Part named needs the answer before that slice.

| ID | Question | Default | By |
| --- | --- | --- | --- |
| E-1 | Is Plan the fifth rail entry, and its name? | **Approved by the owner, 1 November 2026** | Done |
| E-2 | Does Audio stay a Workspace tool? The brief's list says "such as" | Yes, and it also plays in the Focus environment, as one engine | Part 2 step 0 |
| E-3 | Password reset (G-4). Email delivery already exists (A-25) | Build it in Part 2 E, after S-12 is fixed | Part 2 E |
| E-4 | Must first launch require an account (S2)? | No, keep Study without an account | Part 2 A |
| E-5 | Does an email change need a password (S-12)? | Yes, and tell the old address. Raised to urgent (U-4) | Part 2 step 0 |
| E-6 | Are Planner V2's flags and worker going to run on the hosted server, and may a real provider be used for testing, up to what spend? | Off until the owner says, and Native says so plainly | Part 3 A |
| E-7 | Is `@supabase/realtime-js` acceptable in Native? It is lighter than the full client, and web's version is 2.112.4 | Yes, if the spike passes | Part 2 step 0 |
| E-8 | HP on Native | Shown quietly in Progress, and the heartbeat ships with it | Part 2 A |
| E-9 | The word: Codex or Archive? | Codex, which is web's own title | Part 2 D |
| E-10 | A daily ceiling on credited study (I-2) | None, as today | Part 4 |
| E-11 | New dependencies, listed with versions in the [Part 1 report](../reports/expansion-part-1/report.md#7-dependencies) | Approve for the spike. Keep only what passes | Part 2 step 0 |
| E-12 | Does a Workspace student keep any view of the week? | No. The Timer's picker lists today's quests, because that starts a session. Everything else is one Space away | Part 2 C |
| E-13 | **Should party time count as study,** and through which owner? It appears not to today (U-7) | Yes, through `StudySession`, so one record holds all study | Before Part 3 D |
| E-14 | Approve the urgent server repairs (U-2, U-3, U-4, U-6) for Part 2 step 0? | Yes, each reproduced first, with web's tests | Before Part 2 |

## 13. Handoffs and documents

**Confirmed:** a fresh session starts after each part, so each part ends with a handoff a new agent can use with no chat history.

| When | Document |
| --- | --- |
| End of each part | `reports/expansion-part-<n>/report.md`, with evidence beside it, and `handoffs/expansion-part-<n>.md` |
| End of Part 4 | `handoffs/expansion.md`, the stage handoff, covering all four parts and the updated Phase 14 requirements |
| As behavior changes | The Home, Workspace, Spaces, World, backend and design guides, plus the timer, Sylvie, Calendar and Planner docs where web changed |
| New feature guides | `documentation/native/plan/`, `focus/`, `circle/`, `progress/`, `account/`, created by the slice that builds them |
| Decisions | Numbered ADRs from 0016. Blueprint decisions go in Part 1's |
| Always | The master plan's status log and the [native index](../README.md) |

Stage 4's handoff stays as scheduled, after Phase 15.

## 14. Stage completion

The stage is complete when all of these are true:

1. Every Must in the [feature map](feature-map.md) is built, or the owner has moved it. Every Should is built or has a written reason.
2. Calendar, AI Planner, quests and objectives live in Home, and nothing was lost when Workspace's Planner and Calendar left.
3. A student can onboard, plan, study, review, and study with friends on Native alone, on the tablet.
4. One session owner exists across Home, Focus, the Focus environment, Workspace, the dock and parties, proved by a test that looks for a second clock.
5. Part 4's security, database and performance audits pass, and each failure is fixed or accepted by the owner.
6. The full local set passes on a named commit, and the tablet run the owner authorized has passed.
7. The stage handoff restates Phase 14's requirements, and the owner has approved moving on.
