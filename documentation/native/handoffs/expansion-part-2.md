# Expansion Part 2 → Part 3 handoff

**Written 4 November 2026.** Part 2 is built on `expansion-part-2` and awaits the owner's review. Part 3 runs in its own worktree on `expansion-part-3` (below). Start from this page, then the [Part 3 brief](../expansion/part-3-social-sylvie-planner.md), the [Part 2 report](../reports/expansion-part-2/report.md), the [blueprint](../expansion/blueprint.md) and ADRs [0015](../decisions/0015-session-modes-focus-environment-and-parties.md), [0016](../decisions/0016-realtime-streaming-and-remote-media.md) and [0017](../decisions/0017-hp-stays-off-native.md). **This page updates the Part 3 brief where they differ.** Source wins over prose.

## 1. The owner's standing instructions

- **Testing stays deferred to the end of Part 4.** Write tests, don't run them, and keep `tsc` clean. After Part 4, full automated, integration, security, performance and tablet testing is authorized with a **disposable local backend only**. Ask before changing device settings or dismissing security prompts.
- **Commit and push milestones to `expansion-part-3` without asking.** Never force-push, rewrite history, deploy or touch hosted data. Scan for secrets before every push. **Stage only your own paths**, never with `git add <directory>` over a shared one: check `git diff --cached --name-only` before every commit.
- **Work autonomously,** skip blockers and report them. Stop after Part 3 for review.
- **HP stays off Native.** A friend's HP must never appear in Circle or a party either.
- `@supabase/realtime-js` is approved for a **spike only**. It is not installed.
- **No automatic merges.** `expansion-part-3` is never merged into anything without the owner.

## 2. What Part 3 inherits

| Piece | Where | Part 3 uses it for |
| --- | --- | --- |
| The Plans view | `spaces/home/plan/PlansView.tsx`, `usePlan.ts`, `packages/backend/src/plan.ts` | **Slice A goes here, with no new navigation.** It reads `planner/workspace` with contract 2 and stops at the seam |
| `useEnterFocus`, the Focus environment | `shell/focus/` | A party room is the environment with people in it. Entering from a conversation reuses `enter.tsx` |
| One session, modes, breaks | `packages/spaces/src/session/model.ts` | A party session is a kind of the one active session (ADR 0015 decision 11). Do not add a second clock |
| `PushedPage`, `SubNav`, `useHomeView` | `spaces/home/HomePage.tsx` | Circle's People, Messages and Parties, and the AI Planner's long flow |
| Presence | `packages/backend/src/presence.ts` (60 s, foreground only) | Realtime should replace the cadence with 5 minutes only once it is live |
| Resources and tags | `packages/backend/src/resources.ts` | Every new read is a resource, invalidated by tag, memory only |
| Reads by area | `packages/backend/src/{plan,focus,progress,account}.ts` | Add `social.ts`, `sylvie.ts` and `planner.ts` the same way |
| The shared catalogs entry | `@sylf/shared/catalogs`, behind `import()` | Same pattern if Sylvie's knowledge needs a catalog |
| `sendToSylvie` | `reads.ts`, the stream reader | Exists and works over the incremental body. Hermes behavior is the spike |
| Quick-ask, rich text, proposal cards | Not built | Blueprint §10 and §14 |

**Circle still has one view.** `HOME_VIEWS` has no `circle` entry yet: add `["people", "messages", "parties"]` in `packages/spaces/src/home.ts` with a test, and the older snapshots still parse.

## 3. Rules that must survive

One clock. No tick. Hidden views pass `live={false}`. `saved` flips only in `settleAccepted`. World time never counts. A session running makes no requests of its own. Reads retry and writes do not. Nothing loads without a backend: `@sylf/backend` and the catalogs stay behind `import()`, and `node native/tooling/checks/check-boundaries.mjs` must pass. Rewards, ranks and prices are the server's. Hidden values stay hidden, and Standing already relies on the server's per-viewer filter.

## 4. Open items that touch Part 3

- **Party credit (E-13)** is still open and needs the owner's answer before slice D.
- **Realtime and streaming spikes** (ADR 0016) have no results: they need a real device and a Realtime server the owner names.
- **The server does not enforce one active session** across solo and party (ADR 0015 decision 12), so the client must ask before joining.
- **Unverified on screen and on Hermes:** everything in Part 2, including the new dependencies. Plan for failures when Part 4 finally runs it, and do not build on an assumption that a Part 2 surface works.
- `APP_PUBLIC_URL` must be set for password reset to send a link.
- **The Codex text is the web's.** It says "System Hub →" in places, which is web navigation. Reword it at the source if the owner wants.

## 5. The worktree

Created at the end of Part 2, from the final Part 2 commit, never from a tree holding the other agent's uncommitted files.

| Fact | Value |
| --- | --- |
| Path | `/Users/aliumair/Desktop/sylf-expansion-part-3` |
| Branch | `expansion-part-3`, from the tip of `expansion-part-2` when Part 2 ended (`git merge-base expansion-part-2 expansion-part-3` names it), pushed with `-u` |
| `node_modules` | Not in git. Run `npm ci` at the worktree root and in `native/` (slow, about 3.4 GB). **Copy no `.env` files.** Part 3's tests use the disposable harness, which blanks hosted variables |
| Ports | Run the harness server on `--port 3121`, not 3111. Metro and Electron must not share a port with another worktree. Check `docker ps` before and after: the disposable PostgreSQL picks its own container name and port |
| Merging | Never automatic |

## 6. Commands

```bash
git -C /Users/aliumair/Desktop/sylf-expansion-part-3 status
cd /Users/aliumair/Desktop/sylf-expansion-part-3/native && npm run typecheck
cd /Users/aliumair/Desktop/sylf-expansion-part-3/native && node tooling/checks/check-boundaries.mjs
```
