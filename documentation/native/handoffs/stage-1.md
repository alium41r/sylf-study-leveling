# Sylf Native — Stage 1 handoff (Phases 1–3)

**Written 30 October 2026 at the end of Phase 3.** Read this first in a fresh session. It is self-contained and links to the documents that hold details and evidence. Source, tests and configuration win over any prose that disagrees. Stage 1 status: **complete, awaiting the owner's Phase 3 approval. Phase 4 must not start without that approval.**

## 1. How this project is run

- The owner briefs one phase at a time. Each phase is completed, reported, and **approved before the next starts**. Never start the next phase, and never build feature UI ahead of its phase.
- A fresh agent session starts after each **stage**. The last phase of a stage writes a handoff like this one in `documentation/native/handoffs/`. The schedule is in the [native index](../README.md#stage-handoffs).
- Keep these current as work progresses:
  - the [master plan](../master-plan.md), including its status log;
  - decision records in [`decisions/`](../decisions/);
  - phase reports in `reports/phase-<n>/report.md`, with evidence in `evidence/` and executed source snapshots in `evidence/executed-sources/`.
- Label statements in planning documents as **Confirmed** (owner decision), **Proposed** or **Open**.
- Repository rules in [`AGENTS.md`](../../../AGENTS.md) apply. In particular: preserve unrelated working-tree changes (the repository has many uncommitted owner edits), do not touch the backend, database or credentials, and update docs when behavior changes.
- **Ask before** installing substantial dependencies, deleting experimental files or caches, or changing device or system settings. The owner performs hands-on device steps (S Pen writing, multitasking) when asked.

## 2. The vision (from the [master plan](../master-plan.md))

Sylf Native is a new, premium, high-performance study ecosystem built **from scratch** inside the Sylf repository. It reuses Sylf's backend and domain logic, and the existing Next.js web app stays unchanged.

- **Three Spaces**, each with its own navigation:
  - **Home:** a personal command center. A compact vertical rail with Today, Focus, Circle and Progress, plus a persistent study session.
  - **Workspace:** an uninterrupted canvas with a macOS-Dock-inspired **Command Center**. Tools (Notes, PDFs, Whiteboard, Planner, Calendar, Timer, Sylvie, Calculator, Audio, Resources) run as floating, resizable and split panels, with Focus, Split and Assistant presets and session restoration.
  - **World:** an immersive, original fantasy sandbox game fed by server-settled progression. Its engine is isolated, loaded on entry and torn down on exit.
- **Global navigation:** one top-left Spaces icon expands a short horizontal Home / Workspace / World switcher. World's own save-and-leave flow takes priority while playing.
- **Platforms:** tablets and desktop/laptop first. A simplified phone companion comes later (Home essentials only) as a separate frontend module. Layout follows the **window size class**, not the device.
- **Design (Confirmed, owner direction 30 October 2026):** a completely fresh, premium, original native UI that significantly surpasses the web app. The web app is a reference only for functionality, branding and user preferences. See §8.
- **Open product questions** are listed in master plan §8.2:
  - W1: naming the Workspace Space vs the existing "Study Workspaces" concept;
  - G1: World during an active study session;
  - H1: Locker and Shop placement;
  - P1: phone app in the same binary;
  - C1: app identity and the Capacitor client.

## 3. Confirmed technology and architecture

From [ADR 0001](../decisions/0001-technology-stack.md) (Accepted) and [ADR 0002](../decisions/0002-native-workspace-foundation.md):

| Area | Decision |
| --- | --- |
| Tablets and phones | React Native 0.88.1 (New Architecture) via **Expo SDK 58.0.21**, Hermes V1, React 19.3.0, Continuous Native Generation with development and release builds (not Expo Go). |
| Desktop (macOS, Windows) | **Electron 45.1.0** (Chromium 156) hosting the **react-native-web build of the same app**. Desktop reuses Sylf's existing web owners (IndexedDB Notes repository, BlockNote, pdf.js, Pointer Events ink) behind `.web.ts` adapters. |
| Native capabilities | Local **Expo modules** (Kotlin and Swift) in `native/packages/`. Ink capture, PDF rasterization, SQLite storage, secure session, background timer, audio and the World host each become one when their phase arrives. |
| Rich text | BlockNote 0.56 in an Expo DOM component on native. Never write BlockNote's Yjs schema from other code (y-prosemirror deletes invalid elements; Phase 2 §5.2). |
| Handwriting | Native capture is required: about 419 vs about 47 samples/s on the Tab S9 FE. Samples are `sylf-ink/1` with `perfect-freehand` `sylf-1` geometry. |
| PDF | Native rasterizers (PDFKit, PdfRenderer) plus pdf.js on desktop. **Sylf computes page units** (CropBox, Rotate, **UserUnit**, which native engines ignore). |
| Storage | SQLite (expo-sqlite, WAL) implementing the existing `NotesRepository` type on native; IndexedDB on desktop. |
| Auth | Native session mode is a future backend addition (Phases 11–12). Web sessions are cookie-only. Nothing is connected in Stage 1. |
| Game engine | Deferred to Phase 15. Phase 9 builds an engine-agnostic `WorldHost` with a placeholder. |
| Rejected | Flutter, Compose Multiplatform, fully native, React Native for macOS/Windows, Tauri (fallback only), Capacitor for tablets, a native rich-text editor, and PencilKit as storage. Reasons are in ADR 0001. |

## 4. Work completed

| Phase | Outcome | Documents |
| --- | --- | --- |
| 1 | Vision and master plan; repository survey; risks and open questions. **Approved.** | [master plan](../master-plan.md), [Phase 1 report](../reports/phase-1/report.md) |
| 2 | Technology decision with experiments on an M1 Mac and a Galaxy Tab S9 FE: shared-code parity on V8, Chromium and Hermes; SQLite crash durability (105 kills, 0 lost acknowledgements); PDF geometry; BlockNote and Yjs bridging; panels; S Pen; desktop Chromium. **Approved.** | [ADR 0001](../decisions/0001-technology-stack.md), [Phase 2 report](../reports/phase-2/report.md) |
| 3 | The `native/` workspace foundation: Expo app, Electron host, shared packages, platform adapters, a native module, boundary enforcement and verification. Android ran on the tablet and Electron on macOS. **Awaiting approval.** | [ADR 0002](../decisions/0002-native-workspace-foundation.md), [Phase 3 report](../reports/phase-3/report.md), [`native/README.md`](../../../native/README.md) |

The disposable Phase 2 spike lives in the git-ignored `scratch/native-phase-2/` (3.7 GB, kept by owner instruction). It is reference only and is not part of the build.

## 5. Repository structure and key files

```
sylf/                                   existing Next.js web app (unchanged) — app/, lib/, prisma/, mobile/ (Capacitor), …
├── tsconfig.json / eslint.config.mjs / vitest.config.ts   ← each excludes native/ (only root edits)
├── lib/                                shared domain code, consumed in place by native via @sylf/shared
├── native/                             Sylf Native npm workspace (own package-lock.json)
│   ├── README.md                       workflow, commands, rules  ← read second
│   ├── package.json                    workspace scripts; allowScripts (electron: true; esbuild/fsevents: false)
│   ├── tsconfig.json                   extends expo/tsconfig.base; paths pin yjs/zod to native copies
│   ├── eslint.config.mjs / vitest.config.mts
│   ├── apps/sylf/                      @sylf/app — Expo app
│   │   ├── app.config.ts               identity (provisional app.sylf.client), iPad multitasking, web output
│   │   ├── index.ts                    entry: polyfills → registerRootComponent
│   │   ├── metro.config.js             uses tooling/metro/sylf-resolver.js
│   │   └── src/App.tsx                 foundation diagnostics screen (replace in Phase 5+)
│   ├── apps/desktop/                   @sylf/desktop — Electron
│   │   └── src/main.mjs, security.mjs, preload.cjs, self-test.mjs
│   ├── packages/shared/src/index.ts    the lib/ allow-list (9 entries → 11 lib files)
│   ├── packages/shared/src/parity.ts   cross-engine parity suite + expected hashes
│   ├── packages/platform/src/          capabilities.ts, adapters/types.ts, implementation(.native|.web).ts, polyfills, shims
│   ├── packages/native-platform/       Expo module: android/…/SylfNativePlatformModule.kt, ios/SylfNativePlatformModule.swift
│   ├── packages/design-system/src/     appearance preferences + temporary diagnostics palette (Phase 4 starts here)
│   ├── packages/spaces/src/            SpaceId, availableSpaces(), SpacesRestorationState
│   ├── packages/phone/                 reserved, empty phone frontend
│   └── tooling/metro|checks/           resolver, boundary lists, check-boundaries, check-single-copy, android-smoke
└── documentation/native/               master plan, decisions/, reports/, handoffs/
```

## 6. Commands

Run from `native/`. The full table is in [`native/README.md`](../../../native/README.md#commands-run-from-native).

```bash
npm install
npm run verify              # typecheck + lint + unit tests + boundary audit + single-copy + web build
npm run desktop:self-test   # builds web, launches Electron, asserts 11 security/runtime checks
npm run android:build       # expo prebuild + Gradle release (arm64); needs JAVA_HOME (JDK 17) and ANDROID_HOME
npm run android:smoke       # installs on the connected device, cold-starts, asserts SYLF_FOUNDATION
npm run web                 # Expo web dev server; then `npm run desktop:dev` for Electron against it
```

Root web checks are unchanged: `npx tsc --noEmit`, `npx eslint <files>` and `npm run test -- --run` from the repository root. On this 8 GB Mac, root `tsc` needs `NODE_OPTIONS=--max-old-space-size=4096`. Do not run it alongside Vitest or Gradle.

**Known baseline:** the root Vitest suite already has **35–36 failing tests in 26–27 files** (economy, profile, timer pooler, planner exam entry, AI, auth, plus tests collected from `scratch/`, `scripts/qa/` and documentation evidence). Phase 3 proved they are identical with and without its config change ([Phase 3 report §5](../reports/phase-3/report.md#5-web-application-regression)). Treat any *new* failure as a regression.

**This machine:** M1 MacBook Air with 8 GB RAM. There is **no Xcode by owner decision**. JDK 17 is at `~/development/jdk17/zulu17.70.113-ca-jdk17.0.21.0.3-macosx_aarch64/Contents/Home`. The Android SDK is at `~/Library/Android/sdk`. The test device is a **Galaxy Tab S9 FE (SM-X510, Android 16)** over USB ADB. GitHub release downloads are slow on this network; see the Phase 3 report for the checksum-verified cache workaround.

## 7. Shared systems and platform boundaries

- **Shared logic** is reached only through `@sylf/shared`: progression (`game-engine`), appearance color math (`color-utils`), calculator, `TimezoneService`, timer engine, Notes ink and ink geometry, and Notes graph. To add one, extend `packages/shared/src/index.ts`, pass `npm run check:boundaries`, and add a parity case when cross-engine behavior matters. Candidates confirmed portable in Phase 2 include the planner contracts, the Notes contracts, interchange and pdf modules, and the catalogs.
- **Server-only code** fails the build and the audit: Prisma, `auth-server`, `*/server/*`, `app/`, `prisma/`, `mobile/`, `next`, `pg` and similar. The backend stays authoritative, and native will call existing `/api` routes once Phase 11–12 adds a native session mode.
- **Adapters** (`@sylf/platform`):
  - `crypto` is implemented on web (WebCrypto) and native (expo-crypto).
  - `storage`, `pen`, `pdf`, `audio`, `session` and `files` are declared interfaces with capability flags only. They grow in their owning phases (12–14).
- **Capabilities:** `detectCapabilities()` reports runtime, OS, form factor, stylus, hover, refresh rates and scale. On the Tab S9 FE, stylus is detected via an `InputDevice` with `SOURCE_STYLUS`. `windowSizeClass(width)` uses compact < 600 ≤ medium < 1000 ≤ expanded.
- **Spaces state:** `SpacesRestorationState` must be persisted outside React. Phase 2 saw Android pop-up view remount the React root.
- **Phone:** only app entry files may import `@sylf/phone` (ESLint and the audit enforce this).

## 8. Phase 4 — UI Design System: prerequisites and scope

**Prerequisite:** the owner's approval of Phase 3, and the owner's Phase 4 brief, which takes precedence over this summary.

**Binding design direction (owner, 30 October 2026).** Create a completely fresh, premium and highly polished native UI for Sylf that significantly surpasses the existing web app in aesthetics, usability, fluidity and overall experience.

- The web app is a reference **only** for functionality, branding and user preferences, **not** a design template.
- Do **not** replicate its layouts, components, navigation or visual structure.
- Think independently and explore innovative design approaches.
- Prioritize minimalism, elegance, purposeful animation, intuitive interaction and exceptional tablet and desktop UX.
- Avoid generic AI-generated dashboard aesthetics.
- **Done when:** an original, cohesive native design direction exists that feels distinctly Sylf and is substantially more refined than the current web experience.

**Expected Phase 4 scope (roadmap):** visual identity, typography, color, spacing, iconography and motion. Native tablet interactions, transitions and responsive behavior across window size classes. Reusable interface components in `native/packages/design-system`, demonstrated without building the Spaces (those are Phases 5–9).

**Constraints and inputs to honor.**

1. **User preferences:** light and dark mode plus custom accent and background colors must be honored with accessible contrast. Use `normalizeAppearancePreference` and `contrastRatio`. Do not assume dark-only surfaces. Authored paper, ink and PDF colors never follow the theme.
2. **Brand references** to *reinterpret*, not copy: the Sylf name, companion and pixel-art lineage ([Pixel Display](../../pixel-display/README.md)), and the Floating Sanctuary atmosphere ([authentication](../../authentication/README.md)). The old `documentation/design/design-system/` set is background only.
3. **Runtime targets:** components must render on native (Android verified; iOS pending) **and** react-native-web inside Electron. Verify both: the Electron self-test and window capture, and the tablet via `android:smoke` plus screenshots (`adb exec-out screencap -p`).
4. **Motion and gestures:** add `react-native-reanimated`, `react-native-worklets` and `react-native-gesture-handler` when needed. In Phase 2: Reanimated 4.7.1, Worklets 0.13.0, Gesture Handler 3.3.0. Expo noted a Hermes V1 memory regression with Reanimated in SDK 56–57, so re-check on SDK 58. Add `expo-system-ui` for Android root-view theming. React Native Skia 2.x builds paths with `Skia.PathBuilder`.
5. **Performance:** keep 60/120 fps interactions. The Tab S9 FE was in 60 Hz "Standard" motion smoothness during testing; ask the owner before relying on 90 Hz. Measure with `dumpsys gfxinfo`.
6. **Accessibility:** screen readers, font scaling (the owner's tablet uses font scale 1.15), reduced motion, contrast, 44-point targets, and keyboard focus on desktop.
7. **Allowed changes:** Phase 4 may replace `apps/sylf/src/App.tsx` with a design-system showcase, but must not build Home, Workspace, World, the Command Center or the phone UI.

## 9. Outstanding risks and verification requirements

| Item | Status / requirement | Owner phase |
| --- | --- | --- |
| **iOS / iPad entirely unverified** | No Xcode or iPad. `ios:prebuild`, the Swift module, Pencil capture and latency, Stage Manager, PDFKit on iOS, WKWebView BlockNote and Hermes parity on iOS all still need to run. Requires Xcode 26.4 or later (or EAS cloud builds) plus an iPad. | Before Phase 5 tablet work (gate) |
| **Windows unverified** | No Windows hardware. The Electron host should work, but the self-test, pen input and packaging are unrun. | Phase 10 / 16 |
| Native ink integration | androidx.ink `InProgressStrokesView` rendered nothing inside React Native in Phase 2; a plain Canvas renderer worked. Needs a dedicated module design. | 14 (spike earlier if Phase 8 needs ink) |
| OS-driven React remounts | Android pop-up view recreated the React root. Persist Spaces and Workspace state outside React. | 5, 8 |
| Panel reflow | Spike panels kept absolute positions on rotation; store geometry relative to the window and clamp per size class. | 8 |
| Desktop memory | Chromium-based shell: about 400–520 MB footprint (Phase 2 proxy) and a 367–439 MB Electron working set with the diagnostics screen (Phase 3). Budget it. | 16 |
| Native auth | Cookie-only web sessions; native token mode with revocation parity needed. | 11–12 |
| App identity | Provisional `app.sylf.client` / `sylf-native`. Decide C1 (relationship to Capacitor `app.sylf.study`) before any store build. | Before 17 |
| Electron packaging | Signing, notarization, fuses and auto-update are not set up. | 17 |
| Pen-to-photon latency, 90/120 Hz, thermals, battery | Not measured. | 10, 16 |
| Performance numbers | Phase 2 and 3 figures are experimental measurements, not production guarantees. | 16 |
