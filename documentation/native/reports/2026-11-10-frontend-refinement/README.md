# Sylf Native frontend refinement

10 November 2026 · `phase-14-pen-settings`

This existing worktree contains the Native Home, Workspace and World Spaces and the most recent Notes editor and pen controls. The audit began by launching the packaged Electron app on the Mac with a temporary profile. It showed an invented agenda and social activity before sign-in, a one-minute goal when no goal was set, and a hero that assigned fixed widths to both the artwork and the target ring. The sound controls listed disabled entries. Notes used separate document and editing bars.

| Area | Changes |
| --- | --- |
| Home | The date, next action, daily target and agenda are in reading order. A quest opens Focus with its subject and title, and an upcoming event opens Calendar. The daily target shows its real value or an appropriate rest or setup state. The artwork lives on the World link. |
| Responsive layout | The dashboard measures space inside the rail and safe areas. Rotating the rail no longer uses its previous height as its width. The compact rail reserves room for the account control and keeps all five destinations reachable. The spotlight reflows before its text becomes cramped. |
| Account access | The Spaces require sign-in. An unconfigured app explains how to open a connected build. Home, Circle, Progress, Sylvie and the World lobby use existing typed reads and honest empty or error states. The local Notes library continues to use account ownership. |
| Workspace | Drag a tool up from the dock onto the canvas, or press to open it. A drag opens one window near its release point, sizes it to the available room within the tool's limits and snaps it to the existing grid. Expand a window from its title bar. Split screen reflows between landscape and portrait, and Tile windows fills the screen with the open tools. The Canvas control restores the earlier layout. |
| Notes | A single editing row holds the common actions, with formatting, pen controls, document settings and page selection available from focused menus and trays. Library navigation returns to the same folder or search. Page-only mode gives the document the screen and restores the surrounding desk when it closes. |
| Dynamic Island | Timer and Sounds share one surface. Press the sound icon or swipe down to expand the dock to the catalog, file picker, playback and volume. Swipe up on the header to close. The session clock remains visible in Sounds. The Focus environment uses the same expanded dock. |

All interface changes use Aloft typography, surfaces, color roles, spacing, controls and motion. Notes document formatting still comes from the document.

Before the change, unsigned catalog rows had no playable URL, the dock had no audio file picker, and the engine reported success as soon as it called play. Electron now starts its media element from the selection gesture and streams the existing proxied catalog. Native builds use the existing Expo audio module. The sound row reports loading, confirmed playback and errors. The shared engine guards against late player creation, releases replaced files, and keeps one player across Spaces.

The [Home guide](../../home/README.md), [Workspace and Notes guide](../../workspace/README.md), [account guide](../../account/README.md) and [timer dock guide](../../spaces/README.md#the-dock) describe the current interfaces.

## Verification

I opened the rebuilt app on the Mac, signed in to the local fixture, inspected Home, expanded Sounds, and selected the repository's `rain.wav` in the system chooser. The dock showed the selected file playing and the timer remained visible. Playback continued when I switched to Workspace and opened a test note to inspect the editing row.

| Check | Result |
| --- | --- |
| [Packaged Electron frontend check](evidence/frontend-check.json) | All seven scenarios passed. Home fit at six viewport and theme combinations; both touch swipes worked. Dragging opened one tool at the drop. The split reflowed, and leaving tiled mode restored the canvas. The timer advanced during playback and held its value while paused. A second account had its own empty Home. |
| Audio in the frontend check | An Ogg track, a catalog WAV and a picked WAV decoded and played. Playback survived Space switches and Focus, and the player recovered from a broken track. Catalog range requests returned HTTP 206 without credentials. Signing out stopped playback. |
| [Packaged Notes check](evidence/electron-notes-check.json) | All 50 assertions passed, including formatting, library navigation, page and ink restoration, annotation, linked documents, and compact page-only mode. |
| Native checks and exports | Typecheck, ESLint, the import boundary and single-copy checks passed. Vitest passed 620 tests, with one skipped. Electron's 12 host checks passed. The web renderer and Android Hermes bundle exported successfully. The updated Android Notes scripts passed syntax checks. |

Screenshots: [Home on a portrait tablet viewport](evidence/02-home-tablet-portrait.png), [Home in Aloft Cozy light](evidence/02-home-cozy-light.png), [Home with custom colors and larger type](evidence/02-home-voxel-custom.png), [Sounds expanded in the dock](evidence/03-audio-playing.png), [compact touch dock](evidence/03-island-swipe-open.png), [Workspace split](evidence/05-workspace-split-portrait.png), and [compact Notes editing](evidence/notes-09-compact-writing.png).

Run `npm run desktop:frontend-check` from `native/`, with `SYLF_FRONTEND_CHECK_OUT` to choose an evidence directory. The Notes group runs with `SYLF_WORKSPACE_CHECK_ONLY=notes npm run desktop:workspace-check`. For manual inspection, build the renderer and run `SYLF_FRONTEND_INSPECT=1 npm --workspace @sylf/desktop run frontend-check`. The disposable fixture login is `native_qa` with password `fixture-only`. It listens only on loopback and uses existing repository audio files. An ordinary build uses the project's configured backend.

## Limits

The Samsung tablet was unavailable. Desktop viewport and emulated touch checks cover the responsive and gesture paths. Physical touch, S Pen input, Android and iOS audio decoding, background playback and speaker output were not verified on hardware.

The World gate remains a labelled preview and its lobby reads the signed-in account. Notes files still live in the account's local library, and saved Workspace arrangements remain device preferences. The older Home and World check scripts contain assertions against the earlier template; the dedicated frontend check covers this revision.

Work and verification stayed local. The disposable PostgreSQL journey was not run because Docker was stopped and the root application dependencies were absent from this worktree.
