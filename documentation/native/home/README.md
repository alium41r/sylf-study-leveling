# Sylf Home

**Phases 6 and 10, 31 October 2026.** The current contract for the Home Space in Sylf Native. Source wins if anything here disagrees: [`native/apps/sylf/src/spaces/home`](../../../native/apps/sylf/src/spaces/home/) and [`native/packages/spaces/src/home.ts`](../../../native/packages/spaces/src/home.ts). Decisions are in [ADR 0005](../decisions/0005-home-interface-template.md), and the evidence is in the [Phase 6 report](../reports/phase-6/report.md).

Labels: **Confirmed** came from the owner's brief or master plan. **Proposed** is a Phase 6 decision the owner can still change.

**What is planned (1 November 2026, not built).** **Confirmed:** calendar, AI Planner, quests and objectives belong in Home, which becomes the hub for planning, daily objectives, schedules and educational progress. **Approved by the owner:** one new destination, Plan, holding Calendar, Quests and goals, and Plans. **Proposed:** Progress gains Stats, Standing, Honours, Skills and Codex as sub-views, Circle gains People, Messages and Parties, and the account control opens a page. See [ADR 0014](../decisions/0014-home-hub-and-workspace-scope.md) and the [blueprint](../expansion/blueprint.md). **Everything below describes what is built today.**

## 1. What exists

Home is a frontend template. It loads no real person's data and contacts no server. Since Phase 10, Focus runs the one study session, tracked on this device ([Spaces guide](../spaces/README.md#10-the-study-session-and-the-timer-dock)).

| Layer | Location | Owns |
| --- | --- | --- |
| Navigation state | `packages/spaces/src/home.ts` | Destinations, labels, the snapshot and its parsing, `createHomeNavigation`, rail keyboard targets. No React |
| Space | `spaces/home/HomeSpace.tsx` | The rail and the destination layers |
| Rail | `spaces/home/HomeRail.tsx` | The four destinations, as a column or a bottom bar |
| Page | `spaces/home/HomePage.tsx` | The still strip, the scrolling page, restoration, columns, `Section`, `PageTitle`, the empty and loading pages |
| Destinations | `spaces/home/destinations/` | Today, Focus, Circle, Progress |
| Data | `spaces/home/data/` | Typed contracts, the sample and empty adapters, the one binding point |
| Words and numbers | `spaces/home/format.ts` | Greeting, durations, and the day's summary |

## 2. The rail

**Confirmed:** a compact left rail with Today, Focus, Circle and Progress.

**Proposed details.**

- **It sits under the Spaces icon, in the same column,** with the icon centered above it. The rail is vertically centered in the rest of the column. The air between them says they are different levels of navigation, and the middle of the left edge is where a thumb rests on a tablet. The master plan's proposal put the destinations at the top.
- **Labels stay visible.** The plan proposed icons with a label on hover or long press, but a tablet has no hover, and an abstract icon should not have to be tapped to learn what it is. The column is still only 60 pt with a mouse and 68 pt with touch. Labels go only when the window is too short for them, and the icons keep their names for assistive technology and gain a tooltip.
- **The Marker flies along the left edge.** `TravellingMarker` gained `axis="y"`, so every theme's body and flight still apply. A line-shaped Marker stands upright. The icon's own mark also lights, so selection is never shown by color alone.
- **A compact window (under 600 pt) gets a bottom bar.** A rail would take a fifth of a 340 pt window. It is the same element in both shapes, so crossing the line moves it without remounting it.
- **Account and settings are not on the rail.** The plan reserves the bottom of the rail for them, but no account exists until Phases 11 and 12, and a control that did nothing would suggest otherwise.

| Input | Behavior |
| --- | --- |
| Touch, stylus | Tap. Targets are at least 44 pt |
| Mouse, trackpad | Click, with a hover tint. An open Spaces bar takes the click, so it never reaches the rail underneath |
| Keyboard (desktop) | Order is the Spaces icon, then the rail, then the page. Up and Down move and wrap (Left and Right in the bottom bar), Home and End jump, Enter or Space selects. Focus stays on the rail. Tab leaves for the page |
| Android Back | Keeps the system's behavior. Home has nothing to close |
| Screen readers | A labelled tab list with tab panels. A destination change is announced. **TalkBack itself has not been run** |

## 3. Destinations

Each page has a still strip at the top, level with the Spaces icon and the timer dock, and a page that scrolls beneath it. The strip holds a short line of context and, for sample data, a **Sample data** badge. Because the strip does not scroll, the badge stays on screen however far a page is scrolled. The strip stops short of the dock, and in a narrow window the line of context steps aside and the badge stays.

| Destination | Layout | Real actions | Disabled until later |
| --- | --- | --- | --- |
| **Today** | A greeting, one sentence about the day, then the day as a single line: what has gone, the one next thing with the Marker on it, and what follows. Objectives and quick actions beside it | Prepare in Focus, Start studying, Open Workspace, Open World. These navigate for real | Nothing |
| **Focus** | An instrument: subject, length, and Begin, then the running session. What is on this device, study desks and recent sessions beside it | Everything about a session: lengths, Begin, Pause, Resume, End. It is the same session as the dock and Workspace's Timer. A desk is still a preview, and says so | Nothing |
| **Circle** | The people you study with around one ring, with the number studying in the middle. People and parties beside it | None | Invite a friend |
| **Progress** | Level on one line, three numbers, one week chart. Subjects and achievements beside it | None | Nothing |

Gamification stays quiet by design, as master plan §2.1 asks: one line for the level, no celebration, and no reward styling.

**Open questions answered for now.** H1: Home shows earned achievements only, and Locker and Shop are not here. H2: Home shows summaries, and Workspace stays the full Planner and Calendar surface. **The owner has since decided H2 the other way, and this stays true only until Part 2 slice C.** H3: Sylvie does not appear in Home yet, because a quick-ask needs the real runtime. H1 and H3 stay Proposed.

## 4. Backend compatibility

**Confirmed (owner, 30 October 2026).** Sylf Native is a completely redesigned frontend, not a new backend or product. Every feature must be able to use the existing Sylf backend, APIs and business logic. A feature that would need significant new backend work is deferred and written down, not built. **This applies to every later phase.**

Every item in Home has an existing owner. **Phase 11 audited this table against the routes,** and Phase 13 connects it. "Reuse" means the route gives this today, "Adapt" that the data exists and needs composing, and "Gap" that it does not exist. Nothing here was checked on a hosted database.

| Home shows | Existing owner | Status |
| --- | --- | --- |
| The day's timed entries | `CalendarEvent`, `/api/calendar/personal?start&end`. Not `calendar/month`, which also reconciles HP penalties | Reuse |
| The day's planned work | `Quest`, `/api/quests?date=`. Plans materialize into quests, so native does not read `PlannerRevision` | **Gap: `Quest.scheduledFor` is a date, so planned work has no time of day and `DayEntry.startsAt` has no source.** Proposed: timed events on the line, then today's quests in order with their minutes. Never invent a time |
| Objectives | `Goal`, `Quest`, `/api/goals`, `/api/quests` | Reuse, through `?all=true&limit=` (Phase 12). `all=true` alone has no limit, so native must not call it |
| The session | The one study session, mapped to `lib/timer-engine.ts`, `StudySession` and `/api/sessions` in [ADR 0008](../decisions/0008-study-session-and-timer-dock.md#backend-map). Web Focus already has countdown and stopwatch modes |
| Study desks | **Focus backgrounds:** `FocusBackground`, `UserFocusBackground`, `/api/focus-backgrounds`, `lib/focus-background-preference.ts`. A desk is a name for a background, not a new kind of thing | Reuse |
| Recent sessions | `StudySession`, named after its quest or subject, in `/api/sessions?limit=` (Phase 12) | Reuse, typed as `recentSessionsSchema` |
| People and presence | `Friendship`, `/api/friends`, which returns `isOnline`, `isStudying` and `activeSessionStartedAt` | Reuse. **Since Phase 11 a friend's privacy applies: `level` and `hunterRank` can be `null`, and hours or status can read as zero or false because they are hidden.** Show hidden, not zero |
| Invite a friend | `FriendRequest`, `/api/friends/requests` | Reuse |
| Study parties | `FocusParty`, `FocusPartyMember`, `/api/focus-party` | Adapt. The route returns the one active party and pending invites, so `parties` holds at most one |
| Level, rank, streak | `User.level`, `hunterRank`, `streakDays`, `/api/user/stats`, `lib/game-engine.ts` | Reuse |
| Week chart, subject shares | `/api/user/detailed-stats?summary=true` (Phase 12) `.dailyStudy`, `.subjectBreakdown` over 35 days. `/api/insights` is AI insights, not a chart | Reuse, typed as `studySummarySchema` |
| Achievements | `UserAchievement`, `/api/achievements` | Reuse |
| The summary sentence, planned time, studying count | Worked out in the app from the data above. No new field | Reuse |

The check changed the template in three places:

- **A friend's subject is not shown.** The friends API says someone is studying and since when, not what. The sample once said "Studying biology". It now says "Studying, 40 min".
- **Parties have no schedule.** `FocusParty` has members and sessions, with no start time and no seat count. The sample once showed "Tonight" and "3 of 6 seats". It now shows members and whether a session is running.
- **The day's summary is not a server field.** It is `summarizeDay()`, from the entries.

**Deferred future possibilities, needing backend work.** Scheduled study parties. Showing what a friend is studying. A "desk" that bundles a background with sound and a layout. None is built, and none is implied by the template.

## 5. State and restoration

| State | Where | Survives |
| --- | --- | --- |
| Destination | The Home snapshot, written the moment it changes | Space changes, remounts, window changes, process kill, restart |
| Each destination's scroll position | Same snapshot, written after a 160 ms pause, on a destination change, when Home leaves, and on backgrounding | Same |
| Chosen desk on Focus | Component state | Nothing. It changes nothing yet, so there is nothing to keep |
| Chosen length, the session | The study session's own record | Everything ([Spaces guide](../spaces/README.md#10-the-study-session-and-the-timer-dock)) |

`createHomeNavigation(store)` is created beside the Spaces store in `App.tsx`, outside React. It keeps no copy of the truth: it reads the store's `home` snapshot, so a change from anywhere reaches the rail. Its listeners fire when the destination changes and never for a scroll, so a scrolling page renders nothing.

A snapshot is `{ destination, scroll: { today, focus, circle, progress } }`. `parseHomeSnapshot` carries Phase 5's `{ scrollY }` over to Today and drops anything unknown. A scroll position is restored once the page's real content is there, because before that it would be clamped to the height of the loading state.

## 6. Mounting and memory

A destination mounts on its first visit and stays mounted and hidden until Home itself leaves. This is the opposite of Spaces, which mount one at a time, and the reason is [risk R15](../master-plan.md#81-major-technical-risks): mounting costs native memory that is not all returned. Going back and forth should mount nothing. Over 240 destination changes on the tablet, this held native heap flat at about 55 MB. A build that remounted each page held 73 to 94 MB, with no growth without limit, but higher and less steady ([report](../reports/phase-6/report.md#5-memory)).

- **Hidden means gone for every purpose but memory:** opacity 0, no touches, out of the accessibility tree (`importantForAccessibility`, `aria-hidden`), and on web `visibility: hidden`, which also removes it from the tab order. Not `display: none`: Fabric drops the native views of a `display: none` subtree, so showing it again would rebuild them.
- **The old page goes at once and the new one arrives.** Two pages crossing over each other is harder to read than either.
- **No `breathing` Marker and no looping animation in a settled Home.** It would drain battery, and `uiautomator` could not read the screen (Phase 5 rule 5). Only the loading state pulses.
- **No full-window SVG, and no shadow on anything that changes size** (Phase 5 rules 1 and 2). The ring in Circle is a bordered view, and the chart is plain views.

Measured figures are in the [Phase 6 report](../reports/phase-6/report.md#5-memory). `npm run android:memory-check -- --sweep=destinations --budget-native=<mb>` keeps this a regression check.

## 7. Data

**Phase 13 connected all four destinations.** Today puts timed events on the line and quests after it, in order, with no invented time, and "Study this" fills in Focus. Focus lists what the server accepted under Recent sessions, and what it has not under On this device. Progress reads the server's level, rank, XP and streak, the week from `detailed-stats?summary=true`, and offers Claim on an achievement that is ready. Circle shows friends, says hidden for what a friend hides, answers friend requests, and lists a party and invitations with no schedule. Desks are gone from a signed-in Focus ([ADR 0012](../decisions/0012-connected-app.md)). The table in §4 is the audit: this paragraph is what was built.

Screens never import sample data. They call `useHomeResult(view, load)`, which reads the adapter from `data/index.ts`, and each result carries `provenance`. The Sample data badge comes from that field, so a real adapter removes the badge with no screen change.

| Build | Adapter |
| --- | --- |
| Someone signed in | Live. `data/live.ts`, one resource per destination |
| A backend, and nobody signed in | Empty |
| No backend, `DEV_TOOLS` on (a development build) | Sample. Invented people and invented numbers, all marked sample |
| No backend, `DEV_TOOLS` off | Empty. **A store build cannot show sample content**, and a test covers this |
| App link `homeData=empty` or `homeData=slow` | The empty state or the loading state, for review |

The sample day is built around the current time, so the line always has a next item. The sample week adds its totals up from the same days the chart draws.

Each destination has five states: loading, empty, ready, offline and failed. Empty pages are written for a real person. Offline shows a badge in the strip, over the last good copy if there is one. A failure with nothing to show says why and offers Try again.

## 8. Development and diagnostics

| Link | Web | Android |
| --- | --- | --- |
| A destination | `?space=home&home=circle` | `sylf-native://spaces?space=home&home=circle` |
| A data state | add `&homeData=empty` | same |

New log line: `SYLF_HOME_MOUNT <destination> <ms>`, once per destination per Home mount.

## 9. Extending Home

1. Name the existing backend owner first, and add it to §4. No owner means defer it and write it down.
2. Add to `data/contracts.ts`, then to the sample and empty adapters. Screens read view models, never server records.
3. Use `Section`, `HomeColumns` and `HomePage`. Do not add a second scroller, a second persistence path, or per-theme layout.
4. Keep text at `soft` or stronger: `faint` is 3:1, for marks and not for words.
5. Run `npm run desktop:home-check`, `npm run android:home-check` and the memory sweep.
