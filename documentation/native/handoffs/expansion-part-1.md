# Sylf Native — Expansion Part 1 handoff, for Part 2

**Written 1 November 2026, at the end of Part 1. Read this first in a fresh session.** It is self-contained with the documents it links. Source, tests, schema and configuration win over any prose. **Part 2 needs the owner's authorization.** Their brief takes precedence over this page.

## 1. State

| Fact | Value |
| --- | --- |
| Base | `f5a900b`, `main`, with 411 changed or untracked paths at the start of Part 1, plus this part's documents |
| Application code changed by Part 1 | None |
| Hosted services touched | None |
| Deployed | Nothing. Production still has the defects fixed in Phase 11 |
| Device runs in Part 1 | None |
| Recovery baseline | `~/Desktop/sylf-recovery/2026-11-01-expansion-part-1/`, rehearsed, on the same disk. See `RESTORE.md` there |

**Stage 3's handoff is still the architecture and harness reference:** [§1](stage-3.md#1-architecture), [§6](stage-3.md#6-harness) and [§7's rules](stage-3.md#7-requirements-for-phase-14).

## 2. Owner decisions so far

| Decision | Status |
| --- | --- |
| Calendar, AI Planner, quests and objectives belong in Home, not Workspace | Confirmed |
| Home navigation, with Plan as the fifth destination | **Approved** |
| Immersive Focus environment | **Approved** |
| Calendar and Planner leave Workspace after parity is verified | **Approved** |
| Stabilization and tablet verification are a prerequisite | Confirmed |
| Phases 14 to 17 keep their numbers | Confirmed |
| Each part stops for review | Confirmed |

**Waiting on the owner:** the decisions in [stage plan §12](../expansion/README.md#12-decisions-for-the-owner), especially E-14 (urgent repairs), E-8 (HP on Native), E-13 (does party time count) and E-11 (dependencies).

## 3. Read, in order

1. This page.
2. [Urgent issues](../reports/expansion-part-1/urgent-issues.md).
3. [Stage plan](../expansion/README.md).
4. [Part 2 brief](../expansion/part-2-study-progression-personalization.md): slices, files, reads and tests.
5. [Blueprint](../expansion/blueprint.md), for the slice in hand.
6. [Feature map](../expansion/feature-map.md), for the slice's rows.
7. ADRs [0014](../decisions/0014-home-hub-and-workspace-scope.md), [0015](../decisions/0015-session-modes-focus-environment-and-parties.md), [0016](../decisions/0016-realtime-streaming-and-remote-media.md), and the [Part 1 report](../reports/expansion-part-1/report.md).

## 4. First steps

**Do these in order, and do not change application code before the first.**

1. **The tree is committed.** Ask the owner. The baseline does not replace this.
2. Confirm the owner's answers, and which tablet runs are authorized. Authorization does not carry over.
3. Run the local set once on that commit, as the new baseline.
4. Step 0: the entry gate's remaining items, urgent repairs if approved, device spikes if authorized.
5. Slice A, then C, B, D, E. **Plan comes before Focus,** on purpose.

## 5. What Part 1 proved, in the terms you will code against

| Area | Contract |
| --- | --- |
| Bearer | Works on every route probed, with no cookie. A `Sec-Fetch-Site` header on a bearer token is a 401 |
| Heartbeat | `POST user/heartbeat`. Marks online within two minutes, and reconciles HP, throttled per process |
| Onboarding | `POST user/onboarding` with `subjects: [{ name }]`, `classId`, `timezone`. Creates 48 nodes per subject, defaulting to CAIE, A-Level |
| Subjects | `POST subjects` needs `name` and `code`. `DELETE` archives, `POST [id]/restore` restores |
| Schedule | `PATCH user/study-schedule` with `restDays`, `dailyGoalMinutes`, `enableHpPenalty`. `GET floating-rest-day?dateKey=` needs the date |
| Quests | `POST quests` needs `title`, `scheduledFor`, `targetMinutes`. A rest day answers 400 with `error: "REST_DAY_ALLOCATION_PROHIBITED"` and `message`. `PATCH` ignored `targetMinutes` |
| Calendar | `POST`/`PATCH calendar/personal` with `kind`, `id`, `revision`, `data`. No `revision` is 400, a stale one is 409. `calendar/month`'s `month` is 0 to 11 |
| Account | `PATCH user/account` takes `username`, `name`, `email`, `timezone`. `user/stats` holds every account field, with `hasPassword` |
| Deleting | `POST user/account/delete`: `password` if unverified, otherwise `code` from `user/security/send-code` |
| Privacy | Public, Friends, Private. Never offer `GROUPS` |
| Planner | `GET planner/workspace` with `x-sylf-planner-contract: 2` gives `readiness` and plans. With flags off, writes answer 503 `WORKER_UNAVAILABLE` |
| Backgrounds | `GET focus-backgrounds` is public. The preference is on the account |

**Registration is rate limited.** Tests with several students must reuse accounts or space them out.

## 6. Rules to keep

Everything in [Stage 3 §7](stage-3.md#7-requirements-for-phase-14), as narrowed by [ADR 0013](../decisions/0013-expansion-stage.md) decision 7, and [stage plan §6](../expansion/README.md#6-architecture-rules). The ones most likely to be broken next:

1. **One session owner.** Modes, breaks and the environment are additions to `createStudySessionModel`. No second clock.
2. **Move mode rules, don't copy them.** Web's timer suites run before and after.
3. **Plan is one destination.** No second planner, and Workspace's tools go in one change, after the parity list.
4. **HP becomes visible before the heartbeat ships.**
5. **Don't build profile customization on unfixed routes** (U-2).
6. **Native does not write appearance to `POST /api/cosmetics`.**
7. **Remote images through `RemoteImage` only.**
8. **No web component copied,** and no sample in a store build.
9. **The tablet needs authorization,** and security prompts and device settings are never touched without approval.
10. **Hosted variables blanked on every backend command,** and `--out` always passed.

## 7. Open, most important first

| # | Issue | Where |
| --- | --- | --- |
| 1 | Production keeps fixed defects until deployed | U-1, owner |
| 2 | Uncommitted tree | U-9, owner |
| 3 | Cosmetics, messages, email change, image addresses | U-2, U-3, U-4, U-6 |
| 4 | Do the server jobs run at all? | U-5, owner |
| 5 | Does party time count? | U-7, E-13 |
| 6 | No device proof of any new dependency | Step 0 |
| 7 | Whether external events merge into a range read | Slice C, needs a real connection |
| 8 | Real OAuth, landscape, by-hand tablet checks | Entry gate |
| 9 | `.env.local` change, Antigravity's 10:42 run | Owner |

## 8. Harness additions

```bash
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/none DIRECT_URL=postgresql://postgres:postgres@127.0.0.1:55432/none DATABASE_WORKER_URL=postgresql://postgres:postgres@127.0.0.1:55432/none UPSTASH_REDIS_REST_URL= UPSTASH_REDIS_REST_TOKEN= SUPABASE_SERVICE_ROLE_KEY= SUPABASE_JWT_SECRET= NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= GROQ_API_KEY= GEMINI_API_KEY= OPENAI_API_KEY= ANTHROPIC_API_KEY= node scripts/test/run-backend-local.mjs --serve --build --port 3111
```

A bearer client can then register and call `127.0.0.1:3111`. **Stopping it may leave its `sylf-backend-*` container running,** so check `docker ps` and stop only that one. The Planner flags are off here, so V2's success path needs `PLANNER_V2_DURABLE_CORE_ENABLED`, `PLANNER_V2_STUDENT_WORKSPACE_ENABLED`, a worker and fixtures, which Part 3 sets up.

## 9. When Part 2 ends

Write `reports/expansion-part-2/report.md` with evidence, and `handoffs/expansion-part-2.md`. Update the guides, the feature map and the master plan's log. Stop for the owner's review.
