# Home dashboard redesign

12 and 13 November 2026 · `phase-14-pen-settings` · working-tree changes only, nothing committed

The owner asked for Today, at desktop widths, to become four distinct parts in a two-by-two arrangement with no cards or panels around them: progress, the World island, objectives, and social. A later instruction moved the timer button to the middle, where the four parts meet. The current contract is in the [Home guide](../../home/README.md#today). This report covers what changed, why, how the island stays light, and what was and was not verified.

## What changed

| Part | Before | Now |
| --- | --- | --- |
| Top left: progress | A header, then a raised "Your momentum" card beside the agenda, and the daily target inside the hero card | The date, greeting and day's sentence, with Ask Sylvie and Workspace. Under it, with no surface: level, rank and XP on a rule; today's study against the daily target as cells; days in a row, the last seven days, Sylph; the week as bars |
| Top right: World | A small still thumbnail on a list row | The island: the gate on its dais in the sea of cloud, in the hour's sky, with the roof rising out of the sky's top edge. It moves slightly and opens World |
| Bottom left: objectives | A raised hero card for the next action and a raised "Your day" card | The next thing to do in the Voice with Set up focus, the day's events on a line, quests ticked in place with Study this, the week's focus quest, Coming up, open goals (new on Today, from Plan's existing read), and Sylvie's note without its box |
| Bottom right: social | A "Circle" card of faces, and an invitation banner that only pointed to Circle | Party invitations and friend requests answered in place, who is studying or online now, and the party you are in |
| Middle | The Begin focus button sat in the hero card | One button on the hairline between the rows, centred on the gutter between the columns: the point where the four parts meet |

Every action the page had is still there: Begin focus, Set up focus, Study this, ticking a quest, Calendar, Ask Sylvie, Workspace, World, Progress, Circle. A quest still opens Focus with its subject and title, and an event still opens Calendar.

## Design decisions

- **No containers.** No part has a fill, border, radius or shadow. Structure is the two-column grid (6 : 5), 48 pt of air between columns, one hairline between the rows, and a heading in the same place in every part. The check asserts this from computed styles.
- **One heading pattern** (`PartHeader`): a title, an optional soft detail, and one ghost link onward. It is what makes four different kinds of content read as one page.
- **Three voices kept in role.** The greeting and the next quest are in the Voice; level and minutes are large Instrument numerals; everything operable is Interface. Accent is spent on the hub, the Marker, today's bar and the filled cells.
- **The island is a picture, not a card.** The sky is a window with the theme's corner, and the gate is clipped only at the bottom, so its roof stands above the window's edge. It is authored art and does not follow the theme, as in the lobby.
- **The hub.** The timer button sits on the dividing hairline, with the ground colour behind it so the rule breaks around it. It is in the flow, so it cannot overlap content at any size. Its middle comes from the row's own measured width, so it stays on the gutter whatever the shell does around the page. Which session it begins is named directly beside it in the objectives part.
- **Narrower layouts.** From 560 to 879 pt of content width the greeting comes first, progress sits beside a smaller island, the hub is on the hairline under them, then objectives and Circle in one column. Under 560 pt it is one column and the hub comes straight after the greeting, so the way into a session is on the first screen of a phone.
- **Theme-safe.** Only semantic tokens, existing components and existing icons are used. Nothing branches on a theme, there is no gradient, and no palette value was added.

## Architecture

- `TodayDestination` only arranges the parts and owns the actions that leave the page. Each part is a memoised component with its own reads, so one read answering renders one part.
- No new request shapes. Progress uses the shell's `user-stats` resource (by the same key, through a new `useStatsResult` that also reports loading and failure) and Progress's `progress-record`. Coming up and goals now share Plan's `plan-quests` resource, which replaced Today's separate `today-ahead` read of the same route; this adds one existing read, `GET /api/goals`. Circle uses `home-circle` alone; Today no longer also asks for the party summary.
- Answering is shared: `circle/AnswerRows.tsx` holds the friend-request and party-invitation rows that Circle's People and Parties views and Today all use, calling `acceptFriend` and `parties.answerInvite` as before.
- Layout is pure and tested: `todayLayout.ts` (`todayLayout`, `islandBox`, `gutterCentre`, `hubOffset`).
- The island is `spaces/world/DashboardWindow.tsx`, loaded by `TodayScenery` with `import()`, with its motion plan in `spaces/world/dashboardMotion.ts`. Home imports nothing from World statically, and the boundary audit passes.
- Removed: `TodayHero`, `TodayDay`, `TodayMomentum`, `TodayCircle`, `TodayInvites`. Added: `TodayParts`, `TodayProgress`, `TodayObjectives`, `TodaySocial`, `TodayHub`, `useDashboardLive`.

## How the island stays light

- **Five animations, all `transform` or `opacity`:** the dais rises and settles 4 pt over 6.8 s, two clouds drift 22 and 12 pt, the sea sways 9 pt, and the light in the opening dims to 62%. Each alternates, so nothing loops with a seam.
- **No JavaScript between frames.** They are Reanimated CSS animations: real `@keyframes` in the Electron renderer and the UI thread on a device. There is no shared value, no worklet, no timer and no state. React renders the island once.
- **Paused when not looked at.** `useDashboardLive` is true only while Today is the destination on screen, the app is in front, and neither the account page nor the Focus environment is over it. Home itself unmounts when another Space is chosen.
- **Absent with reduced motion** or the Still intensity: no animation is created. A stepped theme (Voxel) uses `steps()` with one step per pixel.
- **No new bitmap.** It reuses the World's existing plates for the hour (sky, two clouds, gate, sea, glow): eight image elements, the largest 1500 by 350.

**Measured in the packaged Electron app** at 1440 by 900, four idle seconds each, from DevTools performance metrics and counters on the page ([evidence](evidence/frontend-check-home.json)):

| | Island running | Island paused (Plan on screen) |
| --- | --- | --- |
| Script time | 0 to 0.003 s | 0.001 to 0.003 s |
| Layouts | 0 | 0 |
| `requestAnimationFrame` calls | 0 | 3 to 13 |
| DOM mutations inside the island | 0 | 0 |
| CSS animations, running | 5 of 5 | 0 of 5 |

The paused column is higher only because Plan mounts during it. The check asserts that all five are `CSSAnimation`s touching only `opacity` and `transform`, that they pause when Today is left and resume on return, that reduced motion leaves none, and that the island's subtree is never mutated while it runs.

## Verification

| Check | Result |
| --- | --- |
| `npm run typecheck` | 0 errors |
| ESLint on Home, the island and the check files | 0 problems |
| Vitest, Home and World | 9 files, 61 tests passed |
| Vitest, whole Native workspace | 52 files, 644 passed, 1 skipped |
| `check:boundaries`, `check:single-copy` | No violations, no failures |
| Packaged Electron, Home scenarios (`SYLF_FRONTEND_CHECK_ONLY=home`) | See below |

RESULTS_PLACEHOLDER

Screenshots, all from the packaged app against the loopback fixture: [1440 by 900](evidence/02-home-desktop-1440.png), [1280 by 755](evidence/02-home-desktop-1280.png), [1024 by 720](evidence/02-home-tablet-landscape.png), [900 by 480](evidence/02-home-short-900x480.png), [820 portrait](evidence/02-home-tablet-portrait-820.png), [744 portrait](evidence/02-home-tablet-portrait-744.png), [390 phone](evidence/02-home-phone-390.png), [Cozy light](evidence/02-home-cozy-light-1440.png), [Voxel with custom colours and 125% text](evidence/02-home-voxel-custom-1280.png), [Signature light with custom colours and 125% text](evidence/02-home-signature-light-custom-1440.png), [Voxel at 744](evidence/02-home-voxel-custom-744.png), [Cozy on a phone](evidence/02-home-cozy-light-390.png), [reduced motion](evidence/02-home-reduced-motion.png), and a second account with no data at [1440](evidence/02-home-empty-1440.png) and [390](evidence/02-home-empty-390.png).

The check sets each viewport through DevTools, because this Mac's display is 1440 by 900 and a window cannot be 900 pt tall inside it.

## Changes outside Home's own folders

- `native/apps/desktop/src/frontend-fixture.mjs`: friends, one friend request, one party invitation, one goal, and the two `PATCH` routes that answer them, for the signed-in fixture account only.
- `native/apps/desktop/src/frontend-check.mjs`: Home's scenarios rewritten. Two lines affect the whole check: `contents.setBackgroundThrottling(false)` at the start, and Home's last step before the final sign-out (the hub returning to a running session).
- `circle/PartiesView.tsx` and `CircleDestination.tsx` (inside Home) now use the shared answer rows. A friend request in Circle gained a "Wants to be friends" line and sits on one row.
- `native/packages/design-system` was not edited.

## Limits and what is not verified

- **There is no island art.** The World, its islands and terrain are Phase 15, and the lobby deliberately shows only a gate. The "island" is that gate on its dais in the cloud sea. It is not personal to the account beyond the hour's sky and the Sylph count beside it.
- **Nothing was run on Android or iOS.** The tablet was off limits for this work. The island's native path (Reanimated CSS animations on the UI thread), its pause on backgrounding, its memory, its battery cost and whether `uiautomator` can still read Today while it moves are unverified. The Home guide's rule against looping animation on a settled Home now has this one exception, and that rule existed partly for `uiautomator`.
- **Touch and screen readers** were not exercised on the new layout. The hub's button is named only by its title.
- **Live data.** Everything was checked against the loopback fixture. The hosted backend was not used.
- **Other check scripts** (`home-check.mjs`, `journey-check.mjs`) are not mine to edit and still expect older Today ids such as `today-ring`, which was already gone before this work. Ids they use and that still make sense were kept (`today-day`, `today-momentum`, `today-world`, `today-circle`, `today-window`, `today-begin`, `today-plan`, `today-ask`, `today-study-*`). They were not run.
- **Top-left wraps at 1024 pt.** At that width the two measures stack, so the progress part is taller than the island beside it. It fits, but it is the least balanced of the sizes.
