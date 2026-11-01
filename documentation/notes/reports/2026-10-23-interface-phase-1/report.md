# Notes interface redesign — Phase 1

Implemented locally on 23 October 2026. Phase 2 has not been started.

## Delivered

- A dedicated Notes workspace with one folder navigation, collapsible hierarchy, folder cards, actual content previews, grid/list views, search and sorting. Back to Sylf restores normal app navigation.
- Full-workspace documents with a compact contextual toolbar, pinned text/pen switching, top/bottom docking, focus mode and an on-demand page navigator. Dashboard chrome and nested editor containers are removed.
- Rich text, images and handwriting on the same page, including existing typed notes and handwritten notebooks. Each page has one repositionable rich-text region. Ink renders above both text and images. Long typing keeps its caret visible and extends the paper when needed.
- Bounded zoom, fit width, fit page, page copying/reordering/removal/restoration, and the existing working paper/color/spacing controls. Fit width adapts to resizing while preserving the reading position.
- One New note workflow, plus working PDF, image and native archive imports. Image import initializes its body and attachment in one durable creation revision. Existing PDF reading, selectable text and annotation tools remain available.

## Integrity and architecture

The existing BlockNote adapter, ink model/controller/renderer, encrypted repository, journal, recovery, history and Drive infrastructure remain the authorities. Layer creation is additive: original stream identities and content are retained. Page and document copies remap both layer references independently. Metadata writes serialize per document to preserve the pause/flush/adopt boundary.

Prepared notes require the validated `page-layers-v1` capability. Older readers refuse to edit them rather than ignoring a companion layer. Native format and database schema versions are unchanged. Native archives retain both layers and history; readable Drive PDFs combine text, images and ink, including original pages that have not been opened in the redesigned editor.

See the [current interface contract](../../interface.md) for the precise boundaries. Existing unrelated working-tree changes were preserved.

## Verification

| Check                                           | Result                                                         |
| ----------------------------------------------- | -------------------------------------------------------------- |
| Notes regression suite                          | **218 passed, 1 opt-in scale profile skipped**                 |
| TypeScript and changed-file ESLint              | Passed                                                         |
| Standard production build, `npm run build`      | Passed using Node 24 and a 6 GiB Node heap                     |
| Mobile production build and bundle verification | Passed; no server-only symbols or secrets in the client bundle |
| Browser functional/responsive scenarios         | Passed; [results](evidence/browser-results.json)               |

Browser checks exercise the production shared UI and encrypted persistence with synthetic authentication/Drive HTTP. Combined regression/browser coverage includes reload, mixed layers, independent copies, interrupted preparation, bounded zoom, text placement, focus/docking, nested folders, PDF/image import, image reload and overlaid ink, composite PDFs, zero pending synthetic cloud revisions, unopened legacy ink pages, and sustained typing.

Visual review covered 1440×960 desktop, 834×1112 tablet, 390×844 phone and 320×740 phone, light/dark modes, custom accents/backgrounds and a light-mode/dark-background combination. Evidence includes the [library](evidence/library-desktop-light.png), [tablet editor](evidence/editor-tablet-light.png), [phone editor](evidence/editor-phone-custom-dark.png), [image with ink](evidence/image-note-desktop.png), and [PDF reader](evidence/pdf-phone-light.png). Reproduce with the [browser harness](../../../../scripts/qa/notes-redesign/README.md).

Live Google-account acceptance, physical stylus/palm-rejection hardware and the opt-in long-history scale profile were not run here. This report does not claim deployment or those release qualifications. Readable PDF typography and thumbnail excerpts remain derived representations; native content is authoritative.

## Phase 2

Advanced academic/planner templates; additional brushes and pen presets; independent floating text boxes and richer region layout; higher-fidelity composite thumbnails and print typography. The current one-region-per-page model already supports typing and handwriting together.
