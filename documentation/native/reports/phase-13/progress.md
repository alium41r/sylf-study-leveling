# Phase 13 progress

Started 1 Nov 2026 (Subagent C). A fresh agent: read this, then the brief, then the plan below. Nothing is committed. HEAD must stay f5a900b.

## Done
- Read brief, orchestration file, Phase 11/12 reports, handoffs, ADRs 0008 to 0011, session model, backend package, Home/Workspace/World screens.

## In progress
- Reading server contracts for sessions, friends, party, calendar, quests.

## Next
Rungs 1 to 6 from the launch prompt, in order.

## Decisions so far
(see below as they are made)

## Test results
None yet.

## Update: first pass of code written (rungs 1 to 5), not yet tested
Built: model delivery fields, session-bridge.ts, reads.ts, shell/account/*, shell/live*.ts, spaces/*/data/live.ts, tools, Today/Focus/Circle/Progress, /api/user/earned-this-week, friends `visible`, password_incorrect code, MAX_SESSION_FOCUS_SECONDS moved to lib/timer-engine.
Next: unit tests for bridge and mappers, integration on real server, Electron journey check, visual review, then final set.

Bridge unit tests pass (16), native unit total 478. Integration tests added in packages/backend/integration. Running first web build plus real-server integration. Next: apps/desktop/src/journey-check.mjs (real Electron, real server, two processes), then visual review.

## Journey passes (1 Nov, ~06:50)
`SYLF env overrides + node scripts/test/run-backend-local.mjs --journey --out documentation/native/reports/phase-13/evidence/journey`: both stages pass, two real processes on one profile, 91 checks. Real defects it found and fixed: a tap with a focused field inside ToolPage only dismissed focus (keyboardShouldPersistTaps), and the Command Center's full-width band swallowed clicks on windows beside it (DockShelf box-none), and a drain race that left a started session unposted (bridge `deliver`).
Integration on the real server: 22 of 22 (evidence/native-integration.json).
Next: visual pass (themes, tablet, compact), strip markdown in Sylvie, D-7, perf, final set, docs.

Journey 98 checks pass (39 + 59) before the last small UI fixes. Visual review started: fixed Progress "0.0 hr" for minutes, Account sheet padding, journey's window minimum so compact really is compact. Next: verify, rerun journey, Electron checks one at a time, mobile, android, root tests, D-7, docs.

## Final set, on the final app code (06:58)
Passed: native verify (478 unit), journey 39 + 59, Electron self-test, design, spaces 52, home 72, world 189, session 113, workspace 184. Evidence in evidence/journey and evidence/electron.
Running next: backend suites, timer, planner, pixel, route cost, calendar, notes, RLS, migrations, root vitest, root tsc, smoke, native-checks with electron. Then planner-v2 and D-7, mobile, android. Then write stage-3.md and the report appendix.

Passed on final code: backend 110, timer 81, pixel 8, planner 1915 passed 4 failed (baseline exam-entry) 34 skipped, calendar, notes, RLS, migrations, root 4451/36/301 (same as baseline), root tsc 0, smoke 25 of 25, integration 22 of 22, backend Electron check.
Running planner-v2 on Node 24. Then D-7 in a scratch copy, mobile, android, ESLint, then write the report appendix.
Note: D-7's tests and natural-learning.ts are untracked, so HEAD does not have them.

## Resumed 10:42 (coordinator message)
planner-v2 was NOT interrupted: it finished at 07:19 local, 422 passed, 2 failed (D-7), evidence/planner-v2-postgres.json. D-7 scratch runs finished 07:35. progress.md had lagged.
laughing_jepsen (GitHub MCP, 09:51) and sylf-planner-phase1-* (08:13) are NOT from this run. Antigravity IDE started 09:51 and has been editing the web tree since about 08:11, and ran its own test run at 10:42, which rewrote tracked evidence. Left alone. Do not quit Docker while they are up: it would stop them. native/ and documentation/native unchanged by it.
Web files this phase touched were not changed by it. Routes native reads were (user/stats, achievements, cosmetics, friends/requests, quests/[id]): added a contracts test to the route suite.
Remaining: run that suite, ESLint, mobile, android, finish docs, final message.

Finished 11:1x: current-tree route suite 112 of 112, ESLint clean on changed root files, mobile build and verify pass, android:build 34.1 MiB, native unit 479 passed 1 skipped. D-7 recorded in evidence/d7-*.txt. Docker left running on purpose: both remaining containers belong to another tool.
Report is delivered in the handback, not as a file.
