# Phase 11 progress

Resume file. A fresh agent should read this, then `brief.md`, then continue from "Next".

## Done

- Read the orchestration plan, brief, Stage 2 handoff. HEAD is `f5a900b`.

## In progress

- Final root Vitest, typecheck, lint and native verify on the final code.

## Next

- Hand back to the supervisor. Phase 11 work is finished apart from that check.

## Decisions so far

- Native authentication: ADR 0009, Proposed.
- A session before sign-in belongs to nobody, and only an explicit choice adds it: ADR 0010, Proposed.
- Session length capped at 12 hours rather than limiting age, because delayed offline sessions must keep their date.
- Pre-hijacking closed by removing the unproven password, because an existing test pins linking into an unverified account.

## Notes for a fresh agent

- The guard hook blocks any Bash command that mentions the `.claude` orchestration or hook paths. Read those with the Read tool only.

## Log

- Baseline measured: root Vitest 36 failed / 8 uncollected suites / 4451 passed / 301 skipped. `tsc` 0 errors with `--incremental false`. native verify pass, 268 tests. To be written to baseline.md.
- `scripts/test/lib/disposable-backend.mjs`: new harness. Replays all 78 migrations on Docker postgres:17 with a repair pass. No hosted URL.
- Candidate findings so far (not yet reproduced): OAuth link cookie account takeover; session revoke cosmetic; OTP Math.random and no attempt limit; verify-email accepts OTP rows and discloses email; rankings ignore privacy and load all quest ids; /api/friends ignores privacy.
Auth fixes applied: OAuth link, device sessions (lib/auth-session-service.ts), security codes (lib/security-code.ts), verify-email, admin bootstrap, pre-hijack. Verifying.
- Fixed and tested on Postgres: group-conversation bypass (`mayAddToConversation`), leaderboard privacy, friends privacy, 12 h session cap (`MAX_SESSION_FOCUS_SECONDS`), `/api/friends` SQL broken outside production by `Prisma.join` module duplication. Evidence: backend-*-before-fix.json / after-fix.json.
- Next: hardening migration (RLS on 28 tables, revoke remove_focus_party_member), regression Postgres suites, performance measurements, native contract matrix, docs.
- Migration `20261101000000_rls_defense_in_depth` written, local only. RLS audit: 73/73 tables, 0 anon functions, 7/7 owner policies hold with the grant forced. Timer suites 81/81 on migrated schema via `--suite timer`.
- Existing harnesses test-timer/pixel/planner-postgres.mjs fail at bootstrap: working-tree schema.prisma has dbgenerated column-reference defaults on CalendarNote. Owner's uncommitted edit; reported, not changed. Tracked timer evidence restored from backup.
- `group-avatar.test.ts`: setup-only change, assertions untouched, because the fixture made a group with strangers. Disclose in report.

## Blocked operation

- Writing `report.md` was refused by the Write tool ("Subagents should return findings as text"). Not worked around. The report's content goes back in the handback message, and the supervisor decides how to file it. Treat `report.md` as deferred.

## Final results on final code

- `node scripts/test/test-backend-postgres.mjs --label backend-postgres auth-defects integrity`: 30 passed, 0 failed.
- `node scripts/test/test-backend-postgres.mjs --suite timer --label timer-suites-on-migrated-schema`: 81 passed, 0 failed.
- `node scripts/test/test-rls-audit-postgres.mjs`: passed. 73 of 73 tables with RLS, 0 functions for anon, 7 of 7 forced-grant policies.
- `run-backend-local.mjs --smoke --build`, with hosted variables overridden on the command: 25 of 25, build 49 s.
- Docker quit, 0 containers, port 3111 free.

## Incident

- A final-check command included `shasum` on `.env` and `.env.local`, which would have read them. It was stopped before reaching that step, so the files were not read, and it was rerun without it. Checksums belong to the supervisor's gate.
