# Sylf Native — Phase 9 report: World Lobby and Foundation

**31 October 2026. Status: complete on the Mac and awaiting the owner's review. Tablet verification is deferred until after Phase 10.** Decisions are in [ADR 0007](../../decisions/0007-world-lobby-and-host.md), the contract is the [World guide](../../world/README.md), and the entry point for the next session is the [Phase 9 handoff](../../handoffs/phase-9.md).

**Read this first.** Everything here ran on the Mac. The Android build compiles, and it has not run on any device. On Electron, worklets run on the JavaScript thread, so nothing below proves the lobby's motion on a tablet's UI thread. There is no game: the World host is a stand-in whose loading stages are short pauses, and the screen says so.

## Summary

| Deliverable | Result |
| --- | --- |
| A polished, interactive pre-game lobby | Built. A gate over a sea of cloud, six skies, four sections, a walk through the gate |
| An engine-agnostic World foundation | Built. One interface with eight methods and no engine named, a controller, and a resource scope |
| Functional navigation and honest placeholders | Built. Reserved rows cannot be pressed, the way in carries a Preview badge, sample data is marked |
| Integration with Spaces and the design system | Built. The phases and the return to the previous Space are unchanged. Every theme carries over with no theme branch |
| Mac tests and Electron regressions | **Pass.** See §2 and §3 |
| Screenshots and performance findings | [33 screens](evidence/screens/), §4 |
| Documentation and handoff | Written |
| Android build | Compiles: APK 33.7 MiB (Phase 8: 30.4). **Not run** |
| iOS, Windows | Not built or run |
| Web app, backend, database | Unchanged. Nothing is committed |

## 1. What was built

```
native/packages/spaces/src/world/
├── host.ts            WorldHost, receipts, progress, the resource scope
├── controller.ts      createWorldController: runs a host through a session
├── lobby.ts           sections, skies, the snapshot, resolveSky, worldEntryBlock
└── world.test.ts      28 tests of the lifecycle, faults, resources and lobby rules
native/apps/sylf/src/spaces/world/
├── WorldSpace.tsx     joins everything: sky, ThemeScope, phases, the game menu
├── Lobby.tsx          the name, the menu, the way in, panels, the short and compact layouts
├── LobbyScene.tsx     plates, the one clock, parallax, the walk through the gate
├── layout.ts          where the art sits for a window, tested at 11 sizes
├── panels/            Traveller, Collection, Preparations
├── data/              typed contracts, sample and empty adapters
├── host/              the stand-in host and its surface
└── art/               31 baked plates, 3.4 MB, the generated index, skies.ts
native/tooling/world-art/        a voxel ray tracer with no dependencies, and the scenes
native/apps/desktop/src/world-check.mjs       189 checks in 14 groups
```

**Changed elsewhere.** `world.ts` gains a `failed` event. `store.ts` merges into the World snapshot on leaving. `ThemeScope` reads resolved accessibility settings ([§6](#6-defects-that-verification-found)). `App.tsx` creates the controller. `links.ts`, `dev-surface.ts` and `context.tsx` gain World's entries. `check-boundaries.mjs` gains World's rule. `android-spaces-check.mjs` looks for the new title, and that change has not run. `WorldScene.tsx`, the old pixel island, is gone.

### The visual direction

All 28 pages of `assets/design-references/sylf world design assets.pdf` were read. The lobby takes its sky states, palette, materials, block shapes, roofed timber language, lanterns, petals and chunky clouds. It takes no island, terrain, plant, building layout, companion, avatar, map or Build Mode HUD, which all wait for Phase 15. Those pages are preserved for that phase. The PDF's images are not used as assets: every plate is rendered from `tooling/world-art/scenes.mjs`.

## 2. Unit and static checks (`native/`)

| Check | Result |
| --- | --- |
| `npm run verify` | Pass: typecheck, lint, 223 tests in 15 files, boundaries, single-copy, web build |
| New tests | 47: 28 for World's lifecycle and lobby, 13 for layout across window sizes, 5 for data, 1 for links |
| Boundary audit, World rule | Pass, and proven: three planted static imports were all caught, then removed |
| Android release build | Pass on the final code, 4 m 6 s. Hermes bytecode and all native modules compile. No device was connected |

Root web checks were not run, because no root code was edited.

## 3. Electron on macOS (Electron 45.1.0, MacBook Air M1, 8 GB)

All on the final application code. Only the World check itself changed after the last app change, and it ran again.

| Check | Result |
| --- | --- |
| World check | **189/189** ([results](evidence/electron/electron-world-check.json)) |
| Spaces check | **52/52** ([results](evidence/electron/electron-spaces-check.json)) |
| Home check | **71/71** ([results](evidence/electron/electron-home-check.json)) |
| Workspace check | **184/184** ([results](evidence/electron/electron-workspace-check.json)) |
| Design check, security self-test | Pass, including system reduced motion ([results](evidence/electron/electron-design-check.json)) |

| World check group | What it proves |
| --- | --- |
| `look` | The lobby renders, plates load at full size, Preview and sample notices are present |
| `nav` | Sections with mouse and keyboard, Escape, restoration across a reload, focus order |
| `sky` | All six skies, Follow the day in both modes, persistence, Drift stopping everything |
| `flow` | From Workspace, through every phase, back to Workspace, with one host created and disposed |
| `faults` | A failed load and a failed save each come back with a way out, and leaving unsaved says so |
| `blocks` | A running session leads to Focus, no data, slow data, a small window |
| `motion` | Update rates, system reduced motion, the stepped theme |
| `isolation` | What loads from the network and when, and what runs after leaving |
| `a11y` | Names, roles, heading, art hidden, one section in the tab order, hidden panels hidden |
| `contrast` | Text against rendered pixels, in six skies and with custom colors |
| `sizes` | Six window sizes, three sections each |
| `themes` | Six themes in both modes, custom colors |
| `frames`, `retention` | §4 |

## 4. Performance

Measured on one Mac at 60 Hz, and only there. **These bound the work. They say nothing about the tablet.**

| Measure | Result |
| --- | --- |
| Scene updates per second, standard theme | **30** |
| Stepped theme (Voxel) | **12** |
| System reduced motion, or Drift off | **0**, and no petals are mounted |
| Lobby frames, ambient motion | p50 16.7, p95 18.3, max 18.7 ms |
| Switching panels | p95 17.5, max 18.1 ms |
| Walking through the gate | p95 18.2, max 18.6 ms |
| Page updates after leaving World | **0** per second, after a visit and after switching away |
| DOM nodes across 7 visits | 268 at every reading |
| Event listeners across 7 visits | 222 at every reading |
| JavaScript heap across 7 visits | 10.47 to 10.97 MB after forced collection |
| Whole-app working set, Home, lobby, after leaving, after 7 visits | 451, 456, 436, 349 MB |
| Host code loaded before entry | None, proven from the network |
| Plates loaded in the lobby | Six, all for the current sky |
| Plates loaded at Home | None |
| World's code | 32 KB, its own chunk. The host is 1 KB and its surface 1 KB, each loaded on entry |
| Plates on disk | 3.4 MB for all six skies. Each sky is about 0.5 MB |
| Largest plate, decoded | 780 × 830, about 2.5 MB. One sky's set is about 6 MB. This is arithmetic, not a measurement |

**Reading these honestly.**

- **The heap rose by 0.5 MB over seven visits, about 0.07 MB a visit.** Nodes and listeners did not move. It may be ordinary engine growth, since a run this short cannot tell a slow leak from a plateau. Longer sweeps should decide it.
- **The working set is noisy.** It fell during the run as Chromium released caches, so the 5 MB gap between Home and the lobby is one reading and not a measured cost.
- **Native memory is the real question** (risk R15), and it can only be measured on the tablet.

## 5. Contrast

Text is measured against the pixels behind it, with the text hidden for the capture. The lowest reading anywhere, at the 3rd percentile of pixels:

| Sky | Signature | Voxel |
| --- | --- | --- |
| Dawn | 4.68 | 4.96 |
| Day | 4.68 | 4.60 |
| Sunset | 4.86 | 4.87 |
| Dusk | 4.64 | 4.72 |
| Night | 4.79 | 4.77 |
| Mist | 4.68 | 4.51 |

Custom accent: 4.88. Custom accent and ground: 4.84. The minimum is 4.5:1, and 3:1 for large text. **Dusk's margin is thin,** and it passes partly because its far clouds are dimmed.

## 6. Defects that verification found

| Found by | Defect | Fix |
| --- | --- | --- |
| Reading `ThemeScope` | It honored only the app's reduced-motion setting, so the system setting was ignored in any scoped subtree. This was already in the code, and it affected the Theme Studio's previews too | It now reads the resolved settings |
| Reading `store.ts` | Leaving World replaced its snapshot, which would have wiped the sky and section | It merges |
| Screenshot | The sky drew at 320 × 180 in a corner: `absoluteFill` does not size an image on the web | Explicit sizes |
| Screenshot and hit test | A `ScrollView` grows to fill a row on the web and ignored its width, so menu rows were 1256 pt wide and their centers lay under the open panel. Clicks landed on the panel, and the caption could not wrap | A wrapper with a fixed width |
| Sky-pixel contrast | Dusk's menu was 1.63:1, Night's Preview badge 2.3:1, captions over clouds 3.9:1, and the tagline 2.7:1 | Dusk's sun moved behind the gate, its left side shaded, clouds dimmed on dark skies, the way in put on a plate, the tagline in full ink |
| Size check | At 900 × 420 the way in fell below the fold | A layout for short windows |
| Reviewing the controller | Backgrounding during a load would have started play with nobody there | Play now stops at the menu, with a test |
| Reviewing ADR 0001 | It asks for a memory report, and the first interface had none | `memory()` added |
| Spaces check | "Saved on this device" lasted 650 ms, too short to read | 900 ms |
| Screenshots | Cloud corners showed stair-steps, because each small voxel face lit separately | Normals taken from the shape around each hit |

Three failures were faults in the checks: a repeated link parameter, a Space remembered from an earlier group, and an Escape press that could land just after a load ended, when opening the menu is correct.

## 7. Open questions at Phase 9

| ID | State |
| --- | --- |
| R6, game engine | **Open.** No engine was evaluated, as the brief required. The contract reduces the risk and does not remove it |
| G1, World during study | Built: a session comes first, and the way in leads to Focus. Reached only through a development link until Phase 13 |
| G2, social model | Single player first. Nothing implies otherwise |
| G3, device floor and download size | **Open** for Phase 15. Plates add 3.4 MB |
| G4, small windows | Built: under 600 × 420 pt the lobby works, and entry is disabled |
| H1, Locker and Shop | Reserved in Collection, as proposed |

## 8. Limitations and untested behavior

- **The lobby has never run on Android or iOS.** Untested there: worklets on the UI thread, plate memory, `Image` stretching and its decoded size, a panel's `maxHeight` with a shrinking `ScrollView`, the status bar in World, and Back on panels.
- **Touch was not exercised on the lobby.** Mouse and keyboard were.
- **TalkBack and VoiceOver were not run.**
- **The pointer's parallax is web only,** for a mouse. There is none on touch, by design.
- **Contrast was measured for two themes on every sky,** plus custom colors, at the default window with the clouds where they start. The other four themes were inspected by eye. Short and compact layouts were not measured.
- **The way in, the plates and the panels were judged by screenshot,** and by one reviewer. The owner's eye is the real test.
- **The walk through the gate was measured and captured, and never watched at speed by a person.**
- **The art is a first bake.** Clouds look softer than the visual direction's at large sizes, because plates are upscaled.
- **Preview stages are short pauses.** The progress is real for that host, and the stages stand for nothing.
- **A receipt from the stand-in host points at nothing.** It proves the path, and "Saved on this device" means the visit was recorded.
- **`android-spaces-check.mjs` was edited and not run.** Its World steps should still match, and the first run should be read with care.
- **Sample cosmetic names are invented,** and shown only with development tools on.
- **Performance figures** come from one Mac, at 60 Hz. No CPU or energy figure was taken, and a lobby left open for hours was not tested.

## 9. Reproducing

From `native/`: `npm run verify`; `SYLF_WORLD_CHECK_OUT=<dir> npm run desktop:world-check`; `SYLF_SPACES_CHECK_OUT=<dir> npm run desktop:spaces-check`; `SYLF_HOME_CHECK_OUT=<dir> npm run desktop:home-check`; `SYLF_WORKSPACE_CHECK_OUT=<dir> npm run desktop:workspace-check`; `SYLF_DESIGN_CHECK_OUT=<dir> npm run desktop:design-check`; `npm run desktop:self-test`; and `npm run android:build`, with `JAVA_HOME` set to JDK 17 and `ANDROID_HOME` set. Run Electron checks one at a time. To rebake the art: `node tooling/world-art/render.mjs`.

## 10. Handoff

See the [Phase 9 handoff](../../handoffs/phase-9.md). **Phase 9 stops here. Phase 10 needs the owner's approval, and tablet verification waits until after it.**
