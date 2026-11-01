# ADR 0015 — One session across modes, the Focus environment and parties

**Status: Accepted by the owner for decisions 1, 6 and 7, 1 November 2026, which approved the immersive Focus environment. The rest stay Proposed.** It extends [ADR 0008](0008-study-session-and-timer-dock.md) and replaces its decision 20 when built. It builds on [ADR 0012](0012-connected-app.md) and [ADR 0013](0013-expansion-stage.md). Nothing here is built yet. Part 1 may refine it with evidence.

## The problem

Native has one study session with a length. The stage adds seven timer modes with breaks, an immersive Focus environment, and Focus Parties whose time belongs to the server. Each could easily grow its own clock, which is what the project has refused since Phase 10.

## Decisions

| # | Decision | Status | Why |
| --- | --- | --- | --- |
| 1 | **One authoritative timer and session system across Home, Focus, Workspace and the universal dock,** and now the Focus environment and parties. `createStudySessionModel` stays the only owner, `TimerSnapshot` stays the only time, and `TimerSync` stays the only journal. | Confirmed (owner) | The owner's brief, master plan O8 |
| 2 | **Mode rules move to a new pure module, `lib/timer-modes.ts`,** extracted from `FocusScreen.tsx` and `ModesSettingsScreen.tsx`. Web imports it, with no change in behavior. | Proposed | A native copy of seven modes would drift from web. `AGENTS.md` forbids copying catalogs into pages. It is the narrowest move that gives one source |
| 3 | **A mode is configuration on the session, and a phase change is a snapshot transition.** The model uses `transitionSnapshot`. Nothing counts ticks. | Proposed | The engine already has phases and `breakMs`. `deriveTimer` keeps working across a process kill |
| 4 | **Mode settings stay on the device,** as web's do in `study_mode_config`. | Proposed | Sync needs a column, and that is significant for little value. Written down as a future possibility |
| 5 | **The session's stored record moves to `.v2`,** with a tested reader for `.v1`. A session running across the upgrade continues. | Proposed | A session must survive whatever comes next |
| 6 | **The Focus environment is a shell layer above the Spaces, not a fourth Space.** It is entered from Focus, the dock, Workspace's Timer and "Study this", and exit returns to where the student was. | Confirmed (owner) | O2 confirms three Spaces. It belongs to no Space, like the dock. A layer leaves a Workspace's state alone |
| 7 | **The dock and the Spaces icon hide in the environment,** because it is the session's largest view. Leaving brings them back. | Confirmed (owner) | The dock exists so a session stays in reach elsewhere. Here the session is the whole screen |
| 8 | **The environment is a view of the model.** It holds no time, passes `live` correctly, and reads the same controls from `SessionParts.tsx`. | Proposed | ADR 0008 decisions 10 and 15 |
| 9 | **Heavy resources belong to the environment's lifetime.** Its background, wake lock and any large layout are taken on entry and released on every exit path. Audio lives in one shell-level engine. | Proposed | R15, and a wake lock left on is a battery defect |
| 10 | **Web's four layouts are not ported.** Part 1 designs Native's own. | Confirmed by the owner's brief for "do not copy" | Web is a reference for behavior only |
| 11 | **A party session is a kind of the one active session,** marked solo or party on the record. Its time comes from the server's party state, reconciled into the same snapshot shape. Controls call acknowledged server actions. | Proposed | The server already owns party time. `TimerSync` already has the `party` branch. A second model would be a second clock with extra steps |
| 12 | **A solo session and a party session never run together.** Joining asks first. | Proposed | One active session has always been the rule (ADR 0008 decision 4). **Part 1 proved the server doesn't enforce this,** so only Native's own behavior holds it until E-13 is settled |
| 13 | **World's guard and the 12-hour cap apply to every kind and mode.** | Confirmed by ADR 0008 and Phase 11 | Game time is never study time, and a server clamp never bends for a client |
| 14 | **`saved` still flips only in `settleAccepted`.** Breaks are reported, and rewards are the server's. | Confirmed by ADR 0012 | Unchanged |
| 15 | **A test proves there is one clock:** no surface outside `model.ts` derives session time, and the journey compares every surface at one moment. | Proposed | This has been an invariant by convention. The stage will add many screens, so it should be enforced |

## Rejected

| Option | Why not |
| --- | --- |
| Copy the modes into `@sylf/spaces` | Two sources of truth for what a Pomodoro is |
| A separate break timer | A second clock. `breakMs` is why the engine has phases |
| A Focus Space | Three Spaces are Confirmed, and it would need its own switcher entry |
| A party owner beside the model | The dock, the environment and World's guard would all need to ask two owners |
| Syncing modes through a new table | Significant backend work for a convenience (master plan §7.3) |

## Consequences

- **Party credit is open.** Part 1 read that party time banks only on `FocusSessionMember`. Decision 14 assumes nothing about it, and decision E-13 settles it before Part 3 slice D.
- `lib/timer-modes.ts` touches a sensitive web file. Web's timer suites run before and after, and any change in a test's meaning stops the work (R20).
- `SessionLength` stays for Free Flow and plain countdowns.
- `session.test.ts`, the Session check and the journey grow.
- Background alerts depend on Part 1's notification spike, and sound on its audio spike. Each has a fallback: the session still works, silently.
- ADR 0008 decision 19 changes when audio plays, because the dock's Audio control can then do more than open a tool.
