# Expansion Part 2 — Study experience, progression and personalization

**Brief for a fresh session, updated by Part 1 on 1 November 2026. Not started, and it needs the owner's authorization.** The [stage plan](README.md) holds the rules and gates. Start from the [Part 2 handoff](../handoffs/expansion-part-1.md).

## Goal

Make Native the place a student organizes and does their studying: a real first day, a Focus experience worth entering, a Home that holds their calendar and plans, a clear record of progress, and an account of their own.

## Prerequisites

- The owner has approved Part 1. The [blueprint](blueprint.md) and handoff are the design source.
- **The tree is committed.** No application code changes on an uncommitted tree.
- Answers to E-4, E-8 and E-14 before slice A, E-3 before slice E, and approval of dependencies (E-11).

## Read first

[Stage plan](README.md), [Part 2 handoff](../handoffs/expansion-part-1.md), [blueprint](blueprint.md), [feature map](feature-map.md), [urgent issues](../reports/expansion-part-1/urgent-issues.md), ADRs [0014](../decisions/0014-home-hub-and-workspace-scope.md) and [0015](../decisions/0015-session-modes-focus-environment-and-parties.md), then the guide for the slice in hand.

**Skill:** `sylf-ui-implementation` applies to all UI here.

## Order

```
0 Preconditions and repairs ─► A Foundations ─► C Plan, then Workspace's tools leave ─► B Focus and modes ─► D Progress and Codex ─► E Account and profile
```

**The order is by value and risk, so the letters are not in sequence.** Plan comes before Focus because it is the owner's central decision, it has no unproven dependency, and it unblocks Part 3. Focus needs the device spikes. Each slice is one review. Stop after each if the owner asks, and always after E.

| Slice | Size | Must | Leading risk |
| --- | --- | --- | --- |
| 0 | M | Commit, spikes, urgent repairs | Touching live routes |
| A | M | Heartbeat, HP, tick, navigation, onboarding | HP turning on |
| C | **L** | Calendar, quests, goals, subjects, schedule, tools leave | Calendar's edit rules |
| B | **L** | Modes, breaks, environment, audio, alert | Extraction, background behavior |
| D | M | Stats, Standing, Honours, Codex | Leaderboard cache |
| E | M | Identity, security, deletion, privacy, appearance, profile | Security-sensitive flows |

---

## Step 0 — Preconditions and repairs

| Do | Why |
| --- | --- |
| Close the [entry gate](README.md#3-entry-gate) | Open items were carried here |
| Fix U-2: cosmetic ownership, in one shared check | Native must not build on it. Find out what existing rows hold first |
| Fix U-3: message length and social rate limits | Before Part 3, and production has it now |
| Fix U-4: email change confirmation and notice | Before password reset |
| Fix U-6: accept only Sylf's storage for image addresses | Web and Native both benefit |
| Run the device spikes, with authorization | Below |
| Add a second and third student to the journey harness | Part 3 needs it, and so does slice D's Standing |

Each repair is reproduced first on real PostgreSQL, ships with a regression test, keeps web's suites passing, and stops for the owner if it would remove something a real account holds. The probe scripts' requests in the [evidence](../reports/expansion-part-1/evidence/) are the reproductions.

| Device spike | Proves | If it fails |
| --- | --- | --- |
| `expo/fetch` on Hermes | A body read incrementally, Sylvie and Planner `?stream=true`, multipart | A progress indicator, and Planner polls. Everything still works |
| `@supabase/realtime-js` on Hermes | Connect, background, token refresh, against a real Realtime server the owner names | The bounded fallback |
| Audio | Loop with the screen off, stop paths, Android foreground rules | Sound in the foreground only |
| Local notification | Phase-end alert in the background, after a restart | The session still ends truthfully, and says so on return |
| Keep-awake | Held in the environment, released on every exit | The system's own timeout applies |
| Focus background | Decode time, memory, release | A plain ground |
| Sprite | A prerendered PNG from Pixel Display content | Initials, as `Avatar` does today |

---

---

## Slice A — Foundations

| Build | Owner | Notes |
| --- | --- | --- |
| Heartbeat | `POST /api/user/heartbeat` | One shell service for someone signed in, foreground only. Web's cadence, 60 s, or 5 min once Realtime is live. **HP shows first** (decision E-8, R23) |
| HP on Progress | `user/stats` fields, `lib/game-engine.ts` | A quiet value and what it means |
| Tick in Today | `quests/[id]`, `reads.completeQuest` | Needed before Workspace's Planner can leave (A-23). Moves the rule from `PlannerTool.tsx`, including `executionProtocol: 2` for planned quests |
| Timezone | `PATCH /api/user/account` with `timezone` | A student who travels keeps correct days. Offer the change, and never silently overwrite |
| Home sub-views | `packages/spaces/src/home.ts` | Add `plan` to `HOME_DESTINATIONS` and `HOME_LABELS`. Add `views` per destination to `HomeSnapshot`, with a pushed-page position. `parseHomeSnapshot` must read older snapshots |
| Rail | `HomeRail.tsx`, `HomeSpace.tsx`, `shell/links.ts` | Five entries, a new icon. Check the rail at short heights, the bottom bar at 340 pt, and that labels still fit |
| Pushed pages | `HomePage.tsx` | One pattern for a page inside a destination, with back, Android Back, Escape and restoration |
| Account page | `AccountSheet.tsx`, `useAccountEntry` | The sheet becomes a page. A shell here, with slice E filling it. Keep ADR 0012 decision 17: only Home has it |
| Onboarding | `POST user/onboarding` with `subjects`, `classId`, `timezone`. `PATCH user/study-schedule` | Three steps from the [blueprint](blueprint.md#12-onboarding), after a first sign-up, in `AccountGate`'s path. Skipping still calls the route. `POST subjects` needs `name` and `code`. Web defaults boards to CAIE, A-Level, so don't let that pass unseen (A-27) |
| Reads | `packages/backend/src/reads.ts`, `contracts.ts` | Only what this slice uses |
| Components | `packages/design-system` | The blueprint's new shared components, with Showcase entries and a Design check |

**Backend.** Part 1's sweep found heartbeat and `calendar/month` to be the only lazy jobs, so the heartbeat closes A-2. Reconciliation is idempotent. `enableHpPenalty` defaults to true, so onboarding explains HP.

**Done when.** A new student reaches a useful first day on Native. Their friend sees them online. HP is visible and truthful. Older snapshots open. Five rail entries work at every window shape, and `home-check` covers `plan`.

**Update:** `home-check.mjs` (`DESTINATIONS`, `LABELS`), the Android check, the journey's onboarding, [Home guide](../home/README.md).

---

## Slice B — Focus and modes

| Build | Owner | Notes |
| --- | --- | --- |
| Pure mode rules | **New** `lib/timer-modes.ts` | Move, not copy, from `FocusScreen.tsx:673-727` (first phase), `:778` onward (`transitionPhase`), the Flowtime nudge at about `:1378`, and `DEFAULT_MODES` in `ModesSettingsScreen`. The pure function is `(mode, phase, round, totalRounds) => { nextPhase, seconds, label, nextRound, pauseIf }`. Chime, state setters and fullscreen stay in the component. Web imports it, and behavior does not change. Add to `@sylf/shared` |
| Session model | `packages/spaces/src/session/model.ts` | Gains `mode` and phase steps through `transitionSnapshot`. `STUDY_SESSION_STORAGE_KEY` moves to `.v2` with a tested reader for `.v1`. `SessionLength` stays for Free Flow and countdowns |
| Breaks | `model.ts`, `session-bridge.ts`, `SessionParts.tsx` | `breakMs` becomes real. Replaces ADR 0008 decision 20. Operations already carry `breaks` |
| Choosing a mode | Focus destination, dock | Seven modes and their settings, stored on the device like web's `study_mode_config`, in one preference. **No server sync:** it would need a column, so it is a future possibility |
| Focus environment | `shell/`, a new layer above the Spaces | Entered from Focus, the dock, Workspace's Timer and "Study this". Hides the Spaces icon and the dock. Exit returns to the Space it left. World's guard still reads the same model |
| Layout | New, in Aloft | One: the [blueprint's environment](blueprint.md#the-focus-environment), honoring a background's `timerPosition` and focal point. **Web's four are not ported** |
| Backgrounds | `GET focus-backgrounds` (public URLs), `GET`/`PATCH focus-backgrounds/preference` (on the account, versioned), `preference/refresh-signed-url` (1-hour URLs for custom ones), `lib/focus-background-types.ts` | The server holds the preference, so Native reads the same one. Decoded on entry and released on exit. Uploading stays on the web for now |
| Eye comfort, keep-awake | New dependency | Held only inside the environment, released on every exit path, including a crash and a background |
| Audio engine | `AcousticTrack`, `lib/acoustics/`, `client.assetUrl` | One native engine. The Workspace Audio tool and the environment are views of it. Remove the disabled Play |
| Background alert | Local notification | When a phase ends with the app away. No push service |
| Another device's session | `SessionProtocolV2.restore` | Adopt into the dock with one action, if Part 1 found it worth it |

**Rules that must survive.** One clock. No tick. Hidden views pass `live={false}`. `saved` flips only in `settleAccepted`. World time never counts. A session running makes no requests of its own.

**Backend.** The 12-hour cap applies to a whole mode session. Check long-break sequences do not exceed it silently.

**Web check.** `__tests__/timer`, `__tests__/planner-v2/session-client.test.ts`, `__tests__/focus`, `npm run mobile:build`, `npm run mobile:verify`, and `node scripts/verify/verify-timer-build.mjs`, before and after extraction. A web Pomodoro by hand in a browser.

**Done when.** All seven modes run on Native to the same phases as web, from one table of tests. A Pomodoro with breaks reaches the server once with correct focus and break seconds. The environment enters and exits from everywhere, holds no memory after exit, and a process kill mid-break restores exactly.

**Update:** [ADR 0008](../decisions/0008-study-session-and-timer-dock.md), [Spaces guide §10](../spaces/README.md#10-the-study-session-and-the-timer-dock), [timer contract](../../timer/README.md), new `documentation/native/focus/README.md`, the journey, the Session check.

---

## Slice C — Plan

The owner's central decision. **Read [ADR 0014](../decisions/0014-home-hub-and-workspace-scope.md) first.**

| Build | Owner | Notes |
| --- | --- | --- |
| Plan destination | `spaces/home/destinations/PlanDestination.tsx`, `spaces/home/plan/` | Calendar, Quests and goals, Plans. Each view is a separate chunk |
| Calendar | `calendar/personal` (93 days at most, `revision` required on edit, 409 when stale), `calendar/month` (study data, `month` is 0 to 11), `calendar/preferences` | Month, week, day and agenda. Quick add through `lib/calendar/quick-add.ts`, recurrence through `recurrence.ts`, both pure. Event editor with category, repeat and reminders. Replaces T-3 |
| Day detail | `calendar/personal`, `quests` | Selecting a date shows events, quests, goal deadlines and study on one surface |
| Quests | `quests`, `quests/[id]`, `quests/weekly`, `quests/evaluate-scope` | Create, edit, delete, deadlines. `REST_DAY_ALLOCATION_PROHIBITED` is answered in place, with a way forward. `PATCH` ignored `targetMinutes` in the probe, so check web's editor before offering it (A-24). Creation can spend AI scope quota, so don't call it speculatively. **A planned quest's edits follow `lib/planner/server/mutation-guards.ts`** |
| Goals | `goals`, `goals/[id]`, `goals/[id]/adjust` | Full lifecycle, with linked-plan guards |
| Subjects | `subjects`, `lib/subject-service.ts` | Create, edit, archive, restore, with the dependency summary before anything destructive |
| Schedule | `user/study-schedule`, `floating-rest-day`, `lib/study-schedule-service.ts` | Daily target, rest days, floating rest days, HP penalty choice |
| Plans view | `GET planner/workspace` with `x-sylf-planner-contract: 2`, returning `readiness` and plans | List, readiness, the state when V2 is off. Types come from `lib/planner/v2/client/workspace.ts`. **Stops at the seam** in the [stage plan](README.md#7-parts-and-order) |
| Reminders | `calendar/reminders` | Local notifications, on the agent's rules |

**Backend.** No repair of `calendar/month` is needed (A-6). Use `CalendarEvent` revisions and mutation identities, and the exact-retry rules in the [Calendar contract](../../calendar/README.md). Note that a range read starts a calendar sync after it answers, so don't read it more than a screen needs.

**What stays out.** Notebook, annotations, ink and recognition wait for Phase 14's ink. Connecting an external calendar stays on the web (G-13). Shared calendars are Later unless Part 1 moved them.

### Removing Workspace's Planner and Calendar

Last, in one change, only after this list passes in Plan:

| Workspace Planner and Calendar today | Must exist in Home first |
| --- | --- |
| Today's events and all-day items | Today, Plan day detail |
| Quests with a tick through the server | Today (slice A), Plan |
| Study this, filling the session's plan | Today, Plan, and the Timer's picker |
| Goals with progress | Plan |
| Month with changes remembered | Plan, in the Home snapshot |
| Day selection | Plan |
| Add an event | Plan |
| The honest note about AI plans | Plans view |

**Changes, all checked against source when made.**

- `packages/spaces/src/workspace/tools.ts`: remove both from `TOOL_IDS` and `TOOLS`. `parseWindow` drops unknown tools, so old snapshots survive. Add a test with a stored snapshot holding them, including the layout's saved arrangement.
- `apps/sylf/src/spaces/workspace/`: `ToolHost.tsx`, `icons.ts`, `data/contracts.ts`, `data/index.ts`, `data/sample.ts`, `tools/PlannerTool.tsx`, `tools/CalendarTool.tsx`. Move `mapPlanner`, `mapCalendar` and `monthRange` to Home's data. Do not leave a copy.
- **Alt+1 to 9 and Alt+0 shift with the tool order.** Update the [Workspace guide](../workspace/README.md) §3 and the hint text.
- `apps/desktop/src/workspace-check.mjs` (`TOOL_IDS`, line 540's sweep), `session-check.mjs`, `journey-check.mjs`, `tooling/checks/android-memory-check.mjs`.
- [Workspace guide](../workspace/README.md) §5, master plan §2.2.

Timer's quest list is a session picker, so it stays in Workspace (E-12), and reads Home's `today` resource.

**Done when.** A student can arrange their whole week on Native. A quest refused on a rest day says why, and the rest day can be changed from the same place. The parity list passes, Workspace has eight tools, and no restored Workspace shows a broken window.

**Update:** [Home guide](../home/README.md), [Workspace guide](../workspace/README.md), new `documentation/native/plan/README.md`, [Calendar contract](../../calendar/README.md) if web changed, the journey.

---

## Slice D — Progress and Codex

| Build | Owner | Notes |
| --- | --- | --- |
| Stats | `detailed-stats?summary=true`, then `sessionLog` paged by `sessions` | 7- and 30-day rhythm, subjects, objectives, daily target. Never the full 186 KB read |
| Rankings | `user/rankings` | Global and friends, four orderings, personal standing. Hidden stays hidden |
| Achievements | `achievements`, `lib/achievements-catalog.ts` | Full catalog and categories. **Claim all** fixes the double tap, one request each through the server |
| Attributes | `lib/cognitive-stats.ts`, `cognitive-stats/invest` | Investing through the server |
| Skills | `lib/skill-tree.ts`, `skills`, `skills/unlock` | Attributes and skills only. Subject constellations, `compile` and `forge-apex` moved to Later: heavy, a canvas, and a paid call |
| Codex | `lib/archive-catalog.ts`, added to `@sylf/shared` behind `import()` | Chapters, search, unlock rules from the catalog. No copy of its content. `lib/ai/sylvie/knowledge.ts` keeps reading the same source |
| Currency | `sylph` on `user/stats` | One quiet line. Not `currency/stats`, which reads whole ledgers (P-11) |
| Level-up | `user/stats` change after settlement | One restrained moment, never a celebration screen, and never a computed reward |

**Backend.** `P-7`: check the leaderboard's cached value at a realistic size. Keep S-8's per-viewer filter.

**Done when.** A student can answer "am I studying enough?", "how do I compare?" and "how does this work?" from Progress. Every number comes from the server or a shared catalog. `Claim` cannot double-fire.

**Update:** new `documentation/native/progress/README.md`, [Home guide](../home/README.md).

---

## Slice E — Account and profile

| Build | Owner | Notes |
| --- | --- | --- |
| Identity | `user/account`, and `user/stats` for reading: it already holds every account field, and `contracts.ts` only needs widening | Name, username, email, timezone. Email change as step 0 left it |
| Security | `user/security`, `user/security/send-code`, `hasPassword` on `user/stats` | `code: "password_incorrect"` is already handled. No 2FA: it is a 501 stub. An OAuth-only account has no password, and `logout-all` needs one if set |
| Password reset | New small route over `lib/email.ts` and `VerificationToken` | Only if E-3 says so, and only after U-4. Neutral answers, rate limited, tokens single use |
| Devices | `user/sessions`, `auth/logout-all` | This device marked. Ending one really revokes it (S-2) |
| Connected accounts | `user/connections` | Show and unlink. Linking through the system browser only if Part 1 proved it. `link` is a 501 stub |
| Danger zone | `user/account/delete`, `user/reset-progress`, `user/security/send-code` | Must (A-17). A verified account confirms with an emailed code, and an unverified one with its password. Two-step, plain words, and a journey test |
| Privacy | `user/privacy`, `lib/privacy.ts` | Three levels: Public, Friends, Private. `GROUPS` exists in code and **not in the database enum, so never offer it** |
| Notifications | `notifications/preferences` | With the local notification permissions |
| Study preferences | Slice C's schedule, slice B's modes | Reached from here too, with no second copy |
| Appearance | Theme Studio in `packages/design-system/src/studio` | Out from behind `DEV_TOOLS`. **Decision:** Native's appearance stays on the device, and is seeded once from `activeTheme` and `activeBackground` when they hold a real custom color. Native's six themes aren't web's, so writing back would corrupt web's preference. `POST /api/cosmetics` stays unused for this |
| Profile | `profile/customization` after U-2, `profile/[username]`, `profile/stats`, `characterConfig` | Bio, frame, title, aura, name color, links, chosen from what is owned. Banner and avatar through approved hosts. Buying stays in World (H1, Phase 15). Avatars are prerendered sprites, with initials as the fallback |

**Sign-out and account change.** ADR 0011's table says what goes. Everything added in this part must be on it, and the journey's change-of-account scan must cover every new surface.

**Done when.** No statement in `AccountSheet` still says a thing needs the web, other than the ones the owner chose. Deleting an account works and leaves nothing on the device. A profile shows the same to a friend on Native as on web.

**Update:** new `documentation/native/account/README.md`, [backend guide](../backend/README.md), [ADR 0012](../decisions/0012-connected-app.md) decision 17.

---

## Dependencies

Part 1's blueprint, spikes and approved dependencies. The owner's decisions above. A tablet authorization, for slice gates that need Hermes.

## Risks

| Risk | Response |
| --- | --- |
| Step 0 repairs touch live routes | Reproduce first, check what real rows hold, stop if anyone would lose something |
| R20: extraction disturbs web's timer | Narrow move, web's suites before and after, no behavior change, stop if a test changes meaning |
| R23: heartbeat turns HP on | HP first, called out in the report |
| R17: Home's memory | Sub-views lazy. Budgets per destination |
| Mode sessions and old records | `.v1` reader tested with real stored shapes. A running session across the upgrade survives |
| Removing tools loses a saved layout | Tested stored snapshot, and the rest of the layout survives |
| Calendar's edit logic is deep | Follow the contract's revisions and retries. Do not simplify away conflict handling |
| Scope | Finish Musts first in each slice. A Should can move to Later with a written reason |

## Deliverables

Slices A to E. New guides. `reports/expansion-part-2/report.md`, with evidence. `handoffs/expansion-part-2.md`. An updated [feature map](feature-map.md).

## Testing

[Stage plan §9 and §10](README.md#9-quality-gates). In addition:

- A table-driven test for all seven modes against web's expected phases.
- The session owner test: a search, in a test, that no surface in `native/` calls `Date.now` to keep session time outside `model.ts`.
- An integration test for every new mutation, on an empty account and a full one.
- Journey additions: onboarding, a week arranged, a Pomodoro with one break, a quest created, a profile changed, sign-out with nothing left.
- A repeat of the probes' refusals as permanent tests: ownership, blocked, oversized, unowned cosmetic, hostile address.
- Full Workspace check after the tools leave.

## Completion criteria

1. Every Must in slices A to E is built and verified on Electron, and on the tablet if authorized.
2. Workspace's Planner and Calendar are gone, and nothing was lost.
3. All seven modes match web, and web's timer behavior did not change.
4. One session owner still holds.
5. The full local set passes on a named commit, with no new failure.
6. Budgets from Part 1 are met or the owner accepted the difference.
7. The owner has reviewed. **Stop here.**
