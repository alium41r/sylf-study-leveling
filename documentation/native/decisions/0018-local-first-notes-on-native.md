# ADR 0018 — Local-first Notes on Native, in the web's formats

**Accepted for Phase 14, 5 November 2026 (Proposed until the owner reviews Phase 14).** Builds on [ADR 0001](0001-technology-stack.md) (BlockNote in an Expo DOM component, native pen capture, PdfRenderer and pdf.js, SQLite) and [ADR 0006](0006-workspace-canvas-and-windows.md).

## Context

Sylf Web's Notes is a mature system: an encrypted IndexedDB repository with a commit DAG, a Google Drive broker and outbox, and BlockNote, ink and PDF editors ([Notes index](../../notes/README.md)). None of it reaches Native today. The server stores no notes, the broker refuses a native origin, the repository is bound to Dexie and WebCrypto, and the vault key comes from the web's unlock flow. Phase 14 asked for real Notes, PDFs and Whiteboard on Native. The owner's rule ([backend compatibility](../expansion/README.md)) forbids major new backend work.

## Decision

1. **One local Notes library per owner on each device** (`native/packages/notes`, `@sylf/notes`). Signed in, the owner is `user:<id>`; otherwise `device`. Notes made before signing in are offered to the account ("Move here"), never merged silently, following [ADR 0010](0010-session-ownership-before-sign-in.md).
2. **The web's formats, not new ones.** Every document is a `sylf-notes` envelope v1 descriptor that the web schema accepts (a test parses each kind), with Yjs streams in the web's own adapters: `blocknote/0.56.0` for typed notes, `sylf-ink/1` for handwriting and boards, `sylf-pdf/1` for PDF pages. Ink runs through the web's `InkModel`, PDF marks through `PdfMarkup`'s page map, and stroke outlines and paper through `lib/notes/ink-outline.ts`, extracted from the web renderer so both draw the same geometry. Native adds only `extensions.sylfNative` (surface, template, autoTitle, linkedTo, PDF geometry).
3. **Storage is simpler than the web repository, on purpose.** Per document: the descriptor, an append-only list of Yjs updates per stream (merged after 48), and assets by SHA-256 per owner. Each write is one transaction (IndexedDB on web and desktop, SQLite in WAL mode on Android and iOS). A failed write stops further writes and says why. There is no commit DAG, outbox or encryption at rest yet.
4. **Whiteboards are Notes drawing documents**: a one-page `notebook` of 3200 × 2200 page units marked `surface: "board"`, as the Study Workspaces plan asks.
5. **Rich text is BlockNote, written only by BlockNote.** The editor runs in an Expo DOM component, inline on desktop and in a WebView on Android. Its Y.Doc is a replica of the library's, and templates are inserted by the editor itself, because Phase 2 showed a hand-written node that misses the schema is deleted.
6. **Pen input is native on Android.** `SylfInkView` (Kotlin, in `@sylf/native-platform`) reads every `MotionEvent` with its history and draws the live stroke, then sends samples to JavaScript. Finished strokes come back as the web's SVG outlines. Desktop uses Pointer Events with coalesced samples. iOS has no native surface yet and shows ink read-only.
7. **PDF pages are rasterised by the platform** (pdf.js 6.4.299 on desktop with the web's local worker and resources; `PdfRenderer` on Android). Page units come from pdf.js on desktop. On Android they come from `PdfRenderer`, which omits UserUnit and the crop offset, so those documents carry `geometry: "native"`.
8. **One note kind, in the web's page-layers format** (`page-layers-v1`). Every page of a note has a background (its paper, a PDF page or a picture, `backgroundAssetId`), a text layer (a `blocknote/0.56.0` stream, `textStreamId`) and an ink layer (a `sylf-ink/1` stream, `inkStreamId`). A Type and Write switch chooses which layer the pen, fingers and toolbar act on. Ink is drawn above the text and pictures. Only the page being typed on runs an editor; every other page draws its text natively from the same Yjs fragment, read-only. Older typed-only and handwriting-only documents still open as they were.
9. **PDFs and pictures go into a note.** A PDF's pages are inserted after the last page with ink, text or a background, replacing the empty pages after it, so a fresh note takes the PDF's pages; the original is an asset, byte for byte. Pictures go into the text as BlockNote image blocks, or behind a page as its background. The descriptor still parses with the web's `documentSchema` (a test checks every case).
10. **Paper is per page and changeable at any time** (layout, spacing, colour, or a picture), for one page or every page, stored as the web's paper record in each ink stream. **Endless notes** are one page that grows as it is written near its end; the choice is kept in `extensions.sylfNative.flow`, and the web reads such a note as one tall page (height capped at 60000, inside the schema's limit).
11. **Folders are library records, not documents.** A notebook record has an optional parent, colour and icon; deleting a folder moves its contents up, and a move that would make a loop is refused. Descriptors keep only `folderId`, as on the web.
12. **One shared fix in the web's ink model.** `InkModel` advanced its scene version only when a stroke was drawn or redrawn, so erasing the last stroke left every cached view showing it. A stroke leaving the scene now advances the version too (`lib/notes/ink.ts`, with a web regression test).

## Consequences

- Native notes stay on the device that made them. **Sync with Sylf Web's Notes is deferred**: it needs the broker to accept a native client and a native repository that passes the web's conformance suite (master plan R5). The formats chosen here make that a transport problem, not a migration.
- Local data is not encrypted at rest beyond the platform's app sandbox. This is an open gate for the owner (master plan A1, R5).
- PDF annotations made on Android may need their transform corrected before a future PDF export writes them into the original.
- Each typed-note editor on Android is a WebView, so at most two run at once; others show their text until touched.

## Rejected

| Option | Why not |
| --- | --- |
| Run the web `IndexedDbNotesRepository` everywhere | Hermes has no IndexedDB or WebCrypto. The vault needs the web unlock flow, which refuses a native client. |
| A Native-only document format | It would split the product's notes in two, against O8 and ADR 0001. |
| A native rich-text editor | Phase 2: schema mistakes delete web users' content. |
| Rendering finished strokes with react-native-svg on Android | One SVG tree per page re-renders on every stroke. The native view draws finished paths in the same pass as the live stroke. |
