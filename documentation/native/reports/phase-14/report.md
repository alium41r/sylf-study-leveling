# Phase 14 report — Advanced Native Workspace

**Status: complete, awaiting the owner's review.** 5 November 2026, branch `phase-14` (pushed, not merged, not deployed). The owner's brief asked for Sylf Notes (rich text, handwriting, S Pen, templates, notebooks, document management, local-first), PDFs (import, view, annotate, joined to Notes), a Whiteboard, a Workspace with multitasking, several document windows, drag and drop, saved layouts and good resource use, reusing Sylf Web and its backend rather than rebuilding them. During the phase the owner added: one note kind for typing, handwriting, PDFs and pictures; editable page layouts; folders; full-screen arrangements of several tools; a dot grid that shows the zoom; managing many windows at once; a command palette; endless notes and pulling to add a page; a page-only full screen; sound in the timer dock; and a fix for erasing the last stroke. All are built and verified (§1, §3). Decisions: [ADR 0018](../../decisions/0018-local-first-notes-on-native.md). Next: [Phase 14 handoff](../../handoffs/phase-14.md). Sylf World was not started.

## 1. What changed

| Area | Before Phase 14 | Now |
| --- | --- | --- |
| **Notes** | A read-only sample note; "Notes open on the web for now" when signed in | A real local library per owner with **one note kind**: pages you type and write on, each with paper, a text layer (BlockNote 0.56, the web's editor) and an ink layer, and a **Type / Write** switch that changes the toolbar. **Insert** a picture into the text, a PDF after the last written page (a fresh note takes the PDF's pages), or a page. **Page settings** change layout (ruled, grid, dotted, Cornell, music, planners), spacing (narrow, medium, wide), paper colour or a picture, for one page or all, at any time. **Endless notes** grow as you write; paged notes add a page when you pull past the end. **Folders and subfolders** with colours and icons, search over titles and text, pin, duplicate, trash and restore, automatic titles, six typed templates |
| **Handwriting and S Pen** | Disabled pen and eraser buttons | Pen with pressure and tilt, highlighter, eraser (whole strokes or precise), lasso select, move, scale and recolour, line, rectangle and ellipse, undo and redo. **Android:** a native surface (`SylfInkView`) reads every digitizer sample with its history and draws the live stroke itself; the S Pen's button or eraser tip erases. **Desktop:** Pointer Events with coalesced samples. The first pen stroke turns fingers into scrolling |
| **PDFs** | A stand-in page of text | Import from the file picker or by **dropping a file on Workspace**; pages rendered by pdf.js 6.4.299 (desktop) or Android's PdfRenderer, cached; pen and highlighter on every page; zoom; page count; **"Take notes beside this"** opens a linked Lecture note next to the paper, with chips that jump between them |
| **Whiteboard** | A static circle | A 3200 × 2200 board on dotted, grid or blank paper, with the full pen case, pan, zoom (fingers, wheel, Control and the wheel), "show everything", and its camera kept in the window |
| **Resources** | Sample shelf entries | A shelf over the whole library: kinds, **subjects** and notebooks; the subject being studied first; new documents take the study session's subject |
| **Workspace** | Presets and one arrangement | **Full screen**: tools tile the whole screen with no chrome, any arrangement by dragging seams and docking tiles against each other's edges; a document's **Full screen** button (at the toolbar's right end) leaves only the toolbar and the page. **Named saved layouts**; a **Windows sheet** to open several tools, close or minimize chosen windows, or clear the canvas; a dot grid whose spacing shows the zoom; desktop drag and drop; a **running-editor budget** (two on Android, six on desktop). Audio left the shelf for the timer dock |
| **Note style and naming** | Several New options | A **gear** in the Notes and Whiteboard libraries sets how new notes start: separate pages or endless, layout, spacing, paper colour, starting template, Type or Write, and the whiteboard background. **New** asks for a name, then opens the note in that style. A note's name is **edited in its window's title bar**, and its own settings are behind a gear in its toolbar |
| **Everywhere** | Workspace's own quick switcher | A **command palette** from the search button in every Space or Command/Control + K: notes by title or text, tools, windows, places, the session, layouts and actions. **Sound in the timer dock**: choose, play and set the volume of a sound from anywhere, with moving bars beside the timer while it plays |
| **Lifecycle** | | Notes are written when the app is backgrounded and before sign-out (ADR 0011) |

The formats are the web's own: `sylf-notes` envelope v1, `blocknote/0.56.0`, `sylf-ink/1`, `sylf-pdf/1`. The web's `InkModel`, `PdfMarkup` page maps, note styles and paper templates are used in place through `@sylf/shared`. One shared module was added: `lib/notes/ink-outline.ts`, extracted from the web renderer so web and Native draw identical stroke outlines and paper.

## 2. Backend compatibility

Nothing new on the server. Notes are local-first by design on the web too: the server stores no notes and the Notes broker refuses a native origin (Stage 3, G-13). Native keeps documents on the device in the web's formats, so a later sync is a transport, not a migration (ADR 0018). Subjects for Resources come from the existing `/api/subjects` read. `LIMITED_TOOLS` is now empty, and the sample Notes, PDFs, boards and shelf were removed from Workspace's adapters.

## 3. Verification

All on 5 November 2026, on the final code unless a row says otherwise.

| Check | Where | Result |
| --- | --- | --- |
| Native unit tests (`npm test`) | Mac | **609 passed**, 1 skipped (47 files). New: 17 Notes library tests (every kind parses with the web's `documentSchema`, ink survives a restart in `sylf-ink/1`, shared replicas, erase and lasso and undo, erasing every stroke and across gaps with one undo per sweep, the page-layered note, PDF pages after the writing, picture backgrounds, folders, endless notes, pages, trash, adoption, failure stops writes, linking, auto-titles), saved-layout and full-screen arrangement tests, and command palette ranking |
| Native typecheck, ESLint, boundary audit, single-copy | Mac | Clean. Boundary audit: 0 violations over 392 files |
| Web Notes tests (`__tests__/notes`) | Mac, root Vitest | **269 passed**, 1 skipped, including a new regression test for erasing the last stroke. ESLint on the changed `lib/notes` files: clean |
| Electron Workspace check, all groups | Mac, production export | **224 of 224 passed** before the owner's 6 November tablet report; the `notes` group, rerun on the final code with three new checks (New asks for a name, opens the named note, rename in the title bar), passes **39 of 39**. All groups ([evidence](evidence/electron-workspace-check.json)), run in batches by group. The `notes` group (36) covers typing on a note's page with markdown shortcuts and the "/" menu, autosave and reload, mouse and pen strokes in Write, eraser and undo, **one sweep erasing every stroke and one undo restoring it**, pull to add a page, Full screen (Page only) in and out, an endless note growing, PDF drop and pdf.js render, notes beside, saved layouts, whiteboard zoom, the shelf, the command palette finding a note by its text, and Sound in the dock. New elsewhere: every Command Center button on one centre line, Audio off the shelf, Command/Control + K opening the palette, and dot spacing following the zoom (measured 11.2, 9.8, 14, 19.9, 28, 39.3 and 56 pt at zoom 0.2 to 2). Six themes, light and dark, and custom colours still pass. A single all-groups run stalled once after the pinch group; that group passed 14 of 14 when run alone |
| Live Electron journey on a disposable backend | Mac, Docker PostgreSQL | **34 of 35** (run before the later additions). The one miss is Circle's "unblocking empties the list" timing, which Phase 14 did not touch |
| Android release build | Mac, Gradle | Builds (44.8 MB APK). Set `ANDROID_HOME` (prebuild regenerates the project without `local.properties`), and after changing only shared packages pass `:app:createBundleReleaseJsAndAssets --rerun`, because Gradle does not see changes outside the app folder and would ship the old bundle |
| Tablet, Galaxy Tab S9 FE, Android 16 | **Real device** | Library, handwriting with `input stylus` (stylus tool type), eraser, finger scrolls a pen page, persistence across a force-stop, whiteboard draw and finger pan, typed note in the WebView with the Lecture template and typing, PDF import through the system picker and PdfRenderer, highlighter and pen on the page, split layout. Automated: `npm run android:notes-check` passes **12 of 12** on the final build ([evidence](evidence/android-notes-check.json)): New with a name, the unified note in Write, **one eraser sweep removes every stroke** (3918 dark pixels to 0, read from the screen), Full screen in and out, the whiteboard, **typing from a tap anywhere on the page and that text showing in Write**, the command palette and Back closing it, and Sound in the timer dock. Also on the device: two-finger zoom on a note and a whiteboard (100% to 261%), live and finished strokes the same width (6 px), and rough loops becoming clean rectangles and ellipses. By hand over adb: fourteen flings to a note's end and a short pull add no page; one held pull adds one |

What the tablet run could not do: `input stylus` sends no pressure, tilt or hover, there is no palm, and pinch needs two real fingers. Those stay on the by-hand list (§7).

## 4. Performance

| Measure | Device | Result |
| --- | --- | --- |
| Writing a page (frames while the stylus writes) | Tab S9 FE | 1.77–1.86% janky; p50 14 ms, p90 15–17 ms, p99 16–18 ms (1.77% and p99 16 ms on the final build, in the unified note) |
| Writing on a whiteboard | Tab S9 FE | 2.17% janky; p90 13 ms |
| Panning the canvas with Notes, PDFs and Resources open | Tab S9 FE | 3.65% janky; p90 15 ms, p99 17 ms |
| Memory (PSS) | Tab S9 FE | Earlier build: handwritten page 175 MB; with a typed note's WebView 217 MB; Notes, PDFs and Resources in a split 254 MB. Final build, after the run's other steps: a unified note in Write 199 MB; with the typing WebView 266 MB. The rise is the paper layer's second native view per visible page and the palette and dock surfaces; it is within the earlier split's range |
| Pointer handling per pen sample | Electron, M1 | p95 0.6 ms; frames p95 18 ms at 60 Hz while writing |
| Start-up bundle | Web export | BlockNote and ProseMirror first landed in the shared start-up chunk (1.3 MB). Now the editor is its own 1.1 MB chunk that loads with the first typed note, and the start-up shared chunk is 156 KB. pdf.js is a 540 KB chunk that loads with the first PDF |
| Samples kept | Both | Android reads every `MotionEvent` with its history (Phase 2 measured about 419 per second); desktop reads coalesced Pointer Events |

Pen-to-photon latency was not measured: that needs a high-speed camera, as Phase 2 said.

## 5. Screenshots

Tablet, final build: [text in Write](evidence/tablet-17-text-in-write.png), [shapes](evidence/tablet-18-shapes.png), [a whiteboard pinched and a shape](evidence/tablet-19-whiteboard-pinched-shape.png), [a note zoomed with two fingers](evidence/tablet-20-note-pinch-zoom.png), [writing in the unified note](evidence/tablet-11-unified-note-writing.png), [erased everything](evidence/tablet-12-erased-everything.png), [full screen](evidence/tablet-13-full-screen.png), [command palette](evidence/tablet-14-command-palette.png), [sound in the dock](evidence/tablet-15-dock-sound.png), [a page added by pulling](evidence/tablet-16-pull-added-page.png).

Tablet, earlier build (real device, Voxel theme): [library](evidence/tablet-01-library.png), [stylus handwriting](evidence/tablet-02-stylus-handwriting.png), [eraser](evidence/tablet-03-eraser.png), [finger scrolls](evidence/tablet-04-finger-scrolls.png), [after a force-stop](evidence/tablet-05-after-force-stop.png), [whiteboard](evidence/tablet-06-whiteboard.png), [typed note](evidence/tablet-07-typed-note.png), [PDF through PdfRenderer](evidence/tablet-08-pdf-pdfrenderer.png), [PDF annotated](evidence/tablet-09-pdf-annotated.png), [split layout](evidence/tablet-10-split-notes-pdfs.png).

Desktop, final code: [erased everything, then undone](evidence/desktop-notes-08-erased-and-undone.png), [a page added by scrolling on](evidence/desktop-notes-09-pull-added-page.png), [Full screen, page only](evidence/desktop-notes-10-full-screen-page-only.png), [command palette](evidence/desktop-notes-11-command-palette.png), [sound in the dock](evidence/desktop-notes-12-dock-sound.png).

Desktop (Electron, production export, earlier): [empty library](evidence/desktop-notes-01-empty-library.png), [typed note](evidence/desktop-notes-02-typed-note.png), [handwriting](evidence/desktop-notes-03-handwriting.png), [PDF annotated](evidence/desktop-notes-04-pdf-annotated.png), [notes beside a PDF](evidence/desktop-notes-05-notes-beside-pdf.png), [whiteboard](evidence/desktop-notes-06-whiteboard.png), [shelf](evidence/desktop-notes-07-shelf.png), and themes: [custom colours light](evidence/desktop-theme-custom-colors-light.png), [custom colours dark](evidence/desktop-theme-custom-colors-dark.png), [Cozy light](evidence/desktop-theme-cozy-light.png), [Arcane dark](evidence/desktop-theme-arcane-dark.png).

## 6. Bugs found and fixed

- An unguarded `setPointerCapture` threw when a pointer was cancelled before the handler ran, and blanked the app.
- The ink tool store returned a new object on every read after the first pen stroke, an infinite render loop.
- The DOM component's re-export of its own types recursed on the web (`drop.web.ts`), a stack overflow at start-up.
- BlockNote's suggestion-menu store passes `{ currentVal }`, not the state; the "/" menu never opened until that was read.
- Editors in an overview-zoom Workspace are rightly read-only; a note's editable flag now follows the window's lifecycle on every render.
- **On the tablet:** the app crashed when Workspace opened, "Cannot find native module 'ExpoSQLite'". The prebuilt `expo-sqlite` 58.0.15 library calls a `SharedObjectRegistry.register` signature this `expo-modules-core` lacks (`NoSuchMethodError`). `app.config.ts` now sets an SQLite build property so the module compiles from source against the installed core, and SQLite loads lazily, so a storage failure can only stop Notes, never the app's start.
- BlockNote mounts on its host element, so the editor's own styles (descendant selectors) never applied; it now mounts inside a styled wrapper, and the placeholder style targets BlockNote's `::after`.
- The start-up bundle carried BlockNote (above, §4).
- Four new scroll views lacked `keyboardShouldPersistTaps`, which the keyboard-taps test caught.
- **Reported by the owner: erasing left the last stroke.** The web's `InkModel` advanced its scene version only when a stroke was drawn or redrawn, so removing the final remaining stroke left every cached view (Native's and the web's) showing it. Fixed in `lib/notes/ink.ts` with regression tests on both sides. The eraser also tested only its sample points, so a fast sweep skipped strokes between them; gaps are now filled, and one sweep is one undo step.
- A picture in a note hid the handwriting under it: paper, text and ink were one layer order. Paper now sits under the text and pictures and ink over them.
- Library cards nested a button inside a button (invalid on the web, and on touch the inner one took the long press, so card menus never opened on the tablet). `ContextArea` now hands its long press to the card.
- Scrolling past a note's last page with a wheel carried on into the canvas and panned the window off screen. A document's pages now keep the wheel at their end.
- **Reported by the owner:** the Command Center's Windows button sat above the row; its tooltip anchor aligned to the start. The Electron check now measures every button's centre.
- **On the tablet:** with the palette open, the timer dock could still be tapped and opened over it. Android's new architecture flattens views that draw nothing, so the dock's zIndex competed with the overlay layer. Overlays now have their own layer above the app.
- **Reported by the owner from the tablet (6 November):**
  - Typed text was invisible in Write. Each paragraph was `flex: 1` in a column, which Android lays out at zero height (the web forgives it); found from a dump of the live view hierarchy. Text now keeps its height and draws at full strength. A tap anywhere on a page's empty text area also starts typing, since the editor is only as tall as its text.
  - Fingers could not zoom a page. Two fingers now zoom a note about the point between them (one finger still scrolls); whiteboards already pinched (100% to 261% on the tablet).
  - The live stroke was thicker than the finished one. Android drew it at the brush width while the outline narrows with pressure; it now uses the outline's own thinning (exported from `lib/notes/ink-outline.ts`) and measures the same width live and finished.
  - The shapes tool drew dots and leaves: shapes came from the first and last points, and their corners went through handwriting smoothing. A shape now takes the bounds of the whole gesture, previews as the shape, and is drawn as an even line in the shared outline (which also fixes shapes on the web).
  - The Full screen control was too large; it is a small pill.
- **On the tablet:** pulling to add a page first counted any swipe that ended at the note's end, then any fling that started there (six flings added six pages). Android also hands a drag to the native scroll view and cancels JavaScript's touches, so finger travel cannot be read. The pull now uses the scroll view's drag events: it must start at the end of the last page and be released held, not flung, with the zone fully shown.

## 7. Limits and open items

| Item | State | Who |
| --- | --- | --- |
| Sync with Sylf Web's Notes | Not built: native notes stay on the device (ADR 0018). Needs the broker to accept a native client (G-13) and a native repository qualified by the web's conformance suite | Owner, later phase |
| Encryption at rest | App sandbox only | Owner's product gate (A1, R5) |
| iOS | No native ink or PDF renderer; ink shows read-only, PDFs say a newer build is needed. Not built or run (no Xcode) | Later |
| By-hand S Pen checks | Pressure, tilt, palm rejection, the side button and eraser tip, hover, perceived latency, two-finger pinch on a board | Owner, [tablet checklist](../../handoffs/tablet-checklist.md) |
| PDF geometry from Android | Page units match pdf.js except UserUnit and the crop offset (`geometry: "native"`) | A future PDF export corrects it |
| PDF text search and export, text boxes on boards | Not built | Later |
| Hardware keyboard hook on tablets (ADR 0008 decision 27) | Not built | Later |
| Typed-note toolbar on phones | Scrolls sideways; works, not tuned | Later |

Nothing was deployed. No hosted service, database or AI provider was touched. The tablet's study timer and the owner's files in the system picker were left alone; the test PDF was pushed to Downloads and can be deleted.
