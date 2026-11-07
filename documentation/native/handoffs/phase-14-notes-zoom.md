# Handoff: note pinch zoom on the tablet (fixed, 7 November 2026)

**Resolved.** What was wrong and what changed is in the [Phase 14 report, §6](../reports/phase-14/report.md#6-bugs-found-and-fixed); the checks are in §3. In short: each pinch step is placed with the layout the zoom will have (`pinchTarget` and `stackPages` in `notes/page-pinch.ts`, page gaps scaling with the zoom), the on-screen scale goes in the same commit as the new layout, the scroll views draw past their bounds while pinched, a native `SylfPinchArea` hears two fingers anywhere over the document, and `InkView.native.tsx` resends a page's strokes until its surface takes them. `npm run android:pinch-check` now covers note pinches in any orientation (`--only=note-page`, `--shots=<dir>` keeps the screenshots). Still open: a note's toolbar is too wide for a portrait tablet (§7). The rest of this page is the brief as it was written, kept for the measuring method.

Phase 14 is otherwise finished ([report](../reports/phase-14/report.md), [Phase 15 handoff](phase-14.md)). This page is the one open defect, reported by the owner on the Galaxy Tab S9 FE after `3819650`. **Sylf World is not to be started.**

## What the owner sees

Pinch-zooming a **note** (not a whiteboard, which is smooth) on the tablet:

1. **It "teleports"**: after a pinch the view sometimes jumps to a different part of the page.
2. **Zooming out shows only what was on screen.** While the fingers close, only the part of the page that was visible is drawn; the rest of the page (and the pages around it) is missing, as if cut off, until the fingers lift.

## How zoom works now

- `native/apps/sylf/src/spaces/workspace/notes/page-pinch.ts` (`usePagePinch`), used by `NoteEditor.tsx` and `PagedInk.tsx` (PDFs). While the fingers move it only applies a Reanimated transform (`translate` + `scale`, `transformOrigin: "0 0"`) to the `Animated.View` that wraps the two `ScrollView`s. On `end` it calls `setZoom(next)` and, in a `useLayoutEffect` on `zoom`, `scrollTo` a target offset and resets the transform.
- Native: `packages/native-platform/android/.../SylfInkView.kt`, `pagePinch` and `emitPagePinch` send `onPinch` with `phase` (`start`, `move`, `end`), `scale` since the fingers landed, and the point between the fingers in **screen** points (`getRawX/Y` per pointer; this fixed the earlier feedback shake). `InkView.native.tsx` routes `phase` events to `onPagePinch`.
- Rendering is **windowed**: in `NoteEditor.tsx` only rows "near" the scroll position render (`near = row.top + row.height > scroll.y - size.height && row.top < scroll.y + size.height * 2`), and each page's `InkView` (and the paper-only `InkView` under the text) covers only the visible rectangle plus `MARGIN` (`x0..x1`, `y0..y1`, snapped to `SNAP`). `PagedInk.tsx` does the same.

## Likely causes

- **Cut-off while zooming out:** the transform scales what is rendered, and only the visible window is rendered. At scale < 1 the area outside it shows nothing. Fix direction: when a pinch starts, widen what is rendered once (a `pinching` state that enlarges the row range and the ink window by about `1 / MIN_ZOOM` of the viewport), or draw each page's paper as a plain full-size background so the page shape is always there; keep the ink window fixed during the gesture (no re-render per move).
- **Teleport:** the commit's scroll target `(offset + start) * ratio - point` ignores the layout's constants: the `GAP` between pages, the horizontal centring `left = (contentWidth - row.width) / 2` (pages are centred when narrower than the view), and `contentWidth = max(size.width, widest * scale + GAP * 2)`. It also scrolls in `useLayoutEffect` before the `ScrollView` content may have its new size, so `scrollTo` can be clamped and then jump. `offsetRef` can also be stale if a scroll event lands during the gesture. Fix direction: compute the target from the real layout (find the row under the start point, convert to page coordinates, then to the new layout's `row.top`, `left` and `scale`), clamp to the new content size, and apply it after the new layout is measured (`onContentSizeChange`, or the next frame after layout).

## How to reproduce and measure

- Tablet over USB: `~/Library/Android/sdk/platform-tools/adb`. Build: `export ANDROID_HOME=~/Library/Android/sdk`, then in `native/apps/sylf/android`: `EXPO_PUBLIC_SYLF_DEV_TOOLS=1 ./gradlew :app:createBundleReleaseJsAndAssets --rerun assembleRelease -PreactNativeArchitectures=arm64-v8a` (the `--rerun` is needed: Gradle does not see changes in `native/packages/*`), then `adb install -r app/build/outputs/apk/release/app-release.apk` (use a `timeout`; check `dumpsys window | grep mCurrentFocus` for Play Protect dialogs, which are the owner's to answer).
- Real two-finger gestures: `native/tooling/checks/android-pinch-check.mjs` registers a virtual touchscreen with Android's `uinput` (see its `pinchScript`). It assumes portrait; in landscape map a screen point `(x, y)` to `(1439 - y, x)` for `ROTATION_90`.
- Record what happens: `adb shell screenrecord --time-limit 10 /sdcard/p.mp4` (wait for it to exit before pulling), `adb shell "timeout 60 getevent -lt"` for the raw finger events, `dumpsys gfxinfo app.sylf.client` (reset first) for frames, and `ffmpeg -ss … -vf "fps=6,scale=230:-1,tile=6x5"` for a contact sheet. The owner's own recording is how the first defect was found; ask them to pinch while recording.
- Desktop: `npm run build:web` then `SYLF_WORKSPACE_CHECK_ONLY=notes npm --workspace @sylf/desktop run workspace-check` (40 of 40 at `3819650`). Tablet: `npm run android:notes-check` (12 of 12).

## Rules

Work in `~/Desktop/sylf-phase-14` on branch `phase-14` (never `git add` in `~/Desktop/sylf`, another agent's checkout). Commit specific paths; push to `phase-14`; do not merge or deploy. Never dismiss Android security prompts or change device settings. Verify on the tablet before calling it fixed, and add a regression check (for example a pinch-out in `android-pinch-check.mjs` asserting the whole page is drawn and the page point under the fingers stays put).
