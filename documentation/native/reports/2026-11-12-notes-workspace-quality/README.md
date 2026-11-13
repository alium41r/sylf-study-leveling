# Sylf Native Notes, PDF, Whiteboard and Workspace quality pass

12 November 2026 · `phase-14-pen-settings` (working tree, uncommitted)

This pass audited the ink input paths, the editor around them, zoom, the writing toolbar and the Workspace layouts, and fixed what it found. The Home redesign ran in parallel and has [its own report](../2026-11-12-home-redesign/README.md). The [Workspace guide](../../workspace/README.md#11-notes-pdfs-whiteboard-and-resources-phase-14) describes the current controls.

**Status: verified on the Mac in the packaged Electron app and in a browser. Not verified on the Samsung tablet.** The tablet was connected but locked for the whole session, so the Android changes below compiled and were not run, and the Samsung Notes benchmark was not done. See [Not verified](#not-verified).

## What was wrong, and what changed

| Area | Finding | Change |
| --- | --- | --- |
| Eraser moved fast | Every edit to a page (an erase, a lasso move, an undo) made the ink model project **every** stroke on the page again. Each stroke got a new version, so its outline was recomputed and, on Android, sent to the native canvas again. One erase on a full page cost a full page. | `lib/notes/ink.ts` projects again only the strokes an arriving or leaving edit names. Every other stroke keeps the same edits in the same order, so the result is identical. `InkScene` also keeps each stroke's centre line while its version holds, because one sweep tests it many times. |
| Pen erasing instead of writing | Two causes were found. **(1)** The whole note editor rendered again on every ink notification, including every eraser batch. On a tablet that backs up the JavaScript thread, and a tap on Pen waits in the queue behind it, so the next stroke still reaches a surface whose tool is the eraser. **(2)** On desktop, a press whose lift was never heard (released outside the window) left an erase gesture open. The mouse then erased whatever it hovered over, and every later press was ignored. | **(1)** The editor, PDF view and whiteboard listen through `scene-face.ts`: they render only when what their chrome reads changes (undo and redo, the paper, where the ink ends). Android sends one eraser batch per input frame. **(2)** `InkView.web.tsx` ends a mouse gesture when the mouse moves with no button held, ends a stale gesture when the same pointer presses again, and forgets fingers whose lift was lost. |
| Palm first, then pen (Android) | `SylfInkView` read each event by its first pointer. With a palm down before the pen, the first pointer is the palm, so the pen's landing was ignored and its moves were treated as a finger's. | A pen stroke under way owns its events by its own pointer. A pen landing beside fingers takes the gesture (a pinch ends, a finger's stroke is dropped). After the pen lifts, a palm still resting neither writes nor scrolls. |
| S Pen side button | Holding the button always erased, with no way to turn it off for a hand that presses it by accident. | **Pen button erases** in the eraser's settings (on by default), kept with the pen preferences. The pen's eraser end always erases. |
| Precise eraser undo | Each batch of a precise sweep was its own undo step. | One sweep of either eraser is one undo step (`InkModel.edit(…, joined)`, closed by the sweep). |
| Zoom readout | The percentage changed only when a pinch ended, and only wide toolbars showed it. | A badge at the top right of the document shows the zoom at every step of a pinch, Control or Command and the wheel, a trackpad pinch and the zoom controls, then fades. It is its own small view (`ZoomBadge.tsx`), so a moving finger renders a few characters and never the document. Notes, PDFs and whiteboards all have it. The note toolbar's percentage now opens a zoom menu (in, out, fit width, 150%, 200%). |
| Toolbar | Tools were 17 pt glyphs in a centred row that **moved** whenever the tool in hand changed, because colours came and went beside them. A dark ink on a dark bar was an invisible swatch. The eraser's size was tied to the pen's width. Undo could be pushed out of sight in a narrow window. | Tools sit together on one plate at the leading edge and keep their place. The tool in hand carries its ink colour. Swatches sit in a ring that reads in every theme. Three quick sizes follow the tool (line width, or eraser reach). Undo and Redo are pinned beside the scrolling part. The eraser has its own panel: strokes or precise, its own size, the pen-button setting and **Clear this page** (one step, undone by Undo). Desktop shows the eraser's reach under the pointer before it touches anything. |
| Scrolling a document | The editor rendered again every 8 pt of scroll. | Layout follows the scroll in 40 pt steps, well inside the 160 pt the ink windows reach past the view, and exactly at both ends. |
| Selection box (Android) | The box is drawn from the scene; with the editor no longer rendering on every change it would have gone stale after a move. | The native surface listens to the scene while something is selected. |

## Decisions

- **The ink model fix is in the web's `lib/notes/ink.ts`**, not worked around in Native. The format, the records and the projection are unchanged; only the set of strokes projected after an edit is narrower. `joined` is an optional third parameter with the old behaviour as its default.
- **Render gating reads the scene one microtask after a change.** Undo history is updated after the edit is applied, so reading during the notification saw stale undo state. A burst of changes is read once.
- **The eraser's size is its own field** (`eraserSize`, 4 to 40 page units, default 8, which is what the old rule gave the default pen). Kept preferences from before simply take the default.
- **No new dependencies, stores, schemas or backend routes.** Document formats and saved preferences stay compatible.

## Verification

| Check | Result |
| --- | --- |
| Native unit tests | 644 passed, 1 existing skip, in 52 files. New: `packages/notes/src/ink-scene.test.ts` (untouched strokes keep their objects through an erase and a move, a fast sweep crosses every stroke, one sweep is one undo for both erasers, writing after an unclosed sweep) and `notes/scene-face.test.ts` (render gating, eraser size). |
| ESLint, import boundaries, single-copy | Clean. |
| TypeScript | Clean for everything outside Home at the time of the run; Home was mid-edit by the other agent. |
| Packaged Electron, Notes group | 62 of 63. Eight new assertions pass: the eraser panel opens and closes, tools keep their place, a lost lift stops erasing, the pen writes straight after an erasing sweep, the zoom shows while changing (106% to 162% in eight steps), at the top right (12 pt from each edge), and leaves. [Results](evidence/electron-notes-check.json) |
| Packaged Electron, Notes with layouts, compact, restore, windows and pinch | 110 of 111 before the new assertions were added. Every Workspace layout, window, drag, restoration and pinch assertion passed. [Summary](evidence/electron-layouts-and-notes-summary.txt) |
| The one failure, `formattingMenuAppliesAndResumesTyping` | Environmental. The heading is applied; focus stays on the Formatting button because Chromium does not dispatch focus events in a window without OS focus, and the check window ran behind the app driving it (`windowHasFocus: false` in the run's diagnostic). The same steps pass by hand in a focused browser. The check now waits for focus to settle and prints that diagnostic when it fails. |
| By hand, in a browser over the local fixture | Wrote, erased across strokes, opened the eraser panel, zoomed with Control and the wheel (the badge counted 108% to 261% live), dragged Timer from the dock to a point on the canvas, tiled four tools, typed and applied Heading 2 with typing resuming. |
| Android module | `:sylf-native-platform:compileReleaseKotlin` compiled without errors. |

Screenshots: [toolbar](evidence/notes-03f-toolbar.png) · [handwriting](evidence/notes-03-handwriting.png) · [annotated PDF](evidence/notes-04-pdf-annotated.png) · [whiteboard](evidence/notes-06-whiteboard.png).

Run the checks from `native/` with `SYLF_WORKSPACE_CHECK_ONLY=notes npm run desktop:workspace-check`, with the Electron window in front.

## Not verified

- **Nothing here ran on the tablet.** The Tab S9 FE was connected over ADB but locked, and unlocking it is the owner's. The palm and pen routing, the per-frame eraser batches, the pen-button setting, the selection box and the live zoom badge under a native pinch are compiled and unrun. The existing `android:notes-check`, `android:pen-check` and `android:pinch-check` need a fresh build (`ANDROID_HOME` set, then `./gradlew :app:createBundleReleaseJsAndAssets --rerun assembleRelease`).
- **Whether these fixes end the two reported input bugs on the device is not confirmed.** Both causes found are real and fixed, and both are covered by tests on the Mac, but the report came from the tablet and was not reproduced there first.
- **The Samsung Notes benchmark was not done**, for the same reason. The toolbar follows patterns that are common knowledge (tap the tool in hand for its settings, the pen shows its colour, an eraser with its own modes and size); nothing was compared on the device.
- **The web app's own ink tests** (`__tests__/notes/ink*.test.ts`) could not run here: this worktree has no root `node_modules`. The changed model is exercised through the native tests only. Run `npm run test -- --run __tests__/notes` in a checkout with root dependencies before merging.
- Stylus latency, pressure response and long-stroke cost on Android were not measured. The live stroke still recomputes its whole outline each frame, which grows with stroke length; that is a known candidate for the next pass and was left alone without a device to measure on.
- iOS still shows ink read-only (no native surface), as before.
