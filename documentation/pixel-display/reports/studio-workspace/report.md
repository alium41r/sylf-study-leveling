# Pixel Studio workspace polish

8 October 2026. Scope: the existing Locker Pixel Studio, its editor canvas and
the route-specific container. Artwork services, persistence, quotas, history
model, renderer and saved display contracts retain their existing owners.

## Result

The Studio occupies the available viewport beneath the shared app navigation.
The Locker tab switcher is omitted while editing; Back returns to the hub.
Colors sit in a compact shelf. The tool dock and Undo/Redo stay beside the canvas
on desktop and above it on compact or short viewports. Fit measures available
width **and height**, accounting for padding. Zoom is contained within the canvas,
and the new Pan tool moves its scroll position without painting or opening history.

The animation strip remains below the canvas, with collapsible frames, explicit
playback, onion guides, duration, duplication, reorder and deletion controls.
Short screens start with the frames collapsed. Desktop preview/settings can be
collapsed; on smaller screens they open in a drawer with independent scrolling,
trapped focus, Escape to dismiss and inert background controls. Save actions and
document actions have compact layouts and accessible labels. Button feedback uses
shared motion timing and respects reduced motion.

Pointer strokes now focus the canvas, making keyboard Undo/Redo usable directly
after drawing. Tool shortcuts and Space playback respect text-entry focus and
dialogs. Display styling and previews continue to use the shared presenter;
selection of paint colors continues to leave artwork and history untouched.

## Verification

- Pixel/display/dashboard suites: **490 passed, 8 skipped** (opt-in PostgreSQL
  integration). Final focused Studio/surface run: **14 passed**.
- Seven new workspace regressions cover fit/padding/resizing, pan without paint
  or history, blocked drawing during playback/saving, stroke focus and keyboard
  undo/redo, tool shortcuts vs text entry, compact settings, and frame-strip
  expansion on short screens.
- `npx tsc --noEmit`: passed after removing qualification-build generated paths.
- ESLint: Studio, canvas, LockerScreen and new tests passed. IdentityTab retains
  its pre-existing two `no-explicit-any` errors, one `set-state-in-effect` error
  and two effect dependency warnings; its changes in this task only propagate
  the Studio container height.
- Mobile production build passed in a temporary output directory. The repository
  verifier ran against that output using a temporary copy with only `DIST_DIR`
  changed: no server symbols/secrets, mock mode disabled. See
  [verification output](evidence/mobile-verification.txt). Native Android/iOS
  execution was not part of this run.
- Web webpack production compilation passed in 87 seconds. Next route type
  validation then failed on the existing `CURATED_SOUNDSCAPES` export in
  `app/api/acoustics/route.ts`. See [build output](evidence/web-build.txt).
  The isolated build output was moved to `/private/tmp`; its generated tsconfig
  entries were removed. The development server remains available.

## Browser inspection

Inspected 1440×900, 1440×1000, 1280×720, 390×844, 320×568 and 844×390.
The document stayed within the viewport in each size; all drawing-tool buttons
were visible. At 390×844 the final dock buttons are 44px high and the fitted
canvas is 313px square. The smallest and landscape layouts use the collapsed
animation strip to preserve canvas space. Expanded frame thumbnails scroll
horizontally; the settings panel scrolls independently.

Inspected ordinary dark/light themes and custom backgrounds with the opposite
mode polarity (dark mode with a pale surface/yellow accent, light mode with a
navy surface/lime accent). Actual artwork keeps its contractually black backdrop.
Tested drawer focus wrapping/restoration and Escape, 12× pan (80px horizontally,
50px vertically without enabling Undo), B shortcut, Once completion and Replay.
Saving and destructive document replacement were covered by isolated tests,
without writing to the signed-in library. Automatic approval review rejected a
draft-replacement confirmation; the original recovery was backed up and restored.
Final populated screenshots used a separate browser context and a recoverable
copy of the existing saved document. Appearance preferences were restored.

Evidence: [desktop dark](evidence/desktop-dark.png),
[mobile dark](evidence/mobile-dark.png), [settings drawer](evidence/mobile-settings.png),
[desktop light](evidence/desktop-light.png),
[custom pale surface](evidence/mobile-custom-light-surface.png),
[custom dark surface](evidence/desktop-custom-dark-surface.png),
[landscape](evidence/mobile-landscape.png).
