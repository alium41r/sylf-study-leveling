# Sylf Native backend stage — orchestration plan

Supervisor's working file for Phases 11 to 13. It survives context compaction and restarts, and every phase agent reads it first. The phase briefs take precedence over this plan. Source, tests, schema and configuration win over any document.

## State

| Item | Value |
| --- | --- |
| Status | **Backend stage finished: Phases 11, 12 and 13 passed their gates, Phase 13 with one condition below.** Nothing committed or deployed. Rollback snapshot: `scratch/backend-stage/snapshots/phase-13/`. Env checksums in `scratch/backend-stage/env-checksums-baseline` are SHA-256, first 12 characters |
| Phase 12 gate | Passed. Supervisor reran the four backend suites (107 of 107) and `native` verify (434 passed, 1 skipped), read the bearer branch, rotation, OAuth code path and both migrations. HEAD and `.env` unchanged. D-7, the double-send of a wrong password and the possible Keychain item are carried to Phase 13 or the owner's summary |
| Phase 11 gate | Passed. Supervisor reran `test-backend-postgres.mjs` (30 of 30) and `native` verify (268 of 268), read the migration, `getSession` and the OAuth fix. HEAD and `.env` unchanged. Report filed by the supervisor, because a tool rule refuses `report.md` to subagents. A root Vitest run overwrote `documentation/performance/phase-0/artifacts/render-diagnostics.json`, restored from the snapshot. Guard extended to root Vitest after finding D-4 |
| Authorization (owner, 31 Oct 2026) | Autonomous Phases 11 → 12 → 13, one fresh agent each. Phase 10 approved for progression, with tablet verification still outstanding. Briefs and this plan are authoritative. Mac only: no tablet, hosted database operations, deployments, destructive actions or commits. Put working, secure, useful student experiences ahead of reports that say "integrated". Document anything needing approval for later |
| Usage limits | The owner allows a pause at a limit and will say continue on waking. The watchdog may still resume after a 5-hour reset. At the weekly limit, stop and leave clear state here |
| Agent validation | **Passed** after the restart: `claude-opus-5-5`, effort high, Bash and native Vitest (43 passed) with no permission prompt under auto mode, all five guard blocks fired |
| Phase 11 snapshot | `scratch/backend-stage/snapshots/phase-11/` |
| Watchdog | Deleted when the stage finished |
| Docker | Starts unattended, daemon 29.7.2, `postgres:17` present, 4 GB VM. Quit after testing, so `open -ga Docker` at launch |
| Phase 13 gate | Passed with one condition, 1 Nov, 11:00 local. Supervisor reran backend (112 of 112), `native` verify (479 passed, 1 skipped) and root typecheck (0 errors, 4 GB heap), read the server changes, `earned-this-week` and `session-bridge.ts`, and audited the agent's commands. HEAD and `.env` unchanged. Condition: another tool (Antigravity) edited the web tree from about 08:11 and still was at the gate, so the journey, root tests and HTTP checks need a rerun once it settles. `.env.local` changed at 08:12:31 and `app/dev/planner-studio-harness/` vanished at about 09:54, both while the agent was stopped, neither from this run. Supervisor's rerun overwrote `phase-11/evidence/backend-postgres.json`, restored from the snapshot |
| Current phase | Stage complete. Stopped after Phase 13 as instructed. Phase 14 and tablet testing need the owner |
| Git HEAD at setup | `f5a900b` (must not move during the run) |
| Briefs | Received. `documentation/native/reports/phase-11/brief.md`, `phase-12/brief.md` and `phase-13/brief.md`, verbatim |
| Agents launched | Phase 11: Subagent A, finished. Phase 12: Subagent B, finished. Phase 13: Subagent C, launched 05:43, stopped by the 5-hour limit at 07:35, resumed 10:42, finished 10:55 |

The supervisor updates this table at every transition.

## Roles

- **Supervisor (main session):** orchestrates, reviews and decides whether a phase passes. It writes no application code, tests or phase documentation. If an agent cannot run, it stops and says so. It never does the work itself.
- **Phase agents:** one `sylf-phase-implementer` per phase, each with a fresh context, one at a time. Corrections go to the same agent through `SendMessage`.

## Execution mechanism (verified against Claude Code 2.1.309)

- The Agent tool in this desktop build offers no `run_in_background` setting, so subagents always run in the background. The supervisor launches one, ends its turn, and is re-invoked when it finishes. That gives the same strict order as foreground execution.
- `CLAUDE_CODE_FORK_SUBAGENT=0` would restore the foreground option and is not set, on purpose. A foreground agent holds the supervisor's turn open, so the session is never idle, and the watchdog below cannot fire. An overnight run needs the watchdog more than it needs foreground.
- Custom agents load at process start, so `.claude/agents/sylf-phase-implementer.md` needs a session restart before the Agent tool can see it.
- The agent uses `model: inherit` and `effort: high`, matching this session (`claude-opus-5-5`, high). The permission mode is inherited from this session, which must stay on **auto**.
- The agent has no Agent tool, so no nesting, and no hosted Supabase, Vercel, Prisma MCP or browser tools. `.claude/hooks/sylf-phase-guard.mjs` blocks the rest. Check it with `node .claude/hooks/sylf-phase-guard.mjs --self-test`.
- Worktrees cannot be used. `native/` and `documentation/native/` are untracked, so a worktree would not contain them. All work happens in the main checkout, among 319 changed paths that belong to the owner.

## Dependencies

| Phase | Needs | Produces for the next |
| --- | --- | --- |
| 11 Audit | Stage 2 handoff, the data contracts, ADR 0008's backend map | Contract differences, the native auth design (R1), the owner of a pre-sign-in session, a working disposable backend harness, the root test baseline, the Phase 12 handoff |
| 12 Foundation | Phase 11's verified findings and design | Whatever the brief specifies. Expected: native sessions with revocation parity, a typed client, journal and outbox adapters, cache and logout cleanup |
| 13 Integration | Phases 11 and 12 verified | Real adapters at the three `data/index.ts` binding points, the session delivered to `SessionProtocolV2`, the Stage 3 handoff |

**First task of Subagent A:** before changing anything, record the root Vitest failures, the typecheck state and the `native/` verify result in `documentation/native/reports/phase-11/baseline.md`. Every later regression claim compares against that file.

## Gates

**Before each launch**

1. The previous gate passed, or this is Phase 11.
2. Snapshot taken in `scratch/backend-stage/snapshots/<phase>/`: `git diff --binary`, the untracked file list, and a tar of `native/` and `documentation/native/` without `node_modules` or build output. Commits are not authorized, so this is the rollback point.
3. `git rev-parse HEAD` still `f5a900b`.
4. Usage and swap checked, and no stray Docker container, dev server or Electron process.

**After each phase, inspected by the supervisor**

| # | Check |
| --- | --- |
| 1 | The files really changed match the agent's claim, compared with the snapshot |
| 2 | Report, evidence, next-phase handoff, master plan, ADRs and feature guides exist and agree with the code |
| 3 | Tests are reported by category, each with its command. Failures are explained and compared with the baseline |
| 4 | HEAD unchanged, `.env` and `.env.local` unchanged by checksum, no hosted host in code or evidence |
| 5 | Any change to `prisma/`, RLS, RPCs, `lib/auth*`, ledgers or settlement is read line by line. A weakened control fails the gate |
| 6 | One authority each for sessions, identity and progression, with no parallel system. Boundary audit and `native/` verify pass, rerun once by the supervisor |
| 7 | No known reproducible critical defect or unexplained failure remains. Otherwise it goes back to the same agent, at most three rounds |

**Phase-specific**

- **11:** every finding has evidence, the auth design has no bearer path that bypasses `tokenVersion` revocation, pre-sign-in ownership is decided, and the harness runs with no hosted credentials.
- **12:** authentication, ownership and revocation tests pass on a disposable database, RLS is untouched or stronger, and web cookie sessions still work.
- **13:** real workflows run end to end, the Sample and Not saved labels disappear only where real data flows, there is one timer across the dock, Focus and Workspace, World time stays out of study accrual, and a store build still shows no sample content.

**A gate can fail only on substance.** If something needs the owner, the agent records it as deferred, and the run continues with work that does not depend on it. A blocker that makes the next phase unsafe stops the run there, with a written reason.

## Recovery

- A session-only cron watchdog is created at launch. It fires only while the supervisor is idle, and a running agent is left alone.
- Every agent keeps `reports/phase-<n>/progress.md` current, so a fresh agent can continue from the repository alone.
- **Usage limit:** the account is on Pro with no extra usage. When an agent stops at a limit, the watchdog resumes it after the reset through `SendMessage`, or with a fresh agent reading `progress.md` if the first cannot be resumed. If the weekly limit is reached, the run waits for its reset, and the supervisor leaves a clear state here.
- **Mac or app restart:** session-only cron and running agents are lost. Everything durable is in the repository, and the owner resumes this session.

## After Phase 13

The supervisor delegates to Subagent C: the Stage 3 handoff with a consolidated architecture summary and Phase 14 requirements, and one prioritized tablet plan that merges `documentation/native/handoffs/tablet-checklist.md` with everything new. It then checks the three phases together and writes the owner's summary. Phase 14 and tablet testing do not start.
