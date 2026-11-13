# Repository consolidation — 13 November 2026

**Result:** one committed baseline, branch `consolidation/2026-11-13`, fast-forwarded into local `main`. It holds the latest Sylf Native work, the web Planner v2 work and one documentation set that were previously scattered across uncommitted worktrees. Nothing was deployed, no database was touched, and every dirty worktree was backed up before anything changed.

**Start here for new work:** branch from `main`. Native's current state is in the [Native index](../../../native/README.md) and the [2026-11-12 quality-pass report](../../../native/reports/2026-11-12-notes-workspace-quality/README.md); the web Planner's in the [Planner index](../../../planner/README.md).

## 1. What was found

Committed history was already linear: every branch was an ancestor of `phase-14-pen-settings`. The fragmentation was all **uncommitted** work.

| Location | Branch at | Uncommitted work | Last edit |
| --- | --- | --- | --- |
| `~/Desktop/sylf-pen-settings` | `phase-14-pen-settings` (tip of history) | **Latest Sylf Native**: 122 modified, 18 deleted, 42 new (frontend refinement, Notes gallery and quality pass, workspace visual audit, Home redesign) | 13 Nov 07:30 |
| `~/Desktop/sylf` (main checkout) | `expansion-part-2` | Web Planner v2: 38 modified, 7 new report folders | 7 Nov |
| `~/.gemini/antigravity/worktrees/sylf/fix_ai_planner_ui` | `expansion-part-2` | The main checkout's Planner edits **plus** further work (Planner overhaul): 50 modified, 8 new | 9 Nov |
| `~/.gemini/antigravity/worktrees/sylf/repository_architecture_audit_blueprint` | `main` | Read-only architecture audit (5 docs) | 2 Nov |
| `~/Desktop/sylf-expansion-part-3` | `expansion-part-3` | One script, `scripts/dev/vercel-prune.sh` | 5 Nov |
| Five other Antigravity worktrees, `~/Desktop/sylf-phase-14` | various ancestors | none | — |

No Claude session or other agent was running during the consolidation.

## 2. Backups (taken before any change)

Every dirty worktree, tracked and untracked files, was snapshotted without touching its working tree or index:

- **Git refs** `refs/backup/2026-11-13/{pen-settings, main-checkout-expansion-part-2, fix-ai-planner-ui, architecture-audit, expansion-part-3}` — each a commit whose parent is that worktree's `HEAD`. Inspect with `git show --stat refs/backup/2026-11-13/<name>`; restore a file with `git checkout refs/backup/2026-11-13/<name> -- <path>`.
- **Files** in `~/Desktop/sylf-backups/consolidation-2026-11-13/`: per worktree a binary `*.tracked.patch`, a `*.dirty-files.tgz` of every changed/untracked file, the file list and `INDEX.txt` (ref, base commit, path).
- The main checkout's edits are also in `git stash list` ("consolidation 2026-11-13: superseded Planner edits…").

These refs are local only. Do not delete them until the owner has reviewed this baseline.

## 3. Decisions

| Work | Decision | Why |
| --- | --- | --- |
| Latest Native (pen-settings) | **Kept in full**, committed as `e3bfc8c` on `phase-14-pen-settings` | Source of truth. The 18 deletions are intentional: the old Today hero/ring/day/momentum/circle/invites cards and the Home/Workspace/World sample-data modules, replaced by the Home redesign and live data. |
| Planner, main checkout vs `fix_ai_planner_ui` | **Took `fix_ai_planner_ui` verbatim**, committed as `4ad3015` | It was built on the main checkout's edits (same changes plus the 7–9 Nov overhaul). The only file where the main checkout differed in a way the newer tree did not carry was `.claude/launch.json`, whose extra `phase14-web` entry pointed at the retired `sylf-phase-14` worktree; it was dropped. |
| Planner vs Native | **No conflict** | The two sets touch disjoint files. Planner touches web `lib/planner`, `lib/ai`, `app/components/planner`, `app/components/TopRightBar.tsx`, `lib/calendar/planning.ts`; Native's only web file is `lib/notes/ink.ts`. |
| Architecture audit | **Kept as an unadopted proposal** at [`documentation/architecture/repository-modernization/`](../../../architecture/repository-modernization/README.md) | Useful research, but it predates Native's role and covers the web tree only. A banner says so; its `file:///` links to the Antigravity worktree were made repository-relative. |
| `scripts/dev/vercel-prune.sh` | **Excluded** (kept in backup) | A one-off script that deletes production Vercel deployments from a hard-coded 5 November list. Committing a stale destructive production script would invite misuse. |

Nothing else was removed. No older implementation was reintroduced: every incorporated file was newer than, or disjoint from, the Native baseline.

## 4. Verification on the consolidated tree

| Check | Result |
| --- | --- |
| Native `npm run typecheck` | Pass |
| Native unit tests (`npm test` in `native/`) | 647 passed, 1 skipped |
| Native `check:boundaries`, `check:single-copy` | Pass, no violations |
| ESLint, every changed Native file | Pass |
| Root `npx tsc --noEmit` | Pass (needs `NODE_OPTIONS=--max-old-space-size=6144` on the 8 GB Mac; the default heap crashes) |
| Root Vitest, external services pointed at `127.0.0.1:1` | 4,531 passed, 300 skipped (opt-in Postgres/provider suites), 1 failed: `notes/ink.test.ts` "drains sustained ink revisions…" timed out at 60 s under full-suite load. Alone it passes 25/25 with the new and with the previous `lib/notes/ink.ts`, so it is load, not a regression. |
| `npm run mobile:build`, `mobile:verify` | Pass; no server-only symbols or secrets in the bundle |
| ESLint, changed web files | 9 `no-explicit-any` errors in `lib/ai/providers/deepseek.ts`, all present before this change; 1 `<img>` warning in `TopRightBar.tsx`. Left as they were. |
| Secret scan of the newly committed diff | Nothing found |

**Not run:** `next build` (the Planner overhaul report records it passing on the same web files), Electron checks, Postgres suites, anything on the Samsung tablet, and anything hosted. The Native quality pass is still **unverified on the tablet**; see its report and the end of the [tablet checklist](../../../native/handoffs/tablet-checklist.md).

The root `.env` points at the hosted database. Run root Vitest with `DATABASE_URL`, `DIRECT_URL`, `DATABASE_WORKER_URL`, `UPSTASH_REDIS_REST_URL` and `NEXT_PUBLIC_SUPABASE_URL` overridden to an unreachable local address, as above.

## 5. Branch and worktree structure afterwards

After the owner approved clean-up on 13 November, only two worktrees and two local branches remain:

| Worktree | Branch | Purpose |
| --- | --- | --- |
| `~/Desktop/sylf` | `main` | **The baseline.** Branch from here; pushed to `origin/main`. |
| `~/Desktop/sylf-pen-settings` | `native-device` (created from `main`) | Kept only because it holds the one current Android prebuild (`native/apps/sylf/android`, 1.1 GB, with the audio and notification modules the main checkout's 1 November prebuild lacks). Use it for tablet/Electron device work; bring it up to date with `git merge --ff-only main` first. |

Removed (all clean or verified identical to their backup refs first): the seven Antigravity worktrees under `~/.gemini/antigravity/worktrees/sylf/`, `~/Desktop/sylf-expansion-part-3` and `~/Desktop/sylf-phase-14`. Deleted local branches, all fully merged into `main` (`git branch -d`): `phase-14-pen-settings`, `phase-14`, `expansion-part-2`, `expansion-part-3`, `sylf_performance_phase_2`, `sylf_performance_optimization_modernization`, `week5-multi-agent`, `internship-final`, `consolidation/2026-11-13` and the six Antigravity branches. Two ignored files that existed only in removed worktrees were saved to the backup folder's `ignored-extras/`: `expansion-part-3`'s `native/apps/sylf/.env.local` (one API origin) and `sylf-phase-14`'s Android build logs.

Left on purpose: the remote branches `origin/expansion-part-2`, `origin/expansion-part-3`, `origin/phase-14` and `origin/phase-14-pen-settings` (all contained in `main`; deleting them on GitHub is the owner's call), `refs/backup/2026-11-13/*`, the backup folder and the stash.

## 6. Remaining issues

1. Done: `main` and `phase-14-pen-settings` pushed to `origin`. `consolidation/2026-11-13` and `refs/backup/*` stay local.
2. Done: stale worktrees and merged local branches removed (section 5). The four merged remote branches remain.
3. Tablet verification of the 10–13 November Native work.
4. Pre-existing lint debt in `lib/ai/providers/deepseek.ts`.
5. The `notes/ink` sustained-revision test is close to its 60 s limit under full-suite load on this machine.
6. The architecture proposal needs an owner decision before any of it is acted on.
