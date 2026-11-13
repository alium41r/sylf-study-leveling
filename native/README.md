# Sylf Native workspace

Sylf Native is the tablet-first native app (iPad, Android tablets), its Electron desktop host (macOS, Windows) and a future phone companion. It is an **independent npm workspace**: its own `package.json`, `package-lock.json` and `node_modules`. The root Next.js app is untouched, and root `tsc`, ESLint and Vitest exclude this folder.

- Architecture and decisions: [ADR 0001](../documentation/native/decisions/0001-technology-stack.md) and [ADR 0002](../documentation/native/decisions/0002-native-workspace-foundation.md).
- Product context: [master plan](../documentation/native/master-plan.md).
- Current state and next steps: [Expansion stage plan](../documentation/native/expansion/README.md), [Stage 3 handoff](../documentation/native/handoffs/stage-3.md), [Stage 2 handoff](../documentation/native/handoffs/stage-2.md) (and the [Stage 1 handoff](../documentation/native/handoffs/stage-1.md) for the stack and this machine).
- Design: [design system guide](../documentation/native/design/README.md), [component reference](../documentation/native/design/components.md) and [ADR 0003](../documentation/native/decisions/0003-design-system-and-theme-engine.md).
- Navigation: [Spaces shell guide](../documentation/native/spaces/README.md) and [ADR 0004](../documentation/native/decisions/0004-global-spaces-shell.md).
- Home: [Home guide](../documentation/native/home/README.md) and [ADR 0005](../documentation/native/decisions/0005-home-interface-template.md).
- Workspace: [Workspace guide](../documentation/native/workspace/README.md) and [ADR 0006](../documentation/native/decisions/0006-workspace-canvas-and-windows.md).
- World: [World guide](../documentation/native/world/README.md) and [ADR 0007](../documentation/native/decisions/0007-world-lobby-and-host.md).
- The study session and the timer dock: [Spaces guide §10](../documentation/native/spaces/README.md#10-the-study-session-and-the-timer-dock) and [ADR 0008](../documentation/native/decisions/0008-study-session-and-timer-dock.md).

**Current Native worktree.** Home, Workspace and World open after sign-in. Set `SYLF_BACKEND_ORIGIN` when launching Electron and `EXPO_PUBLIC_SYLF_API_ORIGIN` when building for a device. Unconfigured builds open the connection screen. Notes, PDFs and boards use the signed-in account's library on this device. See the [frontend refinement report](../documentation/native/reports/2026-11-10-frontend-refinement/README.md).

## Layout

```
native/
├── apps/
│   ├── sylf/               @sylf/app      Expo app (Android/iOS via CNG; web build for desktop): src/shell, src/spaces, src/showcase
│   └── desktop/            @sylf/desktop  Electron host (sandboxed renderer, sylf://app protocol, self-test)
├── packages/
│   ├── shared/             @sylf/shared          the ONLY door into ../lib (allow-list + parity suite)
│   ├── platform/           @sylf/platform        capabilities, adapter interfaces, .web/.native implementations, polyfills
│   ├── native-platform/    @sylf/native-platform Expo module (Kotlin/Swift): device capabilities
│   ├── design-system/      @sylf/design-system   Aloft: theme engine, six themes, Theme Studio, components, icons, fonts
│   ├── spaces/             @sylf/spaces          Space ids, restoration state, store, the study session, World flow and host contract, Home navigation, the Workspace model (no UI)
│   ├── backend/            @sylf/backend         The way to the existing backend: typed client, auth, cached reads, connectivity, the timer journal's lifetime (no UI). Behind import()
│   └── phone/              @sylf/phone           reserved phone companion frontend (empty by design)
└── tooling/
    ├── metro/              resolver rules + boundary lists shared by Metro and the checks
    ├── checks/             boundary audit, single-copy check, Android smoke test
    └── world-art/          the voxel renderer behind World's plates, run by hand
```

## Prerequisites

- Node 22.13+ or 24.3+ (the Sylf root pins 24.x).
- **Android:** JDK 17 (`JAVA_HOME`) and the Android SDK (`ANDROID_HOME`). Gradle auto-installs compileSdk 37, build-tools 37.0.0 and NDK 27.1 on first build, with licenses accepted. A device needs USB debugging.
- **iOS:** Xcode 26.4 or later on macOS plus CocoaPods, or EAS cloud builds. It was not available in Phase 3, so iOS is unverified.
- **Desktop:** nothing extra. `npm install` fetches Electron through its approved install script (`allowScripts` in `package.json`). On slow GitHub CDN connections, see the Electron cache note in the [Phase 3 report](../documentation/native/reports/phase-3/report.md#electron-binary-on-slow-networks).

## Commands (run from `native/`)

| Purpose | Command |
| --- | --- |
| Install | `npm install` |
| Full verification (typecheck, lint, tests, boundaries, single copy, web build) | `npm run verify` |
| Typecheck / lint / unit tests | `npm run typecheck` / `npm run lint` / `npm run test` |
| Boundary audit / single-copy check | `npm run check:boundaries` / `npm run check:single-copy` |
| Expo dev server (Android dev client, web) | `npm run start` / `npm run web` |
| Web build (desktop payload) | `npm run build:web` → `apps/sylf/dist/` |
| Desktop app | `SYLF_BACKEND_ORIGIN="$sylf_server" npm run desktop:start` (builds web, launches Electron) |
| Expo web and Electron development server | `npm run web`, then `npm run desktop:dev` for the development Showcase. Use the packaged renderer for signed-in Electron checks. |
| Desktop security self-test | `npm run desktop:self-test` (exit 0 = all checks pass) |
| Android release build (arm64 by default) | `npm run android:build`. Set `SYLF_ANDROID_ABIS=armeabi-v7a,arm64-v8a,x86,x86_64` for all ABIs |
| Android install + smoke test on a device | `npm run android:smoke` |
| iOS native project (requires Xcode to build) | `npm run ios:prebuild` |
| Desktop design check (every theme, keyboard, pointer, window sizes, frame pacing) | `SYLF_DESIGN_CHECK_OUT=<dir> npm run desktop:design-check` |
| Desktop Spaces check (switcher, World flow, restoration, window sizes, every theme) | `SYLF_SPACES_CHECK_OUT=<dir> npm run desktop:spaces-check` |
| Desktop review captures (Showcase chapters at every scroll position, for a person to inspect) | `SYLF_REVIEW_OUT=<dir> npm --workspace @sylf/desktop run review-capture` |
| Signed-in desktop frontend check | `npm run desktop:frontend-check`. Uses a disposable profile and a loopback fixture with real repository audio files. |
| Desktop Home check (legacy layout suite) | `SYLF_HOME_CHECK_OUT=<dir> npm run desktop:home-check` |
| Desktop Workspace check (canvas, windows, presets, restoration, suspension, keys, frames, retention). `SYLF_WORKSPACE_CHECK_ONLY=<groups>` runs part of it | `SYLF_WORKSPACE_CHECK_OUT=<dir> npm run desktop:workspace-check` |
| Desktop World check (lobby, sections, skies, the host's lifecycle and failures, isolation, reduced motion, contrast against the sky, sizes, themes, frames, retention). `SYLF_WORLD_CHECK_ONLY=<groups>` runs part of it | `SYLF_WORLD_CHECK_OUT=<dir> npm run desktop:world-check` |
| Desktop session check (one session across the dock, Focus and Timer, restarts, countdowns, World's safeguards, keys, the dock at ten window shapes, themes, rendering, frames, retention). `SYLF_SESSION_CHECK_ONLY=<groups>` runs part of it | `SYLF_SESSION_CHECK_OUT=<dir> npm run desktop:session-check` |
| Bake World's art, after changing `tooling/world-art/scenes.mjs` | `node tooling/world-art/render.mjs` |
| Android Spaces check (real touch, Back, process kill, every theme) | `npm run android:spaces-check -- --out=<dir>` |
| Android Workspace check (touch, drags, presets, process kill, frames) | `npm run android:workspace-check -- --out=<dir>` |
| Android bare memory probe for risk R15 (needs a build with `EXPO_PUBLIC_SYLF_R15=1`) | `npm run android:r15-check -- --scenario=views --out=<file>` |
| Android scroll comparison, full screen, against the Showcase | `npm run android:scroll-check -- --out=<file>` |
| Android memory check (repeats a sweep to tell a cache from a leak) | `npm run android:memory-check -- --cycles=4 --sweep=full --out=<file>` |
| Android design check (every theme, accessibility tree, frames) / real-input interaction check | `npm run android:design-check -- --out=<dir>` / `npm run android:interaction-check -- --out=<file>` |

`apps/sylf/android` and `apps/sylf/ios` are generated by `expo prebuild` and git-ignored. Change native configuration through `apps/sylf/app.config.ts` or config plugins, never by editing generated projects.

## Rules

1. **Shared code.** Import Sylf `lib/` modules only through `@sylf/shared`. Adding a module means adding it to `packages/shared/src/index.ts`, then passing `npm run check:boundaries`, and adding a parity case when its behavior matters across engines.
2. **Client/server separation.** Server-only packages and paths (Prisma, `auth-server`, `*/server/*`, `app/`, `prisma/`) fail the Metro build (`tooling/metro/sylf-resolver.js`) and the static audit.
3. **Single copies.** `yjs`, `zod`, `react`, `react-native` and `expo` resolve from `native/node_modules` only. Metro, TypeScript `paths` and Vitest `dedupe` all enforce this.
4. **Platform code.** Use `*.native.ts` / `*.web.ts` files reached through *relative* imports. Metro does not apply platform extensions to package `exports` targets. Features check `detectCapabilities()`, never platform names. Layout follows `windowSizeClass(width)`.
5. **Phone companion.** Only app entry files may import `@sylf/phone`, enforced by ESLint and the boundary audit.
6. **Electron.** Keep the renderer sandboxed and context-isolated, with no Node and no remote content. Any new preload API or permission requires updating `apps/desktop/src/self-test.mjs`.
7. **Design.** Sylf Native has an original visual language, **Aloft** (master plan §7.2, [design guide](../documentation/native/design/README.md)). The web app is a reference for functionality, branding and user preferences only. Build from `@sylf/design-system`: no hardcoded colors, fonts, radii or durations, and no branching on a theme id. Give non-button controls `accessible`. Themes never touch authored documents (`DocumentSurface`).
8. **Spaces.** One Space is mounted at a time. Keep restorable state in `@sylf/spaces` snapshots, never only in a component. Set `tabIndex` on web only: on Android a `tabIndex` of -1 hides a control from TalkBack.
9. **The study session.** There is one, in `@sylf/spaces`. No screen keeps time or a copy of it, and no screen reads `snapshot`. Use `shell/session/SessionParts.tsx`, and pass `live={false}` when hidden. Local time is never called a record ([ADR 0008](../documentation/native/decisions/0008-study-session-and-timer-dock.md)).
10. **Backend.** Everything goes through `@sylf/backend`, and no screen calls `fetch`. It stays behind `import()` in `apps/sylf/src/shell/backend.ts`, which the audit enforces, so an unconfigured build shows the connection screen without loading the backend package. See the [backend guide](../documentation/native/backend/README.md). No token reaches Electron's renderer. Rewards and time accounting stay on the server.
11. **World.** Nothing outside `spaces/world/` may statically import it, and nothing may statically import its host. The audit enforces both. Art is authored, and any text over it is measured against rendered pixels ([World guide](../documentation/native/world/README.md)).
12. **Development tools.** The Showcase and app links need `DEV_TOOLS`. `build:web` and `build:android` set `EXPO_PUBLIC_SYLF_DEV_TOOLS=1`, and a store build must not.
