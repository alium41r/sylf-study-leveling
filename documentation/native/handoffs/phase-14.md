# Phase 14 handoff — for Phase 15 (Sylf World)

**Written 5 November 2026.** Phase 14 (Advanced Native Workspace) is complete and **awaiting the owner's review**. Read the [Phase 14 report](../reports/phase-14/report.md) first: what was built, how it was verified, the measurements, and the limits. **Do not start Phase 15 without the owner's brief.** Sylf World is not started: nothing under `spaces/world/` changed in Phase 14.

## 1. State

| | |
| --- | --- |
| Branch | `phase-14`, pushed to `origin`, based on `expansion-part-3` (07f9ec2). Not merged, not deployed |
| Worktree | `~/Desktop/sylf-phase-14` (the main checkout belongs to another agent's Planner work: never `git add` a directory there) |
| Hosted services | None touched. No hosted database, Supabase, Redis, Vercel or AI provider was used |
| Web app | One shared-code change: `lib/notes/ink-outline.ts`, extracted from `ink-renderer.ts` and `pdf-export-core.ts`, which re-export it. Web behaviour is unchanged |

## 2. What Phase 14 added (where to look)

| Thing | Where |
| --- | --- |
| Notes library (local-first, the web's formats) | `native/packages/notes/src/` (`library.ts`, `documents.ts`, `templates.ts`, `ink-scene.ts`, `idb-storage.ts`), and `apps/sylf/src/shell/notes/` (owner, SQLite, hash) |
| Notes, PDFs, Whiteboard tools | `apps/sylf/src/spaces/workspace/notes/` (`DocumentTool`, `LibraryBrowser`, `RichTextDom` + `RichTextEditor`, `InkView.{web,native}`, `PagedInk`, `BoardCanvas`, `pdf-engine.{web,native}`, `PdfPageImage.{web,native}`) |
| Android pen surface and PDF renderer | `packages/native-platform/android/.../SylfInkView.kt`, `SylfPdf.kt`, registered in `SylfNativePlatformModule.kt`; JS in `packages/native-platform/src/ink-view.ts` |
| Resource Shelf | `spaces/workspace/tools/ResourcesTool.tsx` |
| Saved layouts | `packages/spaces/src/workspace/windows.ts` (`NamedLayout`, `saveNamedLayout`, `applyNamedLayout`), the Command Center layout menu |
| Drag and drop (desktop) | `spaces/workspace/drop.{ts,web.ts}`, `notes/open-window.ts` |
| Decisions | [ADR 0018](../decisions/0018-local-first-notes-on-native.md) |
| Guide | [Workspace guide §11](../workspace/README.md#11-notes-pdfs-whiteboard-and-resources-phase-14) |
| Electron check | `apps/desktop/src/workspace-check.mjs`, group `notes` (`SYLF_WORKSPACE_CHECK_ONLY=notes`) |

## 3. Rules Phase 15 inherits

1. **One authority each.** The study session (`createStudySessionModel`) is the only clock; World entry still refuses a running session. The Notes library is the only owner of documents: World must not keep its own copy of a note or a PDF.
2. **Documents stay in the web's formats** (ADR 0018). Never write a `blocknote/0.56.0` stream by hand.
3. **Typed-note editors are WebViews on Android.** World must not run while a heavy Workspace is warm: the existing World host isolation (ADR 0007) and Workspace's lifecycle budget already unmount Workspace content, keep it that way.
4. Rewards are never computed on a client; World reads progression from the server.
5. World art stays authored and theme-independent, and the PDF reference is image-only ([World visual direction](../world/README.md)).
6. Everything from earlier handoffs still holds: no token in Electron's renderer, `@sylf/backend` behind `import()`, no screen calls `fetch`, a store build shows no sample.

## 4. What Phase 15 needs to know from Phase 14

- `@sylf/native-platform` now carries a native **view** (`SylfInkView`) as well as functions. It is the pattern for a native World host view: an `ExpoView` registered in the module, required lazily (`nativeInkView()`), with a JavaScript fallback where it is absent.
- The Android build now includes `expo-sqlite` and Expo DOM components (`@expo/dom-webview`). Any World build must keep them.
- Workspace memory: with two typed notes open on Android, two WebViews are alive. World's entry should be measured with that worst case, not an empty Workspace.
- The tablet can now be driven with `adb shell input stylus ...` for pen paths (see the report), which World's touch controls can reuse for automated checks.

## 5. Open items for the owner (not Phase 15's to solve)

See the report's §7 for the full list. In short: the tablet's by-hand pen checks (latency, palm rejection, S Pen button), iOS (no native ink or PDF yet; read-only ink), syncing Native notes with web Notes (needs the broker to accept a native client), encryption at rest, and PDF export from Native.
