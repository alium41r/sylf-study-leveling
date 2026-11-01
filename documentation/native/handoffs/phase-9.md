# Sylf Native — Phase 9 handoff

**Written 31 October 2026. Phase 9 is complete on the Mac and awaits the owner's review, as do Phases 7 and 8. Tablet verification is deferred until after Phase 10, and Phase 10 must not start without the owner's approval.** This file is self-contained: a fresh session needs only the repository. Source, tests and configuration win over any prose that disagrees. Read this, then the [World guide](../world/README.md), [ADR 0007](../decisions/0007-world-lobby-and-host.md), the [Spaces shell guide](../spaces/README.md), the [design system guide](../design/README.md) and [`AGENTS.md`](../../../AGENTS.md). For the stack and this machine, the [Stage 1 handoff](stage-1.md) is still current.

## 1. How this project is run

The owner briefs one phase at a time, and each is completed, reported and approved before the next starts. Never build ahead of the current phase. Keep the [master plan](../master-plan.md) status log, [decision records](../decisions/) and phase reports current, and write a self-contained handoff at the end of each phase. Label planning statements Confirmed, Proposed or Open. Preserve the owner's many uncommitted edits, leave the web app, backend and database alone, and **ask before** installing substantial dependencies, deleting experimental files, or changing device or system settings. Nothing is committed, and all of `native/` and `documentation/native/` is untracked.

**Sylf Native is a redesigned frontend, not a new backend (Confirmed).** Before adding a feature, name the existing model, route or `lib/` owner it will use. A feature needing significant backend work is deferred and written down. See [master plan §7.3](../master-plan.md#73-scope-boundaries).

**Mac only until Phase 10 is complete (Confirmed, owner, 31 October 2026).** Do not connect to, install on, or test using the Samsung tablet. No `adb`, not even `adb devices`. All tablet verification waits until after Phase 10, when the owner explicitly authorizes it. An Android Gradle build runs on the Mac and is allowed. The deferred checklist is in the [Phase 8 handoff §6](phase-8.md#6-tablet-checklist-deferred-until-after-phase-10), and it is still current, with the World additions in §6 below.

**The real game waits for Phase 15 (Confirmed).** No islands, terrain, biomes, maps, characters, gameplay or engine before then. The owner's visual direction, `assets/design-references/sylf world design assets.pdf`, is the primary reference for World's identity, and most of it is kept for that phase. Its pages are images, so read it by rendering them: `pdftoppm` is not installed, and a short Swift script with PDFKit works.

## 2. What Phase 9 delivered

- **A lobby.** A vermilion and teal gate on a stone dais above a sea of cloud. Six skies, with stars at Night and petals in the air. Four sections: Gate, Traveller, Collection, Preparations.
- **A walk through the gate.** The view heads for the opening as its light fills the window, with a loading plate reporting the host's progress.
- **A host contract.** `WorldHost`: `initialize`, `load`, `suspend`, `resume`, `save`, `exit`, `dispose`, `memory`. No engine is named.
- **A controller.** `createWorldController(store, options)` is the only thing that talks to a host or moves World's phases. It is created outside React in `App.tsx`.
- **Failure paths.** A failed load returns to the lobby. A failed save returns to the menu, with Try again and Leave without saving. Deadlines of 30 s and 15 s. A host cannot trap anyone.
- **A resource scope.** Whatever a host holds is released however it ends.
- **Isolation.** World and its host are chunks of their own, enforced by the boundary audit and proven from the network.
- **An art pipeline.** `tooling/world-art/`: a voxel ray tracer with no dependencies. Run `node tooling/world-art/render.mjs` from `native/`.
- **G1, G2 and G4** built to their proposed defaults.

## 3. Finalized decisions

All 31 are in [ADR 0007](../decisions/0007-world-lobby-and-host.md). The ones later phases will meet most:

- **World's art is authored, like a document, and does not follow a theme.** The interface is the person's own theme solved against the sky, through `ThemeScope`.
- **Text over art is measured against rendered pixels.** A solved palette proves nothing on a gradient. Anything new over art needs this, or a plate.
- **A host never touches the store.** The controller drives the phases.
- **A receipt is a pointer, never a save.**
- **The lobby's scene unmounts once someone is through the gate.** A game never shares memory with it.
- **Nothing is scheduled when nothing moves.**

## 4. Rules from earlier phases that still apply

Keep what is switched often mounted and hidden, with opacity 0, no touches, out of the accessibility tree, and `visibility: hidden` on web, never `display: none`. No animated size on a surface with a shadow. No full-window SVG. `tabIndex` on web only. Text is `soft` or stronger. `provenance` drives notices. Real where it can be, disabled and explained where it cannot. Plant saved state from a page with no app on it. The camera is one transform on one view. A tool runs only when seen. While something moves, shared values are the truth. `data-*` props do not reach the DOM on react-native-web, so use `dataSet`. Use `event.absoluteX` under a transform. On this Mac an Electron window is at most about 746 pt tall, so read `innerHeight` in checks.

New from this phase:

1. **A `ScrollView` grows to fill a row on react-native-web, and ignores its `width`.** Put the width on a wrapper.
2. **`StyleSheet.absoluteFill` does not size an `Image` on the web.** Give it a width and a height.
3. **`ThemeScope` now honors system accessibility settings.** It did not before.
4. **Never start two shell commands at once that use `cd`.** They share a working directory, and they raced in this phase.
5. **A check that presses a key "during" a phase needs a margin.** Press it as the phase begins.

## 5. State of verification

**Mac: finished, on the final code.** `npm run verify` passes with 223 tests. Electron World passes 189 of 189, Workspace 184 of 184, Home 71 of 71, Spaces 52 of 52, and Design and the security self-test pass. The Android build compiles at 33.7 MiB. Details are in the [Phase 9 report](../reports/phase-9/report.md).

**Measured on the Mac:** 30 scene updates a second, 12 on stepped themes, 0 with reduced motion or Drift off. Lobby frames p95 18.3 ms. Nothing runs after leaving. DOM nodes and listeners are flat across seven visits. The heap rose by 0.5 MB, which a run this short cannot explain.

**Tablet: nothing from this phase has run there.** The final code from Phases 7 and 8 has not either.

## 6. Added to the deferred tablet checklist

**Superseded by the consolidated [tablet checklist](tablet-checklist.md), which includes everything below.**

**Do none of this until Phase 10 is complete and the owner explicitly authorizes it.** Add these to [Phase 8 handoff §6](phase-8.md#6-tablet-checklist-deferred-until-after-phase-10), after a normal build.

**Automated.** `android-spaces-check` was edited for the new title and has not run. World's memory sweep already exists:

```bash
npm run android:memory-check -- --sweep=world --cycles=24 --rest-every=6 --wait=800 --budget-native=10 --out=<file>
```

**By hand, with the owner.**

| # | Try | Pass if |
| --- | --- | --- |
| 1 | Open World, and leave it open for a minute | Clouds and petals move evenly, and the tablet stays cool |
| 2 | Every section by touch, and Back on an open panel | Back closes the panel first |
| 3 | Enter, pause, save and leave | The walk is smooth, and it returns to the Space you came from |
| 4 | Change the sky in Preparations | The crossfade is clean, with no flash |
| 5 | Turn on reduced motion in Android settings | Nothing drifts, and the walk becomes a fade |
| 6 | Rotate and use split screen across 600 pt | Layout follows, nothing remounts visibly, and entry is disabled under the minimum |
| 7 | Look at the status bar on a dark sky | Icons stay readable |
| 8 | Background the app in play, then return | The menu is waiting |

**Watch for:** worklets on the UI thread, which are the largest risk. `LobbyScene.tsx` uses `Math.sin`, closures and a derived value in worklets, and all of that has only run on the JavaScript thread. If plates cost too much native memory, shrink the gate and sea first in `scenes.mjs`.

## 7. Known limits and unfinished work

Listed in full in the [Phase 9 report](../reports/phase-9/report.md#8-limitations-and-untested-behavior). The ones that matter most:

- **The lobby has never run on a device.**
- **Risk R15 stays open,** and the lobby adds mounts. Its bare reproduction has never run.
- **Risk R6 stays open.** No engine was evaluated.
- **Contrast was measured on two themes in every sky.** Short and compact layouts were not measured.
- **Dusk passes contrast by a thin margin.**
- **The heap's 0.5 MB rise over seven visits is unexplained.**
- **Owner decisions outstanding:** the lobby itself, the art, and ADR 0007's Proposed items, plus W1 to W5, H1 to H3, G1, G2 and G4 as built, and T1 (Student or Scholar).
- **For release:** the APK uses the public debug key and carries `SYSTEM_ALERT_WINDOW`, and a store build must not set `DEV_TOOLS`.

## 8. Prerequisites for Phase 10

**Prerequisite:** the owner reviews Phase 9 and briefs Phase 10. The brief takes precedence over this list. Tablet verification is not a prerequisite for starting it, and it follows Phase 10.

Phase 10 ends **Milestone 1** ([master plan §1.4](../master-plan.md#14-delivery-sequence)): a fully navigable, visually polished native app with all three Spaces, working navigation and the Command Center, and empty feature templates, with no backend integration. It also ends Stage 2, so **a Stage 2 handoff covering Phases 4 to 10 is due** ([native index](../README.md#stage-handoffs)).

What the plan leaves for Phase 10:

1. **Direct Space shortcuts:** a modifier plus 1, 2 or 3, checked against iPadOS and Android system shortcuts ([master plan §3.1](../master-plan.md#31-sylf-spaces-switcher)). Workspace keeps Alt for tools for this reason.
2. **Compact windows:** whether a compact window on a tablet shows the tablet's compact layouts or the phone companion ([§4.4](../master-plan.md#44-window-size-classes-not-device-types)). Home, Workspace and World all have compact layouts today.
3. **Tablet multitasking:** rotation, split screen and pop-up windows across all three Spaces ([§4.2](../master-plan.md#42-tablet-primary-native-target)). The app side can be prepared on the Mac. The device side waits.
4. **A pass across all three Spaces** for transitions, polish and consistency. Spaces have been reviewed one at a time and never together.
5. **The owner's outstanding decisions** in §7, which Milestone 1 should settle.

Keep in place: the phases in `world.ts`, the host contract, and the rule that nothing imports World statically.

## 9. Commands (run from `native/`)

```bash
npm run verify
```

```bash
npm run web
```

```bash
SYLF_WORLD_CHECK_OUT=<dir> npm run desktop:world-check
```

```bash
node tooling/world-art/render.mjs
```

The other Electron checks are `desktop:self-test`, `desktop:design-check`, `desktop:spaces-check`, `desktop:home-check` and `desktop:workspace-check`, each with its own `*_OUT` variable. `SYLF_WORLD_CHECK_ONLY=<groups>` runs part of the World check, from `look`, `nav`, `sky`, `flow`, `faults`, `blocks`, `motion`, `isolation`, `a11y`, `contrast`, `sizes`, `themes`, `frames` and `retention`. The full World check takes about 5 minutes, and the Workspace check about 9. Run Electron checks one at a time. When the Mac is short of memory they can stall or fail on timing, so check swap and run a failure again before reading it as a bug. An Android build takes about 4 minutes and needs `JAVA_HOME` and `ANDROID_HOME`. Root `npx tsc --noEmit` needs `NODE_OPTIONS=--max-old-space-size=4096` on this Mac. Root web checks are unchanged, and the known baseline of 35 to 36 failing root tests is unchanged.
