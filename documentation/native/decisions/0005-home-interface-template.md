# ADR 0005 — Home interface template

**Status: Accepted with Phase 6 (30 October 2026), subject to the owner's Phase 6 review.** This builds on [ADR 0003](0003-design-system-and-theme-engine.md) and [ADR 0004](0004-global-spaces-shell.md). The current contract is the [Home guide](../home/README.md), and the evidence is in the [Phase 6 report](../reports/phase-6/report.md).

Labels follow the master plan: **Confirmed** came from the owner's briefs, **Proposed** is a Phase 6 decision the owner can still change.

**Planned change, 1 November 2026.** [ADR 0014](0014-home-hub-and-workspace-scope.md) makes Home the planning hub and proposes a fifth destination, Plan, which will change decision 2 when built. This record still describes what is built.

> **Update, Expansion Part 2 (4 November 2026).** Home now has five destinations: Today, Plan, Focus, Circle and Progress. Plan and Progress carry sub-views (`SubNav`, kept in the Home snapshot), and the account is a page reached from the rail's foot. See the [Home guide](../home/README.md), the [Plan guide](../plan/README.md) and the [Progress guide](../progress/README.md). The template's rules, the five states and the memory budget still apply to every new view.

## Decisions

| # | Decision | Status | Why |
| --- | --- | --- | --- |
| 1 | **Sylf Native is a redesigned frontend over the existing backend.** Every feature must be able to use existing APIs and business logic. A feature needing significant backend work is deferred and documented. This applies to all later phases. | Confirmed (owner, during Phase 6) | "The goal is a completely redesigned frontend, not an entirely new backend or product." |
| 2 | Home has a compact rail with Today, Focus, Circle and Progress, in the column under the Spaces icon. | Confirmed | Owner brief and master plan §2.1. |
| 3 | The rail is vertically centered in that column, not stacked directly under the icon. | Proposed | Air separates global navigation from Home's navigation, and the middle of the left edge is where a thumb rests. Replaces the plan's "at the top". |
| 4 | Labels stay visible, and go only when the window is too short for them. | Proposed | Touch has no hover. Replaces the plan's icons-only proposal. The column stays 60 to 68 pt in the comfortable density. |
| 5 | A compact window (under 600 pt) gets a bottom bar, from the same element. | Proposed | A left rail would take a fifth of a 340 pt window. One element means no remount on resize. |
| 6 | `TravellingMarker` gained `axis="y"`, and the horizontal path is unchanged. | Proposed | A missing capability goes in the design system. A second vertical marker would duplicate the flight logic. |
| 7 | No account or settings control on the rail yet. | Proposed | There is no account until Phases 11 and 12, and an inert control would suggest a function. The bottom of the rail stays free for it. |
| 8 | Home's navigation is `createHomeNavigation(store)` in `@sylf/spaces`, with no React. It writes through the Spaces store's `home` snapshot and holds no second copy. | Confirmed direction (brief: persist outside React) | One persistence path. Pure logic can be tested without a renderer. |
| 9 | The destination is written at once. Scroll positions wait 160 ms, and are written on a destination change, on leaving Home and on backgrounding. | Proposed | The same reasoning as ADR 0004 decision 5. |
| 10 | A destination mounts on first visit and stays mounted and hidden until Home leaves. | Proposed | Risk R15: mounting costs native memory that is not all returned. Measured over 240 changes: about 55 MB native heap and flat, against 73 to 94 MB when remounting. |
| 11 | Hidden means opacity 0, no touches, out of the accessibility tree, and `visibility: hidden` on web. Not `display: none`. | Proposed | Fabric drops native views under `display: none`, so showing the page again would rebuild them, which defeats decision 10. |
| 12 | Actions that can be real are real, and the rest are disabled and say why. | Confirmed (brief: do not suggest mock actions work) | Today's quick actions navigate for real. Begin session and Invite a friend are disabled with a sentence beside them. |
| 13 | Every data result carries `provenance`, and the **Sample data** badge comes from it, in a strip that does not scroll. | Proposed | Screens cannot forget the notice, and a real adapter removes it with no screen change. |
| 14 | Without `DEV_TOOLS`, Home binds the empty adapter. | Confirmed (master plan §5.4) | Production builds must not ship mock data paths. |
| 15 | Contracts are view models, each naming its backend owner. | Proposed (master plan §5.4) | Phase 13 swaps an adapter and no screen changes. |
| 16 | A study desk is a focus background. | Proposed | The brief names study desks. The backend has focus backgrounds, and decision 1 rules out a new concept. |
| 17 | Sample friends show "Studying, 40 min", and sample parties show members and whether a session is running. | Proposed | `/api/friends` does not say what a friend studies, and `FocusParty` has no schedule or seats. The template must not promise what the backend cannot supply. |
| 18 | The day's summary, planned time and studying count are worked out in the app. | Proposed | Lightweight logic over existing data needs no new field. |
| 19 | `ListRow` details and `Readout` labels and units moved from `faint` to `soft`. | Proposed | `faint` is guaranteed 3:1, and these are small words. Home's audit measured 4.46:1. |
| 20 | H1, H2 and H3 stay on their proposed defaults: earned items only, summaries only, and no Sylvie in Home yet. | Proposed | A quick-ask needs the real runtime. |

## Deferred future possibilities

Each would need backend work, so none is built or implied: scheduled study parties; showing what a friend is studying; a desk that bundles a background with sound and a layout.

## Alternatives considered

| Option | Why not |
| --- | --- |
| One destination mounted at a time, as with Spaces | Built and measured as a temporary variant: 20 to 40 MB more native heap, and less steady. It did not grow without limit |
| `display: none` for hidden destinations | See decision 11 |
| A floating rail surface | Adds chrome the page does not need. Air separates it already |
| A separate store for Home | A second persistence path, which ADR 0004 and the Spaces guide forbid |
| Cards for Today | The system avoids cards as a default. One line through the day is more distinctive and reads faster |
| Disabled controls for everything | A template that does nothing cannot be judged. Real navigation is cheap, and it is honest |
| Sample data hardcoded in screens | Phase 13 would rewrite the screens |

## Consequences

- Phase 13 replaces `homeDataFor` and adds an error state. Phase 11 audits the table in the Home guide.
- Home's memory while open is higher than one page, by design, and falls when Home leaves.
- `npm run android:memory-check -- --sweep=destinations` is now a regression check with a budget.
- Phase 7 onward must name a backend owner for each Workspace feature before building it.
