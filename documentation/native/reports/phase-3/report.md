# Sylf Native — Phase 3 report: Project Foundation

**30 October 2026. Status: complete, awaiting approval. This is the last phase of Stage 1. The [Stage 1 handoff](../../handoffs/stage-1.md) is the entry point for the next session.** Decisions are in [ADR 0002](../../decisions/0002-native-workspace-foundation.md), building on [ADR 0001](../../decisions/0001-technology-stack.md). The workflow is in [`native/README.md`](../../../../native/README.md).

## Summary

| Deliverable | Result |
| --- | --- |
| Independent `native/` workspace | Created: two apps and six packages, its own lockfile (635 packages), React 19.3.0 / React Native 0.88.1 / Expo 58.0.21. The web app's install and imports are untouched. |
| Android development build on available hardware | **Passed.** Release APK built and ran on the Galaxy Tab S9 FE (§4.3). |
| Electron on macOS (the real app, not Chrome) | **Passed.** Electron 45.1.0 launches the web build. **11/11** security and runtime self-test checks pass (§4.2). |
| iOS project configuration | Configured (`app.config.ts`, Swift module, podspec). **Not built:** no Xcode by owner decision (§6). |
| Monorepo and package boundaries | `apps/sylf`, `apps/desktop`, `packages/{shared,platform,native-platform,design-system,spaces,phone}`, `tooling/`. |
| Shared-code resolution and client/server separation | Metro resolver, TypeScript `paths`, Vitest `dedupe`, a static boundary audit and a single-copy audit. All pass. The audit fails on planted violations. |
| Platform adapters | Capabilities, plus crypto (implemented); storage, pen, PDF, audio, session and files (interfaces, scheduled). |
| Scripts, lint, typecheck, tests | `npm run verify` passes: typecheck (React Native and Electron), lint, 17 unit tests, both audits and the web build. |
| Web app regression | Root changes are exclusion lines only. See §5 for results. |
| Owner design direction (received mid-phase) | Applied. The design-system package no longer derives native colors from web tokens. The direction is recorded in master plan §7.2, ADR 0001 and the handoff. |

## 1. What was built

```
native/
├── package.json, package-lock.json, tsconfig.json, eslint.config.mjs, vitest.config.mts, .gitignore, README.md
├── apps/sylf/        Expo app: app.config.ts, index.ts, metro.config.js, src/App.tsx (diagnostics only)
├── apps/desktop/     Electron: src/main.mjs, security.mjs, preload.cjs, self-test.mjs (+ security.test.mjs)
├── packages/shared/          lib/ allow-list (index.ts) + parity suite (parity.ts)
├── packages/platform/        capabilities, adapters/types, implementation(.native|.web), polyfills, lib0 shim
├── packages/native-platform/ Expo module — Kotlin + Swift getDeviceInfo()
├── packages/design-system/   appearance preferences, contrast, temporary diagnostics palette
├── packages/spaces/          SpaceId, availableSpaces, SpacesRestorationState (+ tests)
├── packages/phone/           reserved
└── tooling/metro/ (sylf-resolver.js, boundaries.js) · tooling/checks/ (check-boundaries, check-single-copy, android-smoke)
```

**The app is a diagnostics screen, not a Sylf interface.** It shows runtime, device, window class, stylus and hover, refresh rates, appearance mode and the parity results. It logs one `SYLF_FOUNDATION` JSON line that the automated checks read.

**Root repository changes (all additive exclusions).**

- `tsconfig.json`: added `"native"` to `exclude`. This also keeps `next build`'s type check off native files.
- `eslint.config.mjs`: added `"native/**"` to `globalIgnores`.
- `vitest.config.ts`: added `exclude: [...configDefaults.exclude, 'native/**']`.

Your existing uncommitted edits to these files were preserved. Nothing else outside `native/` and `documentation/native/` changed.

## 2. Versions and toolchain

| Item | Version | Note |
| --- | --- | --- |
| Expo / React Native / React | 58.0.21 / 0.88.1 / 19.3.0 | React 19.3.1 exists, but Expo 58 pins 19.3.0. |
| react-native-web / @expo/metro-runtime / expo-crypto | 0.21.4 / 58.0.15 / 58.0.7 | |
| yjs / zod | 13.6.33 / 4.4.3 | Identical to the web app's pins. |
| Electron | 45.1.0 (Chromium 156.0.8078.49, Node 24.22.1) | |
| TypeScript / ESLint / typescript-eslint / Vitest | ~6.0.3 / 9.39 / 8.72 / 4.1 | TypeScript 7 is released, but Expo's template targets 6.0. |
| Android | compileSdk 37, build-tools 37.0.0, NDK 27.1.12297006, Gradle 9.4.1, JDK 17 | React Native 0.88 defaults. Gradle auto-installed SDK 37, build-tools 37 and NDK 27.1 during Phase 2, which went unrecorded then. Phase 3 dropped Phase 2's NDK 28.2 override. |

npm 12 blocks dependency install scripts by default. `allowScripts` approves `electron` (its binary download) and explicitly denies `esbuild` and `fsevents`, whose scripts are unnecessary here.

### Electron binary on slow networks

On this network, GitHub release downloads ran at about 50 KB/s. The 115 MB Electron zip was fetched with 16 parallel range requests and verified against the SHA-256 in `node_modules/electron/checksums.json` (`002b71ef…0f3b`). It was then placed in Electron's download cache at `~/Library/Caches/electron/<sha256 of the release directory URL>/`, where Electron's own installer found and re-verified it. On a normal network, `npm install` needs none of this.

## 3. Boundaries and shared code

- **Allow-list:** 9 entries in `packages/shared/src/index.ts` resolve to 11 `lib/` files (`game-engine`, `skill-tree`, `timezone-service`, `color-utils`, `calculator/math-engine`, `timer-engine`, `notes/ink`, `notes/ink-geometry`, `notes/graph`, `notes/contracts`, `notes/errors`). Their only bare dependencies are `yjs` and `zod`, both declared by `@sylf/shared`.
- **`check-boundaries`:** passed, with 38 native source files and 0 violations. A planted file importing `@prisma/client`, `../../../../app/page` and `@sylf/phone` produced exactly those three violations.
- **`check-single-copy`:** one runtime copy each of `react`, `react-dom`, `react-native`, `yjs`, `zod`, `expo` and `expo-modules-core`. A tooling-only nested `zod` inside `@expo/cli` is reported separately; it never enters an app bundle.
- **Metro resolver unit tests:**
  - server-only packages throw `SYLF_NATIVE_BOUNDARY`;
  - bare imports from `lib/` are anchored to the app;
  - resolution into the web app's `node_modules` fails;
  - `lib/auth-server` and `app/` paths fail;
  - `lib0/webcrypto` is shimmed on Android/iOS only.
- **Parity correction:** Phase 2's progression case called `getLevelProgress(98765)` without its required level argument, which hashed a meaningless `NaN`-based result. Phase 3 calls `getLevelProgress(98765, calculateLevelFromXp(98765))`. The new reference hash `c8ce4fb5` came from V8 and was then independently matched by Electron's Chromium and the tablet's Hermes (§4). The other six cases are unchanged from Phase 2.

## 4. Verification results

### 4.1 Workspace checks (`native/`)

| Check | Result |
| --- | --- |
| `npm run typecheck` (React Native/web program + Electron `checkJs`) | Pass |
| `npm run lint` | Pass (0 problems) |
| `npm run test` | Pass: 6 files, 17 tests (parity, capabilities, Spaces state, appearance preferences, Electron policy, Metro resolver) |
| `npm run check:boundaries` / `check:single-copy` | Pass / Pass |
| `npm run build:web` | Pass: 322 modules, 1.0 MB, one external script and no inline scripts (CSP-compatible) |

### 4.2 Electron on macOS (M1, macOS 27.2)

`npm run desktop:self-test` launched the real Electron 45.1.0 app with the production web build over `sylf://app`.

| Check | Result |
| --- | --- |
| Declared web preferences hardened (context isolation, sandbox, no Node integration, no webview tag) | ✓ |
| Renderer process sandboxed (from `app.getAppMetrics()`, type `Tab`) | ✓ |
| Context isolation observed (preload-world marker invisible to the page) | ✓ |
| No Node in the page (`require`, `module`, `Buffer` undefined; `process` is only the bundler's `{ env }` shim, with no `versions.node` or `binding`) | ✓ |
| Preload bridge exposes only `platform` and `versions`, frozen | ✓ |
| CSP blocks `eval` | ✓ |
| `window.open` blocked | ✓ |
| External navigation blocked (URL stays `sylf://app`) | ✓ |
| App origin is `sylf://app` | ✓ |
| Foundation started (`SYLF_FOUNDATION` received) | ✓ |
| Shared-code parity on Chromium 156 (7/7) | ✓ |

**Measured:** launch to foundation report 1.0–1.1 s, app-ready about 42 ms after bundle start, 4 processes, working set 367–439 MB across runs ([`evidence/electron-self-test.json`](evidence/electron-self-test.json)). These are experimental single-machine figures, not guarantees. The window capture is in [`evidence/electron-foundation.png`](evidence/electron-foundation.png). The page followed the system's dark appearance.

The first self-test run failed `noNodeGlobalsInRenderer` because `typeof process === "object"`. Investigation showed the bundler's `process.env` shim, not Node, so the check now distinguishes the two instead of being relaxed. Electron 45 has no getter for live web preferences (`getLastWebPreferences` is gone), so sandboxing and isolation are verified behaviorally.

### 4.3 Android on Galaxy Tab S9 FE

The release APK was built with `npm run android:build` (`expo prebuild` plus Gradle `assembleRelease`, arm64-v8a). The first build hit `app.sylf.native` being an invalid Android namespace; the rebuild after the identifier change took 2 min 32 s with warm caches. The APK is 21.7 MB, versus 50.5 MB for the Phase 2 spike with Skia and BlockNote. `npm run android:smoke` then installed and cold-started it on the SM-X510 (Android 16, One UI 8.5).

| Check | Result |
| --- | --- |
| `SYLF_FOUNDATION` reported, runtime `native`, form factor `tablet` | ✓ |
| Shared-code parity on Hermes (7/7), including the corrected `c8ce4fb5` | ✓ |
| Crypto adapter (expo-crypto SHA-256 equals the desktop WebCrypto value) | ✓ |
| `@sylf/native-platform` (Kotlin): stylus detected through `InputDevice.SOURCE_STYLUS`, refresh modes 30/60 Hz, model `samsung SM-X510` | ✓ |
| Window 1317×823 dp at 1.75× → `expanded`; Spaces available: Home, Workspace, World | ✓ |

**Measured:** cold start (`am start -W`, release build) of 245–282 ms (median 280 ms) in the first session and 226–247 ms (median 244 ms) in the recorded run ([`evidence/android-smoke.json`](evidence/android-smoke.json)). App-ready came about 56 ms after bundle start, at 98 MB PSS. The screen capture is in [`evidence/android-foundation.png`](evidence/android-foundation.png). The system's dark appearance was followed even without `expo-system-ui`. **Observed issue:** the diagnostics screen does not handle safe areas, so its title sits under the status bar. Safe-area handling (`react-native-safe-area-context`) belongs in Phase 4/5 layout primitives.

### 4.4 iOS configuration (generated, not built)

`npm run ios:prebuild` generated `apps/sylf/ios` (git-ignored) without Xcode:

- bundle identifier `app.sylf.client`;
- `TARGETED_DEVICE_FAMILY = 1,2` (iPhone and iPad);
- `IPHONEOS_DEPLOYMENT_TARGET = 16.4`;
- `UIRequiresFullScreen = false` (iPad multitasking allowed), with all four orientations on iPad.

Expo autolinking resolves `@sylf/native-platform` for both Apple and Android. CocoaPods install, Swift compilation, signing and any on-device run remain unverified.

### 4.5 Live boundary enforcement

A temporary file importing `lib/auth-server` was wired into the app and bundled with Metro for Android. The build failed with `SYLF_NATIVE_BOUNDARY "lib/auth-server.ts" is outside the approved shared lib/ boundary`. The probe was removed, and `App.tsx` was restored byte-for-byte (verified with `cmp`).

## 5. Web application regression

The root changes are three exclusion lines. They can only remove `native/` files from root tools.

| Check (from the repository root) | Result |
| --- | --- |
| `npx tsc --noEmit` | **Pass, 0 errors** (35 s). It needed `NODE_OPTIONS=--max-old-space-size=4096`: the first attempt hit Node's default ~2 GB heap limit while Vitest ran concurrently on this 8 GB Mac. |
| `npx eslint eslint.config.mjs vitest.config.ts` (changed files) | Pass. Root ESLint reports `native/` files as ignored. |
| `npx vitest run` (full suite) | 424 files and 4,788 tests: **36 failed in 27 files, 4,451 passed, 301 skipped.** Root Vitest collects 0 `native/` tests. |
| Same 27 files with the original `vitest.config.ts` from HEAD vs the Phase 3 config | **Identical: 26 failed files / 35 failed tests in both.** One test is flaky (it failed in the full run and passed here). The failures pre-date Phase 3 and are unrelated to `native/`. They include domain suites (economy, profile, timer pooler, planner exam entry, AI and auth routes) and test files the root config collects from `scratch/`, `scripts/qa/` and documentation evidence. They belong to the owner's in-progress working tree and were not investigated further, since that is out of scope. |

The Capacitor client (`mobile/`, `android/`) was not modified. Its build was not re-run because no file it uses changed.

A note for reproducibility: in this environment, a backgrounded shell first ran the "root" checks inside `native/`, which the Vitest `RUN` header revealed. Those results were discarded and the checks re-run with an explicit working directory.

## 6. Limitations and unresolved validation requirements

- **iOS: not built or run.** `ios:prebuild` generation, the Swift `SylfNativePlatformModule`, the podspec, Hermes parity on iOS, Pencil capture, iPad multitasking and WKWebView behavior are all unverified. This needs Xcode 26.4 or later (or EAS Build) and an iPad. It is a **gate before Phase 5 tablet work**.
- **Windows: not run.** The Electron host is written to be cross-platform (`sylf://` protocol, single-instance lock, `window-all-closed`), but the self-test, packaging and pen input on Windows are unverified.
- **Electron packaging** (signing, notarization, fuses, auto-update, ASAR integrity) is deferred to Phase 17. The host currently runs unpacked.
- **Adapters:** only crypto is implemented. Storage, pen, PDF, audio, session and files are interfaces with capability flags.
- **iOS stylus detection** returns `"unknown"`, because Apple Pencil pairing is not observable. Capability will be confirmed from the first Pencil touch.
- **Android dark appearance:** Expo warns that `userInterfaceStyle: "automatic"` needs `expo-system-ui` on Android for root-view theming. This is deferred to Phase 4 theming.
- **The provisional identity** `app.sylf.client` replaced `app.sylf.native` (`native` is a Java keyword). It must be decided (C1) before any store build.
- Performance figures here and in Phase 2 are experimental, not production guarantees.

## 7. Handoff

See the [Stage 1 handoff](../../handoffs/stage-1.md). **Phase 3 stops here. Phase 4 needs the owner's approval.**
