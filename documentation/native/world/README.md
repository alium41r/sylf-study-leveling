# Sylf World

**Phases 9 and 10, 31 October 2026.** The current contract for the World Space in Sylf Native: a lobby at the gate, and the foundation a game will plug into. Source wins if anything here disagrees: [`native/packages/spaces/src/world`](../../../native/packages/spaces/src/world/) and [`native/apps/sylf/src/spaces/world`](../../../native/apps/sylf/src/spaces/world/). Decisions are in [ADR 0007](../decisions/0007-world-lobby-and-host.md), and the evidence is in the [Phase 9 report](../reports/phase-9/report.md).

Labels: **Confirmed** came from the owner's brief or master plan. **Proposed** is a decision from this phase the owner can still change.

**Roadmap note, 1 November 2026.** Phase 15 keeps its number and scope, and now follows the [Expansion stage](../expansion/README.md). World's guard will cover timer modes and party sessions ([ADR 0015](../decisions/0015-session-modes-focus-environment-and-parties.md)).

**The Phase 9 gate is the main lobby image (Confirmed, owner).**

**There is no game here.** The world, its islands, terrain, biomes, maps, characters and gameplay belong to Phase 15 (Confirmed). The lobby shows an entrance and the air around it, and nothing beyond.

## 1. What exists

| Layer | Location | Owns |
| --- | --- | --- |
| Phases | `packages/spaces/src/world.ts` | World's states and when the game holds navigation. Unchanged from Phase 5, plus one `failed` event |
| Host contract | `packages/spaces/src/world/host.ts` | `WorldHost`, its receipts and progress, and `createWorldResourceScope` |
| Controller | `packages/spaces/src/world/controller.ts` | `createWorldController(store, options)`: runs a host through a session. Created outside React in `App.tsx` |
| Lobby state | `packages/spaces/src/world/lobby.ts` | Sections, skies, the `world` snapshot, `resolveSky`, `worldEntryBlock` |
| Space | `apps/sylf/src/spaces/world/WorldSpace.tsx` | Joins everything: the sky, `ThemeScope`, the phases on screen, the game menu |
| Scene | `LobbyScene.tsx`, `layout.ts` | The art, its one clock, and where it sits for a window |
| Interface | `Lobby.tsx`, `panels/` | The name, the menu, the way in, and three panels |
| Art | `art/` | Baked plates, the generated index, `skies.ts` |
| Art source | `native/tooling/world-art/` | The voxel renderer and the scenes. Runs by hand, and nothing in it ships |
| Stand-in host | `host/preview.ts`, `host/PreviewSurface.tsx` | Everything a host does except the game. Phase 15 replaces these two files |
| Data | `data/` | Typed contracts, the sample and empty adapters, the one binding point |

`@sylf/spaces` stays free of React and UI, so the lifecycle is tested without a renderer.

## 2. The lobby

| Section | Holds | Real now | Waits |
| --- | --- | --- | --- |
| **Gate** | The name, the way in, a plate with level, rank and Sylph | The way in and out | The game behind it |
| **Traveller** | Identity, level progress, rank, Sylph, what was earned this week | Real with an account, sample with no backend in a development build | Appearance and the companion, which are reserved rows |
| **Collection** | Frames, titles and name colors | Real with an account, named from `lib/cosmetics-catalog` | Locker and Shop, which are reserved rows (master plan H1) |
| **Preparations** | Sky, Drift | Both, saved on this device | Sound, Detail and Controls, which are reserved rows |

The way in is always on screen, because a lobby exists to be walked through. It sits on its own plate, since it lies over drifting clouds. While a study session runs it offers **Pause session** and **Go to Focus** instead, and a paused session may enter ([Spaces guide](../spaces/README.md#10-the-study-session-and-the-timer-dock)).

- **A panel grows beside the menu.** Where the window has room, the gate stays in view. A panel fits its content and scrolls when it must.
- **A panel mounts on first visit and then stays mounted and hidden,** as Home's destinations do, because every mount costs native memory (risk R15).
- **Reserved rows cannot be pressed** and say when they arrive. The way in carries a Preview badge. The loading plate says no game is loading.

| Input | Behavior |
| --- | --- |
| Touch, stylus | Tap. Targets are at least 44 pt |
| Mouse, trackpad | Click and hover. Hovering the way in brightens the gate's light, and the scene shifts a little with the pointer |
| Keyboard (desktop) | Tab reaches the current section, Up and Down move along the menu and wrap, Home and End jump, Enter selects, Escape closes a panel. The menu runs Left and Right in a compact window |
| Android Back | Closes a panel. With nothing open, Back keeps its normal system behavior |
| Screen readers | A labelled tab list with tab panels. The art is hidden from them. **TalkBack and VoiceOver have not been run** |

### Window sizes

| Window | Layout |
| --- | --- |
| Expanded, medium | Name and menu on the left, the gate on the right, the way in at the lower left |
| Compact, under 600 pt | Sections along the bottom, as Home's rail goes. The gate stands in the middle |
| Under 600 × 420 pt | The lobby works, and the way in is disabled with a reason (G4) |
| Short, under 560 pt tall | The tagline steps aside and the way in moves to the lower right |
| Under 720 pt wide | The traveller glance steps aside, because it would meet the way in |

Panels start below the Spaces icon's line, so the timer dock is never on one.

## 3. Appearance

**World's art is authored, like a document (Confirmed, owner).** Its colors come from the owner's visual direction and never follow a theme or an appearance mode. `skies.ts` and `tooling/world-art/scenes.mjs` are the only places hex values are allowed.

**The interface is the person's own theme, solved against the sky.** `WorldSpace` wraps everything in a `ThemeScope` whose axes are the person's, with the sky's `ground` in both slots. Their type, shape, material, Marker, motion and accent all carry over, and contrast is solved by the engine as it is everywhere else. No component reads a theme id.

The switcher sits outside the scope, so it keeps the person's own theme. It is on a plate, so it reads on any sky.

**Text on the sky is measured against the sky,** because solving against one color does not prove anything on a gradient. The World check captures the page with its text hidden and measures each piece of text against the pixels behind it. That found dusk's menu at 1.63:1 during this phase. Any new text over art needs the same treatment, or a plate.

### Skies

Six, from the visual direction's sheet: Dawn, Day, Sunset, Dusk, Night, Mist. **Follow the day** is the default, and it follows the local clock alone: dawn from 5, day from 10, sunset from 16, dusk from 19, and night from 21. Appearance mode has no say, because the sky is independent of the theme. The clock is read on arrival, so a sky does not change under someone sitting in the lobby. A chosen sky is kept on this device.

To change a sky or a plate, edit `tooling/world-art/scenes.mjs` and run this from `native/`. It takes under two minutes and rewrites `art/plates.generated.ts`, so a path or an anchor cannot go stale.

```bash
node tooling/world-art/render.mjs
```

## 4. The host

Phase 15 implements one interface and nothing else changes. No engine is named anywhere.

```ts
interface WorldHost {
  readonly descriptor: WorldHostDescriptor;
  initialize(context: WorldHostContext): Promise<void>;   // start the runtime, take the surface
  load(save: WorldSaveReceipt | null): Promise<void>;     // a save, or a new game
  suspend(reason: "menu" | "background"): Promise<void>;  // stop all work
  resume(): Promise<void>;
  save(): Promise<WorldSaveReceipt>;                      // resolves only once the data is safe on this device
  exit(): Promise<void>;                                  // end play in an orderly way
  dispose(): void;                                        // must always succeed, however far the host got
  memory(): WorldMemoryReport | null;                     // for World's own budget
}
```

**The context** gives a host `report(progress)`, `window()`, `cancelled()` and `resources`. Anything a host holds goes in that scope, which is emptied however the host ends. A timer goes through `resources.after()`, not a bare `setTimeout`.

**A receipt is a pointer, never a save.** It is `{ ref, savedAt, location, pendingSync }`, small enough for a Spaces snapshot. The host owns the save data, and `pendingSync` is shown as it is.

### The controller

The controller is the only thing that talks to a host, and the only thing that moves World's phases. A host never touches the store.

```
entry ──enter()──▶ entering ──ready──▶ playing ◀──pause()/resume()──▶ paused ──leave()──▶ saving ──▶ saved ──▶ previous Space
  ▲                   │                                                  ▲                  │
  └──────failed───────┘                                                  └─────failed───────┘
```

| What happens | Result |
| --- | --- |
| Load fails, or takes over 30 s | Host disposed, scope emptied, back at the lobby with a message. A late answer from that host is ignored |
| The host's code cannot be imported | The same |
| Save fails, or takes over 15 s | Back in the menu with the host alive. **Try again** or **Leave without saving** |
| Exit or dispose throws | Logged, and leaving finishes anyway |
| A host leaves something in its scope | Released for it, and logged as `released-for-host` |
| The app leaves the foreground | Play stops with `suspend("background")`, and the menu is waiting on return |
| A restart in the middle of play | Back at the lobby (master plan §3.2) |

**A host can never trap anyone.** The switcher is gone during play, so every failure has a way out, and Leave without saving always works. The screen then says "Left without saving", never "Saved".

## 5. Isolation

**Confirmed:** nothing of World runs under Home or Workspace.

| Rule | Enforced by |
| --- | --- |
| World is its own chunk. No file outside it may statically import it | `check-boundaries.mjs` |
| The host is its own chunk, imported on entry. Nothing may statically import it | `check-boundaries.mjs` |
| A plate loads only for the sky on screen | World check, from the network |
| The controller holds no host outside a visit | Unit tests, and the `SYLF_WORLD` log |
| Nothing writes to the page after leaving | World check: no style updates at all |
| The lobby's art unmounts once someone is through the gate | World check |

The controller itself is created at startup, because it must survive a recreated root. It is a few closures, and holds nothing until someone enters.

## 6. State and restoration

| State | Where | Survives |
| --- | --- | --- |
| Section, sky, drift, last save, last visit | The `world` snapshot, parsed by `parseWorldSnapshot` | Remounts, Space changes, restarts |
| World's phase | Store memory only | Remounts. A restart returns to the lobby |
| Host progress and faults | `WorldRuntime` in the controller | The session only |
| The sky behind a Space change | Read from the snapshot on arrival | |

A value in the record that does not belong is dropped alone. Leaving World adds to the record and never replaces it.

## 7. Backend map

The lobby adds no server concept.

| Shown | Existing owner |
| --- | --- |
| Name, level, Sylph | `/api/user/stats` |
| Rank | `User.hunterRank`, on `/api/user/stats` |
| Level progress | `lib/game-engine.ts`, read through `@sylf/shared` when the adapter is real |
| Earned this week | `GET /api/user/earned-this-week`, added in Phase 13. Positive ledger rows since the student's Monday |
| Frames, titles, name colors, class | `/api/cosmetics`, `activeTitle` and `activeAvatar` on `/api/user/stats`, `lib/cosmetics-catalog.ts` |
| A running session | The one study session, which maps to `StudySession` ([ADR 0008](../decisions/0008-study-session-and-timer-dock.md#backend-map)) |
| Locker, Shop | Existing ledgers and inventory, in Phase 15 |
| World's saves, terrain and builds | **New, and deferred.** A storage contract is decided in Phase 15 (master plan §2.3) |

Without `DEV_TOOLS` the empty adapter binds, so no sample can reach a store build. Sample cosmetic names are invented for the template, and the catalog stays the owner of the real ones.

## 8. Performance rules

1. **One clock.** Everything ambient comes from one shared value, capped at 30 updates a second, or the theme's own rate if it steps.
2. **Nothing is scheduled when nothing moves.** With reduced motion, Still or Drift off, the clock is cancelled and the petals are not mounted.
3. **Plates, not SVG.** A full-window SVG costs about 50 MB on Android.
4. **Transforms only.** Nothing here animates a size, a shadow or a layout.
5. **Six skies, one in memory.** A plate is decoded only for the sky on screen, plus the last one during a crossfade.
6. **The scene does not survive the gate.** It unmounts before a host's surface appears, so a game never shares memory with the lobby.
7. **Keep what is switched often mounted.** Panels stay mounted and hidden.

## 9. Development tools

| Link | Shows |
| --- | --- |
| `?space=world&worldSky=night` | One sky, or `auto` |
| `&worldSection=traveller` | One section |
| `&session=running` | A running study session, the real one |
| `&worldData=empty` or `slow` | No data, or slow data |
| `&worldHost=fail-load` or `fail-save` | A host that fails |
| `&worldHost=slow` | A host four times slower |

New log lines: `SYLF_WORLD host-created`, `playing`, `leaving`, `host-disposed`, and `load-failed`, `save-failed`, `exit-failed`, `dispose-failed`, `released-for-host`, `release-failed`.

## 10. Adding a game (Phase 15)

1. Choose the engine (risk R6). Nothing here assumes one.
2. Write a host in `host/`, and point `loadHost` in `App.tsx` at it. Keep it behind `import()`.
3. Replace `PreviewSurface` with the engine's surface.
4. Report real progress. Remove the Preview badge and the loading plate's caption.
5. Put everything the host holds in its resource scope.
6. Decide the storage contract, and keep receipts as pointers.
7. Fill in `memory()`, and set World's budget.
8. Run `npm run desktop:world-check`, which covers every path above. On the tablet, run `android:memory-check` once it is authorized.
