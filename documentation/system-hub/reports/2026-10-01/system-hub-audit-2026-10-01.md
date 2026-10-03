# System Hub refresh — 1 October 2026

Collection, Achievements, and Archive were checked against the current routes, Prisma models, reward APIs, Locker, Character Studio, Focus, planner implementation, and appearance tokens. Config screens and other agents' changes were preserved.

## Content removed or corrected

- Removed the retired Classes portraits from Collection and the Classes article from Archive. Compatibility records remain intact.
- Removed the old skill-tree guide because that interface is no longer reachable from the current Locker. It incorrectly described eight class paths and an obsolete apex level.
- Removed theme purchases and background unlocks from acquired-item counts. Appearance colors and light/dark mode are current user preferences; official focus backgrounds are a shared gallery.
- Removed the obsolete theme-unlock achievement. Existing claim records and previously earned rewards were retained.
- Replaced future rewards for retired item keys with supported XP/Sylph rewards. Existing claim IDs remain stable, so previously claimed milestones cannot be redeemed again.
- Corrected streak terminology to consecutive **weeks**, matching the current weekly focus milestone, including the Tenacity adjustment.
- Corrected rank requirements to the canonical level ladder, including National Hunter and Monarch.
- Corrected inventory reads to use `UserInventory` and nested `Item` data. Zero quantities no longer count as one owned item.
- Removed the “Guild Master” wording, fixed distinct-friend counting, and require a finished session with at least one minute of focus for First Session.
- Removed unsupported named consumable promises, guaranteed shop stock, automatic attribute growth, and cosmetic purchase requirements from the guide.

## Current coverage

Collection shows positive inventory quantities and equipped state; available Character Studio forms and pedestals; account-backed personal focus images and the separate official gallery; device-local imported audio; saved profile keepsakes excluding defaults; and currency ledger totals. Counts come from the relevant API or current catalog. Failed requests remain visibly unavailable instead of becoming false zero totals.

Achievements contains **32 milestones in eight categories**. New milestones cover subjects, confirmed Planner Modes plans, finished Focus Party participation, personal backgrounds, owned inventory, National Hunter, and Monarch. GET and reward redemption share the same progress facts. Claims retain the existing atomic reward RPC, duplicate-claim protection, and ledger updates. The screen fetches fresh progress after redemption because an XP reward can unlock another milestone.

Archive contains **28 entries in seven chapters**. Added or refreshed documentation covers seven study protocols, Focus Tools, subject history, weekly focus and recovery, floating rest days, Classic planning, Exam/Roadmap/Mastery modes, Quick Plan and scope preparation, Character Studio, profile customization, personal focus backgrounds, local audio, Focus Parties, privacy, collections, cognitive investments, and current rewards. Rank, attribute, and milestone totals derive from canonical registries where available.

## Interface changes

Collection and Achievements use the Archive's library hierarchy, restrained depth, category index, and ledger composition. Headings and numeric stats use the app's Rajdhani typography. Repeated introductory copy and redundant requirement descriptions were reduced.

The page-switching row was removed. Each page returns to System Hub; no links between these three pages were added. Existing feature actions lead to the relevant Locker or settings feature.

Both Collection and Achievements have a bounded container with a stationary index and an independently scrolling right pane. Category changes reset that pane to the top. On narrow screens the index becomes a horizontal row. The scroll pane is keyboard accessible and contains scroll overshoot.

All page surfaces, accents, borders, shadows, and text derive from existing appearance variables and semantic colors. Canvas text contrast adjusts to the selected background independently of light/dark surface mode. No fixed page palette was introduced.

## Retired reward replacements

| Existing milestone    | Future reward |
| --------------------- | ------------- |
| Study 500 hours       | 3,500 Sylph   |
| Study 1,000 hours     | 5,000 Sylph   |
| 100-week streak       | 3,500 Sylph   |
| S-Rank                | 5,000 Sylph   |
| Complete 1,000 quests | 5,000 Sylph   |
| Spend 10,000 Sylph    | 1,500 Sylph   |

These replace legacy item awards that the current Locker does not consume. No historical inventory or claim data was deleted or migrated.

## Validation

TypeScript checks, targeted ESLint, and tests cover current inventory quantities, collection source failures, achievement facts, atomic rewards and duplicate claims, fresh eligibility after XP claims, filtering, pane resets, Archive search/bookmarks/navigation, appearance contrast, System Hub return navigation, canonical game progression, cognitive attributes, and session math.

Live authenticated browser checks verified real collection counts and selected styles, current milestone counts, shorter copy, Rajdhani typography, absence of cross-page navigation, bounded scrolling, and responsive layouts at desktop and 390-pixel width. No real achievement was claimed during browser verification.
