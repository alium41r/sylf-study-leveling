# ADR 0008 — The one study session and the Universal Timer Dock

**Status: Accepted with Phase 10 (31 October 2026), subject to the owner's review.** This builds on [ADR 0004](0004-global-spaces-shell.md), [ADR 0006](0006-workspace-canvas-and-windows.md) and [ADR 0007](0007-world-lobby-and-host.md). The current contract is the [Spaces shell guide](../spaces/README.md#10-the-study-session-and-the-timer-dock), and the evidence is in the [Phase 10 report](../reports/phase-10/report.md).

**Confirmed** came from the owner's brief or master plan. **Proposed** is a decision from this phase that the owner can still change.

**Planned change, 1 November 2026.** [ADR 0015](0015-session-modes-focus-environment-and-parties.md) keeps this one session and adds modes, breaks, a Focus environment and party sessions to it. It will replace decision 20 and change decision 19 when built. This record still describes what is built.

## Decisions

| # | Decision | Status | Why |
| --- | --- | --- | --- |
| 1 | There is one study session, owned by `createStudySessionModel` in `@sylf/spaces`, created outside React in `App.tsx`. The dock, Focus and Workspace's Timer are views of it, and none of them keeps time. | Confirmed (brief) | The brief asks for one authoritative shared timer state, and master plan §3.2 names the session as a shell-level service. It follows the Spaces store and the Workspace model, for the same reason: it must outlive any screen. |
| 2 | Time is Sylf's own `TimerSnapshot`, from `lib/timer-engine.ts` through `@sylf/shared`. Nothing counts ticks. | Confirmed (master plan O8) | Reusing the engine rules out a parallel timer, and epoch snapshots survive navigation, unmounting, backgrounding and a process kill without any work. |
| 3 | The session has a preference key of its own, `sylf.native.study-session.v1`, written at once on every change, and never for a clock. | Proposed | It belongs to no Space, and a Spaces snapshot waits 240 ms, which is too long for something that must survive what comes next. The README's rule is about a Space's restorable state, and this is not one. |
| 4 | Every session has a stable `clientKey`, and `start` refuses while a session exists. | Confirmed (brief: no duplicate sessions) | `clientKey` is `TimerSessionStart.clientKey`, so a replayed start cannot make a second `StudySession` either. |
| 5 | Each pause, resume and end appends an operation shaped exactly like `lib/timer-sync.ts`: `id`, `action`, `sequence`, `focus`, `breaks`, `at`. END's id is deterministic. | Proposed | Phase 13 can replay these with no conversion, which is the point of mapping now. Totals are cumulative, so the 64 kept are always enough. |
| 6 | A countdown that ends is settled at its own deadline, not when someone returns. | Proposed | `deriveTimer` already caps the time, and this also dates the boundary truthfully, as the web timer's catch-up does. |
| 7 | A clock moved backwards restarts the live stretch from what is banked. | Proposed | `deriveTimer` clamps to 0, so without this the clock would stand still for as long as the change. A clock moved forwards still credits the gap, as the web does, and the server clamps it (`reconcileSessionSnapshot`). |
| 8 | Local time is never called a record. Every surface carries the same sentence: "Tracked on this device. Not saved to your study record yet." Ended sessions are listed apart under "On this device", with a "Not saved yet" badge, and never in Recent sessions. | Confirmed (brief) | The brief asks for this distinction. One sentence in one file keeps it from drifting. |
| 9 | One clock for everyone: a single timer on the model, armed for the next whole second and alive only while someone listens, the app is in front and a session runs. Everyone reads the same moment. | Confirmed (brief: no excessive re-rendering) | Three surfaces can never show different seconds, and nothing runs when nothing moves. |
| 10 | Only the piece that prints the time subscribes to the clock. A hidden view passes `live={false}` and costs nothing. | Confirmed by Phase 7 (a tool runs only when seen) | The check shows 0 changes in a hidden Focus and a minimized Timer. |
| 11 | The dock rests on the Spaces icon's line, in the middle, and at the right of a compact window. It is about 120 pt wide with a pointer, with room for an hours place, so it does not resize as time passes. | Proposed | Top center is where an island belongs and the only edge free in all three Spaces: Home has the rail, Workspace has the Command Center, World has the menu and the way in. |
| 12 | It lives in the shell, above the Spaces, and outside World's `ThemeScope`. | Proposed | A Space changing underneath does not move it, and it stays the person's own theme on a sky, as the switcher does. Its plate is opaque, so nothing on it is text over art. |
| 13 | It grows the way the switcher grows: a uniform scale on a shadowless plate, with the shadow as one still layer that arrives afterwards. The plate is uniform so its corners stay true. | Confirmed by Phase 5 (no animated size on a surface with a shadow) | A dock that opens many times a session would otherwise repeat the 137 MB GPU growth Phase 5 measured. Reduced motion is a plain fade. |
| 14 | The panel mounts on first use, and then stays mounted and hidden. Its clock runs only while it is open. | Confirmed by Phase 6 (R15) | Mounting costs native memory. |
| 15 | Controls appear once, in `SessionParts.tsx`, and all three surfaces use them. | Proposed | The same words and the same question everywhere, for less code. |
| 16 | Ending a session that is still going asks first. Ending one that has finished does not. A session of under a second is not kept. | Proposed | It cannot be undone, and a finished countdown has nothing left to lose. A mis-tap should not leave a record. |
| 17 | After a countdown ends, Keep going carries on as the same session with no limit. | Proposed | Web has a stopwatch mode, so this needs no new concept, and the session keeps its `clientKey`. |
| 18 | The length belongs to the session, not to a screen: 15, 25, 50, 90 or No limit, chosen from any surface and seen on all of them. `FocusView.presets` is gone. | Proposed | One choice, one place. No limit is the web timer's stopwatch mode. |
| 19 | Secondary controls are three: Focus, Timer and Audio. Audio opens the Audio tool, where sound is chosen, because playback waits for the native audio engine. | Proposed | The brief allows audio "without becoming cluttered". A play button here would be a second disabled control saying the same thing. |
| 20 | **Replaced in Expansion Part 2.** Breaks are real. A mode session carries `mode`, `modeSettings` and a `phase`, advances through `lib/timer-modes.ts` at each phase deadline, and counts breaks in `breakMs`, apart from focus. Free Flow and Flowtime take a break only when asked. | Accepted | The record keeps its v1 shape, with optional fields, so a session running across the upgrade survives. A pause is still not a break: paused time counts as neither. See [ADR 0015](0015-session-modes-focus-environment-and-parties.md) and the [Focus guide](../focus/README.md). |
| 21 | World's entry needs the session not to be running. `worldEntryBlock` reads the real session, and `createWorldController` refuses through `entryAllowed`, so no path past the lobby can skip it. | Confirmed (brief, G1) | A disabled button is not a safeguard. The controller is the only thing that moves World's phases, so that is where this belongs. |
| 22 | The lobby offers Pause session and Go to Focus, and never pauses on its own. A paused session may enter, and the plate says it stays paused. | Confirmed (brief: an appropriate pause or end) | Pausing is the person's choice, made in the open. |
| 23 | The dock unmounts with the switcher when someone passes the gate, and comes back at the lobby. There is no dock in the game. | Confirmed (brief) | The game holds the screen, and its keys go with it, so nothing can resume a session during play. |
| 24 | `worldData=session` and the adapter's `session()` are gone. | Proposed | A sample session could disagree with the real one, which is what a single authority rules out. `session=running` starts a real one for review. |
| 25 | Spaces shortcuts are Command + 1, 2, 3 on a Mac and Control + 1, 2, 3 elsewhere. Only that modifier counts, with no Shift or Alt. They work while typing and wait behind a modal. | Proposed | See below. |
| 26 | Alt + T opens the dock and Alt + P pauses or resumes. Both stand aside while someone types. | Proposed | Alt letters are already Workspace's language, and neither letter was taken. |
| 27 | Hardware keys are desktop only for now. A tablet needs a native key hook, which Phase 14's keyboard work can add. | Proposed | React Native delivers hardware keys only to a focused text field. Building a native module now could not be tested, because the tablet is out of bounds. |
| 28 | `model.summon(tool)` brings a tool forward from outside Workspace, and waits for the canvas. | Proposed | Before Workspace mounts, the model's frame is a guess. Opening against it put windows under the chrome, and the size sweep caught it. |
| 29 | A compact window on a tablet keeps the tablet's compact layouts. The phone companion is for phones. | Proposed, settles master plan §4.4 | All three Spaces already work under 600 pt, and a split-screen tablet still has the tablet's Workspace to come back to. Crossing the width must not swap the app. |
| 30 | "Follow the day" follows the clock alone: dawn, day, sunset, dusk, then night. Appearance mode no longer decides it. This replaces ADR 0007's decision 8. | Confirmed (owner, Phase 10 brief) | The owner confirmed that World's sky stays independent of the appearance theme. Phase 9 let Night mode force the night sky, which broke that. The interface is still the person's theme solved against the sky. |
| 31 | The Phase 9 gate is the main World lobby image. | Confirmed (owner, Phase 10 brief) | Approved as built. The Preview badge stays, because there is still no game behind it. |

## Shortcuts: what was checked

These are from platform documentation and were not tried on a device, because the tablet is out of bounds. No iPad has ever been available.

| Keys | macOS | Windows | iPadOS | Android, One UI |
| --- | --- | --- | --- | --- |
| Command + digit | Free in Electron: the default menu binds none | Not applicable | Not reserved by the system. An app may claim it | Not applicable |
| Control + digit | **Reserved** once Mission Control's "Switch to Desktop" is on | Free in Electron | Not applicable | Free. Android reserves Meta combinations, and Ctrl belongs to apps |
| Alt + digit | Workspace tools | Workspace tools | Workspace tools, when keys arrive | Workspace tools, when keys arrive |
| Alt + T, Alt + P | Free. Option makes symbols, so keys are matched physically and skipped while typing | Free. The default menu's Alt letters are F, E, V, W and H | Would make symbols in a text field, so it is skipped there | Free |

On Windows and Linux the modifier is Control, so on a future Android key hook it is Control as well, and Command on an iPad.

## Backend map

Nothing here needs a new server concept. Phase 11 audited this and **Phase 13 connected it** through `createSessionBridge` ([ADR 0012](0012-connected-app.md)). The audit's results: `clientKey` must be a UUID, which the app passes. Local `startedAt` becomes ISO at delivery. `operations` replay unchanged through `TimerSync`, which takes its storage, request and lock as arguments, so native needs a storage adapter and no second journal. A session made with nobody signed in is decided in [ADR 0010](0010-session-ownership-before-sign-in.md). One session now credits at most 12 hours.

| Local | Existing owner |
| --- | --- |
| `snapshot` | `TimerSnapshot` v2, `lib/timer-engine.ts`, unchanged |
| `clientKey` | `TimerSessionStart.clientKey`, and the journal's `clientKey` |
| `startedAt`, `endedAt` | `StudySession.startedAt`, `endedAt` |
| `focusSeconds`, `breakSeconds` | `StudySession.durationSeconds`, `breakSeconds`, and `acceptedFocusSeconds`, `acceptedBreakSeconds` in execution |
| `status` | `executionState`: `RUNNING`, `PAUSED`, `ENDED` |
| `operations` | The journal's operations in `lib/timer-sync.ts`, delivered through `SessionProtocolV2` |
| `title`, `subject`, `subjectId`, `questId` | Display text and ids. Chosen through `plan`, delivered at the journal's `create` |
| Rewards, XP, totals | Never computed here. `SessionService`, settlement and the atomic RPCs own them |

**Deferred, needing later phases.** Adopting an active session started elsewhere into the dock (`SessionProtocolV2.restore`): Focus says one exists. Background notifications are now a local notification scheduled when the app leaves with a timed phase running (`shell/focus/alerts.ts`); `SessionAdapter` stays reserved for a Live Activity, an Android foreground service and a desktop tray entry, none of which exist. Focus Party sessions, which keep their own server-owned timer. Native audio is now one engine (`shell/audio/engine.ts`).
