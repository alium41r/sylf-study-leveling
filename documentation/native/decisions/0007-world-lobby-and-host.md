# ADR 0007 — World lobby and host

**Status: Accepted with Phase 9 (31 October 2026), and approved by the owner in the Phase 10 brief. Decision 8 is replaced by [ADR 0008](0008-study-session-and-timer-dock.md), decision 30.** This builds on [ADR 0001](0001-technology-stack.md) and [ADR 0004](0004-global-spaces-shell.md). The current contract is the [World guide](../world/README.md), and the evidence is in the [Phase 9 report](../reports/phase-9/report.md).

**Confirmed** came from the owner's brief or master plan. **Proposed** is a decision from this phase that the owner can still change.

## Decisions

| # | Decision | Status | Why |
| --- | --- | --- | --- |
| 1 | The lobby shows an entrance and the air around it: a gate on a stone dais, a sea of cloud, sky, lanterns and petals. No island, terrain, plant, character or map. | Confirmed (brief) for the limit, Proposed for the gate | The brief reserves the world for Phase 15. A gate is the one thing a pre-game lobby can show that is not the world. The cloud sea hides the dais's lower edge, so it cannot read as an island. |
| 2 | The gate is the visual direction's vermilion posts and dark feet, with its teal tile roof added, and the sprout from Sylf's mark on the name plate. | Proposed | It keeps the direction's shape language while making an object of Sylf's own. |
| 3 | The art is rendered by a small voxel ray tracer in `tooling/world-art`, with no dependency, and committed as PNG plates. | Proposed | Light can be baked per sky, which is what gives the soft look of the visual direction. It is reproducible, and a person can change a color and run it again. The direction's own images are concept art, and they are not used as assets. |
| 4 | Plates are images, stretched. No full-window SVG, and no gradient on a view. | Confirmed by Phase 5 | A full-window SVG costs about 50 MB on Android. |
| 5 | All six sky states from the visual direction are offered. Weather is limited to petals and Mist. | Proposed | Skies are cheap, because only one is decoded. Rain would need a particle layer, and the game owns weather. |
| 6 | World's art is authored, like a document, and does not follow a theme. | Proposed | The visual direction is the primary reference for World's identity. A pink sky that became Studio gray would be neither. It is the same reasoning as `DocumentSurface`. |
| 7 | The interface is the person's own theme with the sky's color as its ground, through `ThemeScope`. | Proposed | This keeps their type, shape, Marker, motion and accent, with solved contrast, and needs no per-theme code. `ThemeScope` was designed for this: the design guide names World as the first candidate. A custom ground does not change the sky, by decision 6. |
| 8 | **Replaced in Phase 10.** "Follow the day" is the default sky. Night mode is always Night, and Day mode follows the local clock. | Replaced by ADR 0008, decision 30 | Someone's appearance choice should not be overruled by art, and a bright sky must not open on someone in Night mode. |
| 9 | Text over art is measured against rendered pixels. What cannot pass goes on a plate, or the art changes. | Proposed | A palette solved against one color proves nothing on a gradient. Measuring found 1.63:1 on Dusk and 2.3:1 on Night. |
| 10 | The way in sits on a plate, while the name and menu sit on the sky. | Proposed | The way in lies over drifting clouds, so its background cannot be known. The name and menu sit where the sky can be arranged to work. |
| 11 | Dusk's sun sets behind the gate, and its left side leans toward the interface's ground. | Proposed | Dusk runs from dark to peach, so no one polarity of text reads across it. This moves the bright part away from the text. |
| 12 | Four sections: Gate, Traveller, Collection, Preparations. | Proposed | The same number as Home, and each maps to an existing owner or is honestly reserved. Locker and Shop live in Collection, by H1. |
| 13 | The way in is always on screen, whatever section is open. | Proposed | A lobby exists to be walked through. |
| 14 | A panel grows beside the menu and fits its content, and the gate stays in view when the window has room. | Proposed | A full-window panel would turn a lobby into a settings page. |
| 15 | `WorldHost` has eight methods: `initialize`, `load`, `suspend`, `resume`, `save`, `exit`, `dispose`, `memory`. No engine is named. | Confirmed (brief, ADR 0001) | Those are the brief's lifecycle, plus the memory report ADR 0001 asks for. |
| 16 | `createWorldController` is the only thing that talks to a host or moves World's phases. It is created outside React. | Proposed | It follows `createWorkspaceModel`. A game must survive Android recreating the root, and a host must never reach into the shell. |
| 17 | The phases are unchanged, with one new event: `failed`, from `entering` to `entry` and from `saving` to `paused`. | Confirmed (brief) for the contract, Proposed for the event | The contract had no failure path, because a timer cannot fail. |
| 18 | Every load has a 30 s deadline and every save 15 s, and a late answer is ignored. | Proposed | The switcher is gone during play, so a hung host would otherwise trap someone. |
| 19 | "Leave without saving" is always available after a failed save, and the screen says that nothing was saved. | Proposed | Same reason. Master plan §2.3 says Save and Leave waits for a confirmed save, and it still does: this is a separate, explicit choice. |
| 20 | A save's receipt is a pointer, in the `world` snapshot. The save belongs to the host. | Proposed | It is the same rule as Workspace's windows, and it keeps the shared snapshot small. World's storage contract is Phase 15's. |
| 21 | Everything a host holds goes in a resource scope, which the controller empties however the host ends. | Confirmed (brief: isolated, inactive outside World) | Cleanup should not depend on a host getting everything right. A leftover is released and logged. |
| 22 | The lobby's scene unmounts once someone is through the gate. | Proposed | A game must not share memory with its lobby. It costs one remount per visit, which is small against the rule. |
| 23 | Leaving World merges into the snapshot, and no longer replaces it. | Confirmed by defect | Replacing it would have wiped the sky and section on every exit. |
| 24 | **G1.** A running study session comes first. The way in becomes "Go to Focus", with the reason. | Confirmed (plan: never silently count game time) for the rule, Proposed for the form | The proposed default is pause or end, and nothing can do that yet. Taking someone to Focus keeps the choice theirs. No session can run until Phase 13, so this is seen only through a development link. |
| 25 | **G2.** Single player first. Nothing in the lobby implies otherwise. | Proposed | The master plan's default. |
| 26 | **G3.** Device floor and download size stay open for Phase 15. Plates add 3.4 MB. | Open | Both depend on the engine. |
| 27 | **G4.** Below 600 × 420 pt the lobby works, and the way in is disabled with a reason. | Proposed | Looking around needs no game. |
| 28 | **R6.** Stays open, with no engine evaluated. The host contract is the mitigation. | Confirmed (brief) | The brief rules out integrating an engine. |
| 29 | `ThemeScope` now reads the resolved system accessibility settings. | Confirmed by defect | It honored only the app's own reduced-motion setting, so a person with the system setting on got full motion in any scoped subtree. |
| 30 | One clock capped at 30 updates a second, or the theme's stepped rate, and nothing scheduled when nothing moves. | Proposed | Nothing ambient moves far enough per frame to need more, and a lobby can sit open for a long time. |
| 31 | A boundary audit rule keeps World and its host behind `import()`. | Proposed | Isolation that depends on a person remembering is not isolation. |

## Deferred future possibilities

None is built or implied. **Needs backend work:** World saves and sync, Locker and Shop actions, presence at the gate. **Frontend, later:** weather in the lobby, sound, a portrait or companion at the gate once they exist, and a per-Space theme.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Showing the Dawnreach island in the lobby | The brief rules out islands and the world |
| Using the visual direction's images as assets | They are concept art for review, at a low resolution and in one light |
| Letting themes recolor the sky | Decision 6. It would lose the identity the visual direction sets |
| A fixed World theme for the interface | It would drop someone's own type and accent, and the brief asks for integration with the design system |
| A WebGL or Skia scene | A new dependency for a few still images, and more memory |
| Text on a scrim across the whole left side | It would dim the sky everywhere to help one sky |
| A separate full-screen settings page | Decision 14 |
| Keeping the scene mounted under the host | Decision 22 |
| Keeping the timed steps inside the Space | They cannot fail, so the failure paths would never have been built or tested |
