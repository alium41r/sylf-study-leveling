# Sylf Native — Stage 2 handoff (Phases 4 to 10)

**Written 31 October 2026, at the end of Phase 10. Read this first in a fresh session.** It is self-contained: a new agent needs only the repository. Source, tests and configuration win over any prose that disagrees. For the stack's reasoning and this Mac's setup, the [Stage 1 handoff](stage-1.md) is still current.

**Status: Phase 10 is complete on the Mac and awaiting the owner's review. Milestone 1 is reached on the Mac: a navigable, polished native app with all three Spaces, with no backend. Phase 11 must not start without the owner's approval. Tablet verification must not start without their explicit authorization.** No Sylf Native code has been committed. All of `native/` and `documentation/native/` is untracked.

## 1. How this project is run

- **The owner briefs one phase at a time.** Each is completed, reported and approved before the next starts. Never build ahead of the current phase. The brief takes precedence over any plan, including this file.
- **A fresh session starts after each stage.** Stage 3 is Phases 11 to 13, and its last phase writes the next handoff.
- **Keep current as you work:** the [master plan](../master-plan.md) and its status log, [decision records](../decisions/), each feature's guide, and `reports/phase-<n>/report.md` with evidence beside it.
- **Label planning statements** Confirmed (owner), Proposed or Open.
- **Preserve the owner's work.** The repository has hundreds of uncommitted edits in the web app. Leave them alone, and do not commit anything without authorization.
- **Ask before** installing substantial dependencies, deleting experimental files or caches, or changing device or system settings.
- **Run heavy work one at a time.** This Mac has 8 GB and sits deep in swap. Never run two Electron checks together, or Gradle beside anything.

**Sylf Native is a redesigned frontend over the existing Sylf Web backend, not a new product (Confirmed, owner).** Before adding a feature, name the existing model, route or `lib/` owner. A feature needing significant backend work is deferred and written down ([master plan §7.3](../master-plan.md#73-scope-boundaries)). The native additions already named there (native auth, device sessions, World persistence) stay in scope.

**The tablet (Confirmed, owner).** It stays out of bounds until the owner explicitly authorizes it, which is a separate decision from approving Phase 10 or starting Phase 11. No `adb`, not even `adb devices`. Do not imply that a Mac result proves device behavior. Everything for that day is in the [tablet checklist](tablet-checklist.md).

**The game (Confirmed).** No islands, terrain, biomes, maps, characters, gameplay or engine before Phase 15.

## 2. The product today

| Space | What exists | Real now | Template or reserved |
| --- | --- | --- | --- |
| **Shell** | The Spaces switcher, the timer dock, restoration, shortcuts on desktop | All of it | Tablet hardware keys |
| **Home** | A rail with Today, Focus, Circle and Progress | Navigation, and study sessions in Focus | Everything else is sample data, marked |
| **Workspace** | A finite dotted canvas, a Command Center, ten tools, free windows, presets, restoration, suspension | The window manager, the Calculator and the Timer | The other tools are shells on sample data |
| **World** | A lobby at the gate, four sections, six skies, a walk through the gate, a stand-in host | Navigation, skies, the host lifecycle and its failures | The game (Phase 15) |

Six themes (Signature, Studio, Arcane, Voxel, Cozy, Student) in two modes, plus custom accent and grounds, run everywhere. The Showcase and Theme Studio sit behind a development-only entry, because no account or settings surface exists until Phases 11 and 12.

## 3. Final architecture

```
native/
├── apps/sylf/src/
│   ├── App.tsx             creates every long-lived object outside React, and joins the providers
│   ├── shell/              SpacesShell, SpacesSwitcher, SpaceStage, TimerDock, shell-keys, session/SessionParts, context, links
│   ├── spaces/home/        rail, destinations, data adapters
│   ├── spaces/workspace/   canvas, windows, Command Center, tools, data adapters
│   └── spaces/world/       lobby, scene, panels, art, stand-in host, data adapters
├── apps/desktop/src/       Electron host and the seven checks
├── packages/
│   ├── spaces/             no UI: contracts, store, home, workspace/, world/, session/
│   ├── design-system/      Aloft: theme engine, components, Theme Studio
│   ├── platform/           capabilities and adapters
│   ├── native-platform/    Expo module
│   ├── shared/             the only door into ../lib
│   └── phone/              reserved
└── tooling/                boundaries, Android checks, world-art
```

**The pattern, used four times.** A long-lived object lives outside React, created once in `App.tsx`, because Android can recreate the root and the first frame must already be right. It has pure functions under it, it is tested with no renderer, and screens call its actions and read it through `useSyncExternalStore`.

| Object | Owns | Persisted |
| --- | --- | --- |
| `createAppearanceStore` | The theme preference | Its own key |
| `createSpacesStore` | Active Space, return Space, each Space's snapshot, World's phase | `sylf.native.spaces.v1` |
| `createHomeNavigation`, `createWorkspaceModel` | Home's and Workspace's state, written through the store | In the Spaces snapshots |
| `createWorldController` | The only thing that talks to a host or moves World's phases | The `world` snapshot |
| `createStudySessionModel` | The one study session | `sylf.native.study-session.v1`, at once |

**Mounting.** One Space is mounted at a time, and each is a separate `import()`. Inside a Space, what is switched often stays mounted and hidden. World and its host are chunks of their own, and the boundary audit enforces that.

**Data.** Screens read view models from a `useXResult()` hook, never sample data. Each result carries `provenance`, which drives the Sample notices. Without `DEV_TOOLS` the empty adapter binds, so a store build cannot show sample content. **`build:web` and `build:android` set `DEV_TOOLS` today, and Phase 17's store pipeline must not.**

**Phase 13 replaces one binding point per Space:** `spaces/home/data/index.ts`, `spaces/workspace/data/index.ts`, `spaces/world/data/index.ts`. Nothing above them changes.

## 4. Phase by phase

| Phase | Delivered | Decisions | Report |
| --- | --- | --- | --- |
| 4 | Aloft: a theme engine of independent axes, solved contrast, six themes, a Theme Studio, a component library | [ADR 0003](../decisions/0003-design-system-and-theme-engine.md) | [Report](../reports/phase-4/report.md) |
| 5 | The Spaces store and switcher, restoration, World's exit flow, lazy Spaces. Tablet memory rules | [ADR 0004](../decisions/0004-global-spaces-shell.md) | [Report](../reports/phase-5/report.md) |
| 6 | Home's rail and four destinations on typed sample data. The backend compatibility rule | [ADR 0005](../decisions/0005-home-interface-template.md) | [Report](../reports/phase-6/report.md) |
| 7, 8 | Workspace: canvas, Command Center, ten tools, windows, presets, restoration, suspension | [ADR 0006](../decisions/0006-workspace-canvas-and-windows.md) | [7](../reports/phase-7/report.md), [8](../reports/phase-8/report.md) |
| 9 | World's lobby, an engine-agnostic host, failure paths, isolation, an art pipeline | [ADR 0007](../decisions/0007-world-lobby-and-host.md) | [Report](../reports/phase-9/report.md) |
| 10 | One study session, the Universal Timer Dock, shortcuts, device adaptation, a pass across all three Spaces | [ADR 0008](../decisions/0008-study-session-and-timer-dock.md) | [Report](../reports/phase-10/report.md) |

The contracts are the [design guide](../design/README.md), [component reference](../design/components.md), [Spaces guide](../spaces/README.md), [Home guide](../home/README.md), [Workspace guide](../workspace/README.md) and [World guide](../world/README.md).

## 5. Product decisions

**Confirmed by the owner.** An original visual language: the web is a reference for functionality, branding and preferences, never for layout. Three Spaces with one switcher. A finite dotted canvas. World's art is authored and independent of the appearance theme. **The Phase 9 gate is the main lobby image.** One authoritative timer. Game time never counts as study (G1). Sylf Native is a frontend over the existing backend.

**Built to a proposed default, and still the owner's to settle.** These are decisions someone will otherwise assume are final.

| ID | Question | Built as |
| --- | --- | --- |
| W1 | What "Workspace" is called against Study Workspaces | The Space is the environment, and a saved context opens inside it |
| W2 to W5 | Saved contexts, dock placement, small windows, canvas details | [ADR 0006](../decisions/0006-workspace-canvas-and-windows.md) |
| H1 to H3 | Locker and Shop, Planner in Home, Sylvie in Home | Locker and Shop in World, summaries in Home, a quick-ask later |
| G2, G4 | Social model, small windows | Single-player first, entry disabled below 600 × 420 pt |
| T1 | The sixth theme's name | Student, keeping the `student` id |
| Phase 10 | The dock's place, lengths, Keep going, shortcuts, tablet compact layouts | [ADR 0008](../decisions/0008-study-session-and-timer-dock.md) |

G3 (device floor and download size) stays open for Phase 15.

## 6. The study session, for Phases 11 to 13

This is the part of Stage 2 that Stage 3 touches first, so it is worth reading the [Spaces guide §10](../spaces/README.md#10-the-study-session-and-the-timer-dock) and [ADR 0008's backend map](../decisions/0008-study-session-and-timer-dock.md#backend-map) in full.

- **`createStudySessionModel` is the only owner.** Screens hold no time. Do not add a second source.
- **Time is `TimerSnapshot` v2 from `lib/timer-engine.ts`,** unchanged.
- **What is kept:** an active session with `clientKey`, `startedAt`, `snapshot` and `operations`, and the last 12 ended sessions, all with `saved: false`.
- **`operations` match `lib/timer-sync.ts`:** `id`, `action`, `sequence`, `focus`, `breaks`, `at`, with a deterministic END id. They are cumulative.
- **Not built:** subject and quest ids (only display strings exist), breaks, a server `sessionId`, and an account owner. The web journal's keys are `sylf_timer_journal_v1:<owner>:<clientKey>:`, so a session made before sign-in needs a decision: it has no owner. **Decide this in Phase 11.**
- **Never compute rewards here.** `SessionService`, settlement and the atomic RPCs own them. A saved record appears only after the server accepts it, and "Tracked on this device" must stay until then.
- **Native needs a journal adapter.** `lib/timer-sync.ts` relies on `localStorage`, Web Locks and visibility events, so it is not on the `@sylf/shared` allow-list. `SessionProtocolV2` looks portable, and `lib/planner/v2/session-client.ts` pulls in `zod` contracts only, which still needs auditing.

## 7. Technical risks

| Risk | State |
| --- | --- |
| **Nothing since Phase 8 has run on a device** | The largest. Worklets run on the JavaScript thread on Electron, so no motion result here proves the UI thread. `LobbyScene.tsx` and the dock use transforms, closures and derived values that have only run on the JavaScript thread |
| R1 Native authentication | Open, and Phases 11 and 12's main work. Web sessions are cookie-only and the bearer path was removed on purpose, so this touches every protected route |
| R6 Game engine | Open for Phase 15. No engine was evaluated, and the host contract names none |
| R9 Background timer | The local half is done. No notification exists when a countdown ends in the background, and no foreground service |
| R12 Multitasking on tablets | Prepared and measured in Electron at ten window shapes. Never run on a device |
| R15 Native memory per mount | Open. The bare reproduction has never run. The dock adds a few mounts at startup and one on first open |
| GPU memory after repeated Workspace entries | Reaches a fixed 159 MB budget on an older build. Not explained, and no effect on frames so far |
| The heap's slow rise across World visits | About 0.5 MB over seven visits, too short a run to tell a leak from a plateau |
| iOS and iPadOS | Never built or run. No Xcode on this Mac, by the owner's choice |
| Windows | Not run |
| TalkBack and VoiceOver | Never run. Roles and labels are checked in the DOM only |
| Release | The APK uses the public debug key and carries `SYSTEM_ALERT_WINDOW`, and a store build must not set `DEV_TOOLS` |

## 8. Rules that keep biting

Each of these came from a measurement or a real failure.

**Memory and rendering**

1. Never animate the size of a surface with a `boxShadow`. The GPU keeps a target for each size: 137 MB after 30 opens. Use a transform, and put the shadow on a still layer.
2. Never put a full-window SVG on screen: 50 MB, against about 9 MB for tiles.
3. Keep what is switched often mounted and hidden: opacity 0, no touches, out of the accessibility tree, and `visibility: hidden` on web. Never `display: none`, because Fabric drops the views.
4. A tool, a page or a clock runs only when seen. Derive time from epochs, so stopping loses nothing.
5. The camera is one transform on one view. While something moves, shared values are the truth. At rest, the model is.
6. Nothing is scheduled when nothing moves. No looping animation in a settled screen.

**Accessibility and text**

7. Words are `soft` or stronger. `faint` is 3:1, for marks.
8. Text over art is measured against rendered pixels, or sits on a plate.
9. Set `tabIndex` on web only. On Android a `tabIndex` of -1 hides a control from TalkBack.
10. A `radio` needs a `radiogroup`, and a `Chip` in one takes `radio`.

**Platform traps**

11. `data-*` props do not reach the DOM on react-native-web. Use `dataSet`.
12. A `ScrollView` grows to fill a row on react-native-web and ignores its `width`, so put the width on a wrapper.
13. `StyleSheet.absoluteFill` does not size an `Image` on the web.
14. Use `event.absoluteX` under a transform.
15. Platform files are reached through relative imports. Metro does not apply extensions to package `exports` targets.
16. `TravellingMarker`'s `baseline` measures from the bottom. `IconButton` aligns to the start.
17. A menu returns focus to its anchor when it closes, so anything that reveals on focus must check `getInputMode()`.

**Testing**

18. On this Mac an Electron window is at most about 746 pt tall, so read `innerHeight`.
19. Plant saved state from a page with no app on it, because the app saves as it unloads.
20. `npm run verify` stops at the first failure and builds last, so **a failed verify leaves an old build in place.** Do not run an Electron check after one, because it will test the old code. It wasted two full runs in Phase 10.
21. A test id starting with `tool-` is counted as a mounted tool by the Workspace check.
22. A preset from an app link runs before Workspace has measured itself. Use the keys in a check, and `model.summon` in the app.
23. Never start two shell commands at once that use `cd`. They share a working directory.
24. A check that fails while the Mac is short of memory may be timing. Check swap, and run it again before reading it as a bug. Say so in the report when you do: a rerun that passes is evidence, not proof.
25. `pdftoppm` is not installed. Use a short Swift script with PDFKit for PDFs, and AppKit for contact sheets.

## 9. State of verification

**Mac: finished, on the final code, with one caveat.** `npm run verify` passes with 268 tests. Electron Session passes 113 of 113, World 189 of 189, Home 72 of 72, Spaces 52 of 52, and Design and the security self-test pass. The Android build compiles at 33.8 MiB and was not installed. Details are in the [Phase 10 report](../reports/phase-10/report.md).

**The caveat.** Workspace passes all 19 groups when run in three parts, and it passed 184 of 184 whole on the build just before the last small change. It did not pass whole on the final code. Long runs failed in ways that moved around on this swapped Mac, and every failure passed on a rerun. That points to memory pressure, but it is an inference, and [§3 of the report](../reports/phase-10/report.md#3-electron-on-macos-electron-4510-macbook-air-m1-8-gb) lists each one. Run the whole Workspace check once on a freshly restarted Mac.

**Measured on the Mac:** one clock timer, about 2 DOM changes a second with a session running, 0 in any hidden view, 0 with no session, flat nodes and listeners over 12 panel opens, panel frames p95 18.1 ms.

**Tablet: nothing from Phases 9 or 10 has run there, and neither has the final code of Phases 7 and 8.** Android compiling proves nothing about behavior on a device.

## 10. Instructions for Phase 11

**Prerequisite:** the owner reviews Phase 10 and briefs Phase 11. The brief takes precedence over everything here. The tablet is a separate authorization, and the [checklist](tablet-checklist.md) can run before, during or after Stage 3 as the owner chooses.

**What the plan says.** Stage 3 is Backend Integration, Phases 11 to 13. [Master plan §1.4](../master-plan.md#14-delivery-sequence) gives the sequence, and §5.4 says Phase 11 audits the typed interfaces against the real APIs. §6.2 says the roughly 148 API route handlers need an audit for native clients. R1 says native authentication is designed across Phases 11 and 12.

**Read first.** [`AGENTS.md`](../../../AGENTS.md), [master plan §5 to §8](../master-plan.md#5-intended-technical-architecture-and-performance-principles), the backend tables in each feature guide, [ADR 0008's backend map](../decisions/0008-study-session-and-timer-dock.md#backend-map) and the [timer contract](../../timer/README.md).

**Where to start.**

1. The four `data/contracts.ts` files are the audit's input: `spaces/home/data`, `spaces/workspace/data`, `spaces/world/data`, plus the session's record. Each field names its owner. Compare them with the real routes, and write down every difference.
2. Decide who owns a session made before sign-in (§6).
3. Keep the web app, schema and production data untouched unless the brief scopes a change. Any change to `lib/` must keep web imports working, and goes through `@sylf/shared`'s allow-list and the boundary audit.
4. Leave the Sample and Not saved labels in place until the real data behind each is flowing. They are driven by `provenance` and `saved`, so they go on their own.

**Keep in place:** one session owner, the phases in `world.ts`, the host contract, the rule that nothing imports World statically, the `provenance` pattern, and the rule that a store build shows no sample content.

## 11. Commands (run from `native/`)

```bash
npm run verify
```

```bash
npm run web
```

```bash
SYLF_SESSION_CHECK_OUT=<dir> npm run desktop:session-check
```

```bash
node tooling/world-art/render.mjs
```

The Electron checks are `desktop:self-test`, `desktop:design-check`, `desktop:spaces-check`, `desktop:home-check`, `desktop:workspace-check`, `desktop:world-check` and `desktop:session-check`, each with its own `*_OUT` variable. `SYLF_WORKSPACE_CHECK_ONLY`, `SYLF_WORLD_CHECK_ONLY` and `SYLF_SESSION_CHECK_ONLY` run named groups. The session check's groups are `sync`, `restart`, `finish`, `world`, `keys`, `a11y`, `sizes`, `themes`, `motion`, `renders`, `frames` and `retention`. Each script rebuilds first, or run `npm --workspace @sylf/desktop run <name>-check` against a build you trust. A full pass of everything takes about an hour here. Pause between checks, and prefer `SYLF_WORKSPACE_CHECK_ONLY` parts when the Mac is short of memory.

Android builds need `JAVA_HOME` and `ANDROID_HOME`, from the [tablet checklist](tablet-checklist.md#before-starting). A build takes about 4 minutes and uses no device. Root `npx tsc --noEmit` needs `NODE_OPTIONS=--max-old-space-size=4096` on this Mac, and the root's known baseline of 35 to 36 failing tests is unrelated to this work.
