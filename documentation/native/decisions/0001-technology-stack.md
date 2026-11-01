# ADR 0001 — Sylf Native technology stack and platform architecture

**Status: Accepted (Phase 2 approved by the owner, 30 October 2026).** Evidence, measurements and limitations are in the [Phase 2 report](../reports/phase-2/report.md). The [master plan](../master-plan.md) gives the product context. Version numbers are those verified on the date above; Phase 3 re-checks them when it pins dependencies.

## Context

Sylf Native must deliver three Spaces (Home, Workspace, World) as a premium, large-screen-first app on iPad and Android tablets, macOS and Windows desktops, and later a phone companion. It must reuse Sylf's TypeScript domain logic and its exact data formats: Notes envelope v1, Yjs 13 update streams, `sylf-ink/1` and `sylf-pdf/1` page units. It must also reuse the existing Next.js API backend, without changing the web app. The highest technical risks are:

- pen input and ink-format parity;
- rich-text compatibility with the BlockNote/ProseMirror Yjs schema;
- PDF annotation geometry;
- durable local storage;
- Workspace multitasking;
- a credible desktop runtime;
- isolating the World game engine.

## Decision

**One React Native application codebase with two runtimes:** native on tablets and phones, and Chromium on desktop. Platform-specific adapters sit behind shared interfaces.

| Layer | Decision |
| --- | --- |
| Language | TypeScript (strict) everywhere above the platform layer. Swift and Kotlin only inside native modules. |
| Tablet and phone runtime | React Native (New Architecture only) with **Expo SDK** using Continuous Native Generation and development builds, not Expo Go. Hermes V1 is the JavaScript engine. Verified at **Expo SDK 58 / React Native 0.88.1 / React 19.3.0**. |
| Desktop runtime (macOS and Windows) | An **Electron** shell hosting the **web build of the same React Native app** (react-native-web, bundled by Expo/Metro). Desktop uses the *web* implementations of platform adapters, which are largely Sylf's existing, qualified web owners. Chromium M156 was verified; Electron 45 ships the same Chromium. |
| Phone companion | Same app and binary per store listing, with a separate `phone` frontend package selected by window size class and device capability. It shares the domain, design-system and adapter packages. |
| Navigation | A custom Spaces shell (Home / Workspace / World) owning top-level state. Expo Router is used *inside* Home and phone for screen stacks. Workspace uses its own window manager, not a router. |
| UI rendering and design system | React Native core views plus a Sylf design-system package with an **original native visual language** (owner direction, 30 October 2026; master plan §7.2). The web app is a reference only for functionality, branding and user preferences. Saved appearance preferences (mode, custom accent and background) are honored as inputs, and `lib/color-utils.ts` is used only for color math, not as the native token set. |
| Animation and gestures | Reanimated 4 with Worklets on the UI thread, and React Native Gesture Handler 3. Verified on desktop Chromium. Tablet verification is in the report. |
| Canvas and custom drawing | React Native Skia for native custom drawing (live ink overlay, Workspace canvas chrome, Pixel Display renderer). On desktop, use DOM/Canvas 2D implementations where Skia's CanvasKit (7–8 MB WASM) is not justified. |
| Workspace multitasking | An app-level window manager. Layout state (regions, panels, presets) is plain serializable data in a store. Panel geometry is animated with shared values on the UI thread, and tools implement the lifecycle contract from the [master plan §2.2](../master-plan.md#22-workspace--advanced-study-environment). |
| Handwriting capture | **Native modules per platform** produce `sylf-ink/1` samples. The measured requirement: native capture received about 419 samples/s against about 47/s on the JS gesture path. Android uses raw `MotionEvent` capture including historical samples, with low-latency rendering through androidx.ink 1.0 *or* a custom front-buffered renderer. The androidx.ink integration inside a React Native view is unresolved (see the report, §5.4). iOS uses UIKit touches with coalesced and predicted touches, rendered with Metal or Skia. PencilKit may only be used if its output is converted, never as stored authority. Desktop reuses the existing web ink controller (Pointer Events, `getCoalescedEvents`, `navigator.ink`). Stroke geometry is `perfect-freehand` (the `sylf-1` brush) computed in shared TypeScript. |
| Rich text | **BlockNote 0.56 running in an Expo DOM component** (`"use dom"`, a WebView on native, inline on desktop). The authoritative `Y.Doc` replica lives in the native host and syncs with the editor's replica through Yjs update messages. A native-written rich-text editor is **not** adopted (see Rejected). |
| PDF | Native rendering: PDFKit on iOS/macOS, `PdfRenderer` on Android (validated in the report), pdf.js on desktop. **Page units are always computed by Sylf** from the PDF's CropBox, rotation and **UserUnit** to reproduce the pdf.js scale-1 viewport. Native page bounds are never trusted directly. |
| Offline storage | **SQLite** (`expo-sqlite` in WAL mode) implements a native `NotesRepository` and the other local stores behind the existing repository type seam. Desktop keeps the existing IndexedDB repository. One conformance suite runs against both. |
| Encryption and crypto | `expo-crypto` for random values, UUIDs, SHA-256 and AES, behind a small `crypto.subtle`-shaped adapter matching what `lib/notes/vault.ts` and `bytes.ts` use. Credentials go in the iOS Keychain or Android Keystore (`expo-secure-store`). |
| Synchronization | The existing Notes provider-neutral sync contract (immutable packs, commit DAG) and the existing Sylf API for server data. Yjs 13 throughout, pinned to a single copy per bundle. |
| Networking and AI streaming | `expo/fetch` (the WinterTC fetch default since SDK 56; streaming bodies and `TextDecoder`) for Sylvie's SSE. A typed API client generated from or checked against existing route contracts. |
| Authentication | A new **native session** mode on the existing backend (Phase 11–12). Tokens are kept in secure storage, preserving the `tokenVersion` revocation guarantees of `lib/auth-server.ts`. Web cookie behavior is unchanged. |
| Background timer, audio and notifications | Native modules: an iOS Live Activity/ActivityKit plus local notifications, and an Android foreground service plus notifications. A durable native timer journal (SQLite) mirrors `lib/timer-sync.ts` semantics. Audio uses a native player with background playback. |
| World game engine | **Deferred to Phase 15.** Phase 9 builds an engine-agnostic `WorldHost` (mount, suspend, save, teardown, memory report) with a placeholder viewport. Shortlist: Godot via LibGodot embedding, Unity as a Library, or a WebGPU/WebGL JS engine. |
| Repository | A new top-level `native/` npm workspace with its **own lockfile and dependency tree**. Sylf `lib/` is consumed in place through a validated Metro resolver rule, and the root web package is unchanged. See the [report's repository proposal](../reports/phase-2/report.md#4-proposed-repository-structure-and-package-boundaries). |
| Builds and deployment | EAS Build (cloud) or local Gradle/Xcode for mobile, with EAS Update for JS-only updates where store policy allows. Desktop uses electron-builder (or Electron Forge) with signed and notarized DMG/MSIX and an update channel. All pipelines are set up in Phase 17. |

## Why this is the simplest architecture that meets the whole vision

1. **The heaviest existing assets are TypeScript and web-native.** These are the Notes engine (2,396-line repository, sync DAG, ink, PDF anchoring), BlockNote/Yjs, the progression engines, the planner contracts and the appearance generator. The spike ran them unmodified on V8 and in the React Native web build, with byte-identical result hashes. Any non-TypeScript stack must re-implement and re-qualify them.
2. **Desktop gets real compatibility, not a port.** On desktop, Electron's Chromium runs the exact web owners Sylf already qualified: IndexedDB Notes repository, BlockNote, pdf.js and the Pointer Events ink controller. Electron also gives the same engine on macOS and Windows.
3. **Tablets get native quality where it matters.** Pen capture, PDF rendering, storage, background sessions and the game host are native modules. Everything else is React Native views driven by UI-thread animation.
4. **One component tree, one design system.** Home, Workspace chrome, Command Center and the phone companion are written once. Platform differences are adapter implementations chosen by file extension (`.native.ts` / `.web.ts`) or capability checks, not separate apps.

## Consequences

- Native module work is unavoidable and is scheduled: ink (two platforms), PDF, SQLite repository, secure session, background timer, audio, file/share and World host. Each module needs device qualification.
- Desktop memory is higher than a fully native desktop app. A Chromium app-mode shell measured 405–518 MB total physical footprint on macOS. This is accepted for desktop/laptop targets and is budgeted in Phase 16.
- React Native and the web app are pinned to **different React versions** (19.3.0 vs 19.2.4). The native workspace must never share a hoisted `react` with the root package.
- Shared modules must resolve stateful dependencies (Yjs, zod) to a single copy. The spike reproduced Yjs's duplicate-import warning when this was violated.
- Expo does not support macOS (SDK 58 release notes) and `react-native-macos` lags core (0.83 vs 0.88). Desktop therefore goes through Electron, not native React Native desktop.
- iOS work requires Xcode 26.4 or later on a Mac with enough memory, or EAS cloud builds. The current development Mac has no Xcode, so all iPad items are unverified (see the report).

## Rejected alternatives

| Alternative | Reason |
| --- | --- |
| Flutter (all platforms) | Strong renderer and desktop support, but no reuse of Sylf's TypeScript domain, Notes engine, Yjs or BlockNote. Rich-text compatibility would still need a WebView editor, splitting the stack across Dart and JS. Multi-window desktop is not in Flutter 3.47 stable. Yjs in Dart depends on immature y-crdt bindings. |
| Fully native (SwiftUI + Jetpack Compose + WinUI) | Best per-platform fidelity, but three UI codebases plus a re-implemented domain. The cost far exceeds the measured benefit, since native quality is achievable through targeted native modules. |
| Kotlin Multiplatform / Compose Multiplatform | iOS has been stable since 1.8 and desktop runs on the JVM, but it still requires a Kotlin rewrite of TypeScript domain logic and the Notes engine, has no Yjs, and puts iOS pen rendering through Skiko instead of native views. |
| React Native for macOS/Windows as the desktop runtime | Lags core (macOS 0.83 vs 0.88 core). Expo does not support it, and key libraries (Skia v3 on Windows, Expo modules) are missing or partial. This would create avoidable limitations. |
| Tauri (instead of Electron) | Smaller memory footprint, but WebKit on macOS and WebView2 on Windows diverge (for example, `navigator.ink` low-latency ink is Chromium-only), adding a Rust layer and two engines to qualify. Kept as the fallback if desktop memory becomes a blocker. |
| Capacitor/WebView for tablets (extending `mobile/`) | Pen latency, gesture fidelity and native feel are the core requirement. Notes Phase 6 already left native input as an open gate for the WebView path. |
| A native rich-text editor writing BlockNote's Yjs schema | The spike showed y-prosemirror **deletes** any Yjs element that fails schema validation. A second implementation of the schema risks silent data loss for web users. |
| PencilKit drawings as the stored ink format | Proprietary format, not `sylf-ink/1`, and not renderable identically on Android, desktop or web. |
| Expo Go / managed-only workflow | Custom native modules (ink, PDF, World host, background session) require development builds. |
