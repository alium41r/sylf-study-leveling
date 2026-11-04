# Focus on Sylf Native

How a student sets up and enters a study session. The session itself is the one study session of [ADR 0008](../decisions/0008-study-session-and-timer-dock.md), and the modes and environment are decided in [ADR 0015](../decisions/0015-session-modes-focus-environment-and-parties.md). Source wins over this page.

## The pieces

| Piece | Where | Does |
| --- | --- | --- |
| Mode rules | `lib/timer-modes.ts`, `@sylf/shared` as `modes` | Seven modes, their settings, and `modeStart`, `modeNext`, `modePattern`, `onDemandBreak`. Pure. Web imports the same file |
| Session | `packages/spaces/src/session/model.ts` | `mode`, `modeSettings`, `phase`. Phases advance in `settle`, at each deadline, however long the app was away. Breaks add to `breakMs` |
| Threshold | `spaces/home/destinations/FocusDestination.tsx` | What (subject, today's quests), Rhythm (`ModeChooser`), Where (backgrounds), and **Enter**. Recent sessions and On this device stay below |
| Environment | `shell/focus/FocusEnvironment.tsx`, `environment.ts` | Full window above the Spaces. No dock, no Spaces icon. Leave is not End |
| Entry | `shell/focus/enter.tsx` | `useEnterFocus` starts the session if idle, asks once about alerts for a timed rhythm, then opens the environment. Used by Today's Begin, the dock panel, Workspace's Timer and the Threshold |
| Backgrounds | `shell/focus/useFocusBackground.ts` | The account's own preference, so web shows the same one. Decoded on entry, released on exit |
| Audio | `shell/audio/engine.ts` | One engine. The Audio tool and the environment are views of it |
| Alerts | `shell/focus/alerts.ts` | One local notification at a timed phase's end when the app is away, cancelled on return. No push service |

## Rules that hold

- One clock. Nothing here counts time: surfaces read the session.
- The environment keeps the screen awake only while open, and releases on every exit.
- **Take a break** appears for Free Flow and Flowtime only, in `SessionActions`, so every surface shows it. Scheduled modes break by themselves.
- Mode settings stay on the device, as web's `study_mode_config` does. There is no server sync.
- The Native session never shows HP ([ADR 0017](../decisions/0017-hp-stays-off-native.md)).

## Not built

- Foreground chime: no asset yet, so a phase change is silent when the app is in front.
- Another device's session is noted, not adopted.
- Uploading a background stays on the web.
