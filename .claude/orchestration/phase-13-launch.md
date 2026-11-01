You are Subagent C, responsible for all of Phase 13 of the Sylf Native backend stage. The owner has authorized this phase and is asleep. Work to completion without waiting for anyone.

Your brief is `documentation/native/reports/phase-13/brief.md`. Read it in full. Follow your Start section. The brief takes precedence over everything except the hard limits. Start from `documentation/native/handoffs/phase-12.md`, `documentation/native/reports/phase-12/report.md`, `documentation/native/backend/README.md`, the Phase 11 report's compatibility matrix and §9, and ADRs 0009, 0010 and 0011. Phases 11 and 12 passed their gates, so do not repeat them, but inspect the source you are about to change.

**What the owner wants most.** A working, secure, genuinely useful student experience, not a report saying features are integrated. For each surface, ask whether a real student would find it useful, understand what to do next, and get an accurate result. Removing or simplifying is a valid answer. Use the `sylf-ui-implementation` skill where it applies, keep Aloft and all six themes, and no generic dashboards or forms.

**Order of work.** If you run short, finish earlier rungs properly rather than touching all of them.
1. A sign-in surface in Aloft, with sign-out, an ended session, an expired session, and a change of account showing no trace of the last person. Keep the no-backend build unchanged. There is no password reset anywhere (G-4), so say so plainly and do not imply one.
2. **The session bridge, the critical item.** One authoritative session across the dock, Focus and Workspace's Timer, delivered through `TimerSync` and `SessionProtocolV2`, following ADR 0010 and handoff §2. `saved` flips only on server acceptance. No duplicate sessions, no XP or study time for unverified activity, correct behavior offline and on reconnect, and a session past the server's 12-hour credit cap is shown honestly. Add a subject picker. Rewards always come from the server.
3. Home: Today (events on the line, quests in order, and never an invented time), Focus history, Progress from `detailed-stats?summary=true`, Circle with hidden shown as hidden and not zero.
4. Workspace: Planner and Calendar first, then Sylvie through `client.stream`, then Audio's catalog. Calculator and Timer stay working. Notes, PDFs, Whiteboard and Resources get an honest limited state, because Phase 14 owns them. AI Planner V2 keeps its full lifecycle and `ApplyService`: use an honest state if the end-to-end flow is unverified.
5. World lobby: identity, progression, cosmetics. `earnedThisWeek` gets a small read or is removed. No gameplay.
6. Performance and consistency across the connected journeys, justified by measurement.

**Known items to resolve**
- A wrong password through the client is sent twice, because the 401 triggers a refresh and replay (Phase 12 report §3). This wastes rate-limit budget and could mislead, so fix it.
- D-7: two Planner V2 tests fail and are unexplained. After rungs 1 to 4, use a temporary copy of the affected files from `git show HEAD:<path>` outside the working tree to establish whether the owner's uncommitted edits cause them. Do not change the owner's edits. Record the result.
- Keep the Sample and Not saved labels accurate as data becomes real. Without `DEV_TOOLS` the empty adapter binds, and a store build must never show sample content.

**Long checks.** Do not end your turn to wait for a background job, because every stop notifies the supervisor and spends the owner's usage. Start a long check with `nohup <command> > <log> 2>&1 &`, then wait in foreground Bash calls of at most nine minutes, for example `for i in $(seq 1 27); do grep -q DONE-MARKER <log> && break; /bin/sleep 20; done`. Keep that pattern for Electron, Gradle and full suites.

**Usage.** You may be stopped by a usage limit and resumed later, possibly by a fresh agent reading only the repository, so keep `documentation/native/reports/phase-13/progress.md` current.

**Rules from earlier phases**
- Root Vitest needs `DATABASE_URL` on localhost on the same command, with the full override list in the Phase 11 handoff §6. A run overwrites `documentation/performance/phase-0/artifacts/render-diagnostics.json`, so copy it before and restore it after. The same applies to tracked evidence any harness rewrites. Do not put `.env` file names in any command at all.
- Migrations are additive, validated on the disposable database only, never applied to anything hosted. Keep the owner's edits in `schema.prisma`.
- No real AI provider call and no real OAuth provider. Stub at the provider boundary and say so.
- `expo-secure-store` is the only approved new dependency.

**Verification.** Run the brief's nine-step journey end to end in real Electron against the real local server on the disposable database, with screenshots as evidence, and add it as a repeatable check. Cover empty accounts, two distinct users, expired sessions, failed requests, offline and reconnect, and restart. Then run the final set, one at a time: backend suites, Timer, Planner, Pixel, Calendar, Notes, RLS, migrations, root tests against the baseline, typecheck, ESLint on changed files, `npm run verify`, every Electron check, mobile checks, and `android:build`. Look at the screens yourself in light and dark, at desktop and tablet shapes, with a custom color set.

**The report file.** A tool rule refuses the Write tool on `report.md` for subagents. Do not work around it. Write everything else normally. Put the complete report as an appendix to your final message, starting with its `#` title line, and the supervisor files it unchanged. That appendix is exempt from your 300-word limit, and the summary above it is not.

**Deliver also.** `documentation/native/handoffs/stage-3.md`, covering all of Stage 3, with a consolidated architecture summary, what is implemented and verified, what is partial, what needs a device or external service, and the requirements for Phase 14. One prioritized tablet checklist for Phases 7 to 13 in `documentation/native/handoffs/tablet-checklist.md`, replacing the current file's structure, with the most important checks first and everything deferred kept. A prioritized list of unresolved issues and deferred functionality. The owner's operations from the Phase 11 and 12 handoffs, gathered into one ordered list in the Stage 3 handoff. Updated compatibility matrices, guides, master plan and ADRs.

Stop after Phase 13. Do not start Phase 14.
