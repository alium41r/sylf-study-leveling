# ADR 0004 — Global Spaces shell

**Status: Accepted with Phase 5 (30 October 2026), subject to the owner's Phase 5 review.** This builds on [ADR 0002](0002-native-workspace-foundation.md) and [ADR 0003](0003-design-system-and-theme-engine.md). The current contract is the [Spaces shell guide](../spaces/README.md), and the evidence is in the [Phase 5 report](../reports/phase-5/report.md).

Labels follow the master plan: **Confirmed** came from the owner's briefs, **Proposed** is a Phase 5 decision the owner can still change.

## Decisions

| # | Decision | Status | Why |
| --- | --- | --- | --- |
| 1 | One Spaces icon at the top left expands a short horizontal bar with Home, Workspace and World. It closes on selection, outside interaction, Escape and Back. | Confirmed | Owner brief and master plan §3.1. |
| 2 | The icon's own plate grows into the bar. It is not a popover, and nothing is clipped. | Proposed | The bar reads as the icon opening. Without clipping, shadows, corner ornaments and focus rings survive in every theme. |
| 3 | At rest the current Space is shown by the Marker's cell in the Spaces icon, and open by the Marker under the current tab. | Proposed | The brief asks for a subtle, recognizable indicator. This adds no chrome and repeats the system's signature. |
| 4 | `@sylf/spaces` holds the store, World flow and switcher logic, with no React. The shell UI lives in `apps/sylf/src/shell/`. | Proposed | The package already owned the contracts, and pure logic can be tested without a renderer. |
| 5 | The active Space is written as soon as it changes. Snapshots wait 240 ms and are flushed on backgrounding. | Proposed | A kill right after a switch must not lose it. Snapshots can change quickly. |
| 6 | World's phase is held in the store but not persisted. A restart returns to World's entry. | Confirmed (master plan §3.2) | There is no mid-game state to restore, and a Space must not claim otherwise. |
| 7 | The store refuses every Space change while World holds navigation, and Back and Escape are captured in the same phases. | Confirmed | The brief gives the game's exit flow priority. Enforcing it in the store also covers deep links and later callers. |
| 8 | Save and leave returns to the Space the person came from. | Proposed (master plan §2.3) | Matches the planned flow. The switcher is available again as soon as they arrive. |
| 9 | Only the active Space is mounted, and each is a separate `import()`. | Confirmed direction (master plan §5.2) | The brief asks to unload what is unnecessary. |
| 10 | The Showcase replaces the Spaces rather than covering them, and it is behind `DEV_TOOLS`, off by default. | Confirmed entry, Proposed mechanism | A review tool must not sit in memory beside the app or reach a store build by accident. |
| 11 | Direct shortcuts and global gestures are not built. | Proposed | Master plan §3.1 ties them to validation in Phase 10. |
| 12 | Theme naming stays `student` / "Student". "Scholar" is recorded as a naming difference, not a change. | Confirmed (owner brief) | See below. |

## Student and Scholar

The approved sixth theme is implemented with the id `student` and the display name **Student**, as the Phase 4 brief, [ADR 0003](0003-design-system-and-theme-engine.md) and `presets.ts` all say. The owner has also referred to this theme as **Scholar**. Sylf's web code separately uses "scholar" for a signed-in person, for example in the pixel companion adapter and the `lib/scholar-id.ts` module, so the word already has another meaning in the product.

Nothing changed. If the owner prefers Scholar, the display name is one data value in `presets.ts`. The stored id `student` should stay either way, because preferences and saved themes reference it. **Open (owner):** which name users should see.

## Alternatives considered

| Option | Why not |
| --- | --- |
| A popover or menu anchored to the icon | Detached from its origin, and it duplicates a surface the icon already has. |
| A clipped, width-animated container | Clips shadows, ornaments and focus rings, which is where the themes differ most. |
| Keeping Spaces mounted and hidden | Conflicts with the brief, and World's engine must never run underneath the others. |
| A navigation library | The bar, its transitions and one active Space need no router. Each Space keeps its own navigation. |
| Persisting World's phase | Would suggest a mid-game restore that does not exist. |
| Keeping the Showcase in the release path behind a hidden gesture | A review tool should not ship to users. |

## Consequences

- Phases 6 to 9 replace placeholders inside `apps/sylf/src/spaces/` and inherit transitions, unloading and persistence.
- Phase 9's `WorldHost` must report the same phases, and Phase 17's store pipeline must leave `EXPO_PUBLIC_SYLF_DEV_TOOLS` unset.
- The app no longer opens into the Showcase, so verification tools reach it through app links.
