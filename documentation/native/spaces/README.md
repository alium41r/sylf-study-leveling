# Sylf Spaces shell

**Phases 5 and 10, 31 October 2026.** The current contract for global navigation and the study session in Sylf Native. Source wins if anything here disagrees: [`native/packages/spaces`](../../../native/packages/spaces/) and [`native/apps/sylf/src/shell`](../../../native/apps/sylf/src/shell/). Decisions are in [ADR 0004](../decisions/0004-global-spaces-shell.md) and [ADR 0008](../decisions/0008-study-session-and-timer-dock.md), and the evidence is in the [Phase 5](../reports/phase-5/report.md) and [Phase 10](../reports/phase-10/report.md) reports.

Labels: **Confirmed** came from the owner's brief or master plan. **Proposed** is a Phase 5 decision the owner can still change.

**What is planned (1 November 2026, not built).** There stay three Spaces. The [Expansion stage](../expansion/README.md) adds an immersive Focus environment, approved by the owner, as a layer above them, and timer modes, breaks and party sessions to the one session ([ADR 0015](../decisions/0015-session-modes-focus-environment-and-parties.md)). **Everything below describes what is built today.**

## 1. What exists

| Layer | Location | Owns |
| --- | --- | --- |
| Contracts | `packages/spaces/src/contracts.ts` | `SpaceId`, availability per form factor, `SpacesRestorationState`, defensive parsing |
| Store | `packages/spaces/src/store.ts` | Active Space, return Space, snapshots, World phase, persistence. Created outside React |
| World flow | `packages/spaces/src/world.ts`, `world/` | World's states, the rule for when the game holds navigation, the host contract and its controller ([World guide](../world/README.md)) |
| Switcher logic | `packages/spaces/src/switcher.ts` | Labels, transition direction, keyboard targets, fitting the bar to the window |
| Study session | `packages/spaces/src/session/` | The one session, its clock and record, the dock's placement. See [§10](#10-the-study-session-and-the-timer-dock) |
| Shell UI | `apps/sylf/src/shell/` | `SpacesSwitcher`, `TimerDock`, `SpaceStage`, `SpacesShell`, `shell-keys(.web)`, `session/SessionParts`, app links, the development entry |
| Spaces | `apps/sylf/src/spaces/` | `home/`, `workspace/`, `world/`. Each is loaded separately |

`@sylf/spaces` stays free of React and UI, so its behavior is tested without a renderer. Layout, type and color come from `@sylf/design-system`, and nothing in the shell branches on a theme.

## 2. The switcher

**Confirmed.** One small Spaces icon in the top-left corner expands a short horizontal bar with Home, Workspace and World. Selecting a Space closes the bar and transitions. The bar closes on an outside tap or click, on Escape and on hardware Back.

**Proposed details.**

- **The plate grows.** At rest the icon sits on a small `raised` plate, so it stays readable over any future canvas. Opening fades that plate into a `float` plate that grows out of the same corner. There is no separate popover and no clipping, so shadows, ornaments and focus rings stay intact.
- **The current Space shows at rest.** The Spaces icon is a grid of four cells, and the Marker sits in a different cell for each Space: top left for Home, top right for Workspace, bottom right for World. Nothing else appears, so the closed state costs no extra chrome. The accessible name also says the current Space.
- **One point of light.** When the bar opens, the Marker leaves the icon and lands under the current Space. It takes the theme's body and flight, and it is the only accent in the bar.
- **Tabs appear as the plate reaches them.** Each fades in a little after the plate passes its position. Tabs stay mounted and hidden while the bar is closed, because mounting them on every open cost native memory on the tablet. Hidden tabs take no touches, no keyboard focus and no place in the accessibility tree.
- **Nothing resizes during the motion.** The plate scales with a transform, and its shadow is a still layer that fades in at the end. A blurred shadow on a surface that changes size is redrawn at every size, and the GPU keeps each one (137 MB after 30 opens on the tablet).
- **Fit.** The bar never leaves the window. When the labelled bar does not fit, labels drop and the icons stay, with their names kept for assistive technology.

| Input | Behavior |
| --- | --- |
| Touch, stylus | Tap the icon. Targets are at least 44 pt. Long press shows the "Spaces" tooltip |
| Mouse, trackpad | Click. Hover shows the tooltip. An outside click closes without acting on what is underneath |
| Keyboard (desktop) | The icon is first in the tab order, and the timer second. Enter or Space opens and moves focus to the current Space. Left and Right move and wrap, Home and End jump, Enter selects, Escape closes, and Tab closes. Focus always returns to the icon. Command + 1, 2 or 3 on a Mac, and Control + 1, 2 or 3 elsewhere, go straight to a Space |
| Android Back | Closes the bar first. With nothing open, Back keeps its normal system behavior |
| Screen readers | A labelled tab list. A Space change is announced. **TalkBack itself has not been run** |

**Shortcuts (Phase 10, Proposed).** Direct shortcuts are built for desktop, and the checks against each system are in [ADR 0008](../decisions/0008-study-session-and-timer-dock.md#shortcuts-what-was-checked). Only the system's own modifier counts, because Control + a digit switches desktops on a Mac. They work while typing, wait behind a modal, and are gone during play. **A tablet has no hardware keys yet:** React Native delivers them only to a focused text field, so they need a native key hook that could not be tested in this phase. There are no global gestures, because a global edge or multi-finger gesture risks conflicts with system, pen and canvas gestures.

## 3. Transitions

A Space change moves through `move()` and `fade()`, so each theme's character, the user's intensity and reduced motion all apply without any shell code knowing about them. The incoming Space arrives from the side it sits on in the bar, using the theme's `enterTravel` and `enterScale`. The outgoing Space fades in `fade.base` and then unmounts. With reduced motion or the Still intensity, both the bar and the Spaces use short fades only.

## 4. State and restoration

| State | Where | Survives |
| --- | --- | --- |
| Active Space, return Space | `sylf.native.spaces.v1`, written the moment it changes | Remounts, window changes, process kill, restart |
| Space snapshots | Same record, written after a 240 ms pause and on backgrounding | Same |
| World phase | Store memory only | Remounts and window changes. A restart returns to World's entry (master plan §3.2) |
| The study session | `sylf.native.study-session.v1`, written the moment it changes | Everything, including a process kill. See [§10](#10-the-study-session-and-the-timer-dock) |
| Bar open or closed | Component state | Nothing. It is transient by design |

Storage goes through `adapters.preferences`: `SharedPreferences` on Android, `UserDefaults` on iOS (uncompiled), `localStorage` on desktop. A corrupt record falls back to Home. Each Space writes with `store.setSpaceSnapshot(space, value)`, which must stay small and serializable. Heavy resources never go in a snapshot.

**In use today:** Home saves its destination and each destination's scroll position ([Home guide](../home/README.md#5-state-and-restoration)), Workspace saves its windows, layout and camera ([Workspace guide](../workspace/README.md#6-state-and-restoration)), and World saves its section, sky, drift, last save and last visit ([World guide](../world/README.md#6-state-and-restoration)).

## 5. Loading and unloading

Only the active Space is mounted. A Space that is left stays for its exit fade, then unmounts completely. Each Space is a separate `import()`, so startup evaluates the shell plus the last-used Space. Opening the bar loads the other Spaces' code, so a choice can begin on the next frame. On desktop each Space is its own chunk. The Showcase replaces the Spaces rather than covering them, so the two never hold memory at the same time.

The Workspace dot grid is one plate of image tiles sharing one decoded bitmap, not an SVG, and the camera moves it as one transform. On Android, `react-native-svg` rasterizes each SVG into a bitmap the size of the view, and `resizeMode="repeat"` does the same, so **never put a full-window SVG on screen.** Measured on the Tab S9 FE: 50 MB for the SVG grid, about 9 MB for the tiles.

## 6. World

**Confirmed.** The game's own exit flow takes priority during play, and the switcher returns after leaving.

```
entry ──enter──▶ entering ──ready──▶ playing ◀──resume──▶ paused ──leave──▶ saving ──saved──▶ saved ──finish──▶ previous Space
  ▲ switcher         │                game menu in the corner  ▲                 │
  └──────failed──────┘                                         └─────failed──────┘
```

- The switcher exists only at `entry`. In every other phase the store refuses Space changes, even from a deep link.
- During play, a game menu button takes the corner. Back and Escape open the menu, and from the menu they resume. During `entering`, `saving` and `saved`, Back and Escape do nothing, so nothing can interrupt the save.
- **Save and leave returns to the Space you came from** (Workspace if you came from Workspace, otherwise Home).
- A restart in the middle of play comes back at `entry`.

**Phase 9 built the lobby and the host.** `createWorldController` now drives these phases from a `WorldHost`, and a stand-in host walks the whole path until Phase 15 brings a game. The screen says so. The contract is in the [World guide](../world/README.md).

## 7. Development tools

`DEV_TOOLS` is on in a development server or when a build sets `EXPO_PUBLIC_SYLF_DEV_TOOLS=1`, and it is off otherwise. The `build:web` and `build:android` scripts set it, because every build today is a verification build. **Phase 17's store pipeline must not set it.** A test covers the default.

When on, it adds a palette button at the top right that opens the Showcase, and it enables app links:

| Link | Web | Android |
| --- | --- | --- |
| Showcase chapter | `?chapter=studio&theme=voxel&mode=light` | `sylf-native://showcase?chapter=studio&theme=voxel&mode=light` |
| A Space | `?space=workspace&theme=cozy&mode=dark` | `sylf-native://spaces?space=workspace&theme=cozy&mode=dark` |
| Custom colors | add `&accent=e5ff00&day=7f8088&night=101010` | same |
| Workspace tools | add `&wsClear=1&wsOpen=notes,pdfs&wsZoom=0.5&wsLayout=split` | same |
| World states | add `&worldSky=night&worldSection=traveller&worldData=empty&worldHost=fail-save` ([World guide](../world/README.md#9-development-tools)) | same |
| The study session | add `&session=running`, `paused` or `clear`, and `&sessionLength=25` or `open` | same |
| Text size | add `&textScale=1.3` | same |

## 8. Diagnostics

`SYLF_FOUNDATION` and `SYLF_WINDOW` are unchanged. New log lines: `SYLF_SPACES` on every store change, `SYLF_SPACE_MOUNT <id>` and `SYLF_SPACE_UNMOUNT <id>`, `SYLF_WORLD <event>` for a host's life, and `SYLF_SESSION <event>` when something happens to the session, never for a clock.

## 9. Adding to a Space (Phases 6 to 9)

1. Replace the placeholder inside `apps/sylf/src/spaces/<space>/` and keep the default export, so `SpaceStage` still loads it lazily.
2. Read `useShellMetrics()` for the corner. `rail` is the column Home's rail should use, which keeps the Spaces icon centered above it. `contentTop` clears the corner.
3. Save restorable state with `setSpaceSnapshot`, and read it back from `useSpaces()`. Assume the Space can unmount at any moment.
4. Do not add a second switcher, a second persistence path, or per-theme layout.
5. Run `npm run desktop:spaces-check`, and `npm run android:spaces-check` once tablet work is authorized.
6. Name the existing backend owner of anything you add. A feature that needs significant new backend work is deferred and written down ([master plan §7.3](../master-plan.md#73-scope-boundaries)).

## 10. The study session and the timer dock

**Confirmed (owner, Phase 10):** one authoritative timer, one dock, in Home, Workspace and the World lobby, and no silent game time.

### The session

`createStudySessionModel(preferences, options)` is created in `App.tsx`, outside React. It is the only owner of the study session, and it has no copy anywhere. The dock, Home's Focus and Workspace's Timer call its actions and read it.

```ts
interface StudySessionModel {
  state(): StudySessionState;      // changes with an action, never with the clock
  subscribe(listener): () => void;
  status(): "idle" | "running" | "paused" | "finished";
  readout(): SessionReadout;       // the clock, focus and break seconds, the fraction through a countdown
  subscribeClock(listener): () => void;  // once for each second a clock shows
  revision(): number;
  setLength(length): boolean;
  start(context?): boolean;        // refuses while a session exists
  pause(): boolean;
  resume(): boolean;
  keepGoing(): boolean;            // after a countdown ends, the same session with no limit
  end(): EndedSession | null;
  setForeground(active): void;
}
```

| Rule | How |
| --- | --- |
| One session | `start` refuses while one exists. Each has a stable `clientKey` |
| Time is derived | `snapshot` is `lib/timer-engine.ts`'s `TimerSnapshot`, unchanged. Nothing accumulates, so nothing can drift or be lost |
| Durable | Every change is written at once to its own key. A running session carries on after a process kill, as the same session |
| Honest at the edges | A countdown that ran out unseen ends at its own deadline, and time away is not credited past it. A wall clock moved backwards restarts the live stretch from what is banked |
| One clock | One timer, armed for the next whole second, alive only while someone listens, the app is in front and a session runs. Every view reads the same moment |
| Rendering | Only `SessionClock`, `SessionProgress` and the dock's glance read the time. Pass `live={false}` when a view is hidden, and it costs nothing |

**Local is not a record (Confirmed).** The model reaches no server. `createSessionBridge` carries an owned session to the journal, and only the server's answer makes it `saved`, through `settleAccepted`. An ownerless session is never delivered unless its person accepts it (ADR 0010). The sentence beside a session comes from `shell/session/note.ts`: where the time is, and what happens next. Ended sessions are listed under "On this device", with a "Not saved yet" badge, until the server has answered, and never in Recent sessions before that. Rewards are never computed here.

### The dock

| State | At rest | Open |
| --- | --- | --- |
| Idle | The timer icon and the chosen length, quiet | Lengths, Begin session |
| Running | The Marker and the time | Time, progress on a countdown, Pause, End |
| Paused | A pause mark and the time, quiet | Resume, End |
| Finished | A check and 00:00 | Finish, Keep going |

Every state also has Focus, Timer and Audio, which go to Home's Focus, the Timer window and the Audio window. **Audio only opens the tool,** because playback waits for the native audio engine.

- **Where.** On the Spaces icon's line, in the middle of the window, or at the right of a compact window. It is sized from the type, with room for an hours place, so it does not resize as time passes. `placeDock` holds this, and it is tested with no renderer. `useDockMetrics()` gives the same answer to anything that shares the line, as Home's strip does.
- **It sits above the Spaces,** so a Space changing underneath does not move it. It keeps the person's own theme on World's sky, on an opaque plate.
- **It grows from itself.** A uniform scale on a shadowless plate, then one still shadow, as the switcher does. Reduced motion or Still is a plain fade.
- **The panel mounts on first use, and stays mounted and hidden.** Its clock runs only while it is open.
- **Closing.** An outside tap, Escape or Android Back. Focus returns to the dock, and the open panel keeps Tab inside it.
- **Gone during play.** It unmounts with the switcher past the gate, so nothing can resume a session in a game.

| Input | Behavior |
| --- | --- |
| Touch, stylus | Tap. Controls in the panel are the design system's, at 44 pt with touch |
| Mouse, trackpad | Click. Hover shows a tooltip with the shortcut |
| Keyboard (desktop) | Second in the tab order. Alt + T opens and closes it, Alt + P pauses or resumes. Alt letters stand aside while someone types |
| Android Back | Closes the panel first |
| Screen readers | A named button that says the state and time, a `timer` role on clocks, and one announcement for each change, never for a clock. **TalkBack and VoiceOver have not been run** |

### World

The lobby's plate reads the real session. While one runs, there is no way in: the plate says why and offers **Pause session** and **Go to Focus**. Nothing pauses on its own. A paused session may enter, the plate says it stays paused, and `createWorldController` refuses entry through `entryAllowed`, so no other path can skip this. Game time is never study time (master plan G1).

### Adding a surface

Use `SessionClock`, `SessionLengths`, `SessionProgress`, `SessionActions` and `LOCAL_SESSION_NOTE` from `shell/session/SessionParts.tsx`. Pass `live={false}` when hidden. Do not read `snapshot` in a screen, keep a copy of time, or write a second control. Run `npm run desktop:session-check`.
