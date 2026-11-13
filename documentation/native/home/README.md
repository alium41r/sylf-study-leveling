# Sylf Home

**Phases 6 and 10, 31 October 2026.** The current contract for the Home Space in Sylf Native. Source wins if anything here disagrees: [`native/apps/sylf/src/spaces/home`](../../../native/apps/sylf/src/spaces/home/) and [`native/packages/spaces/src/home.ts`](../../../native/packages/spaces/src/home.ts). Decisions are in [ADR 0005](../decisions/0005-home-interface-template.md), and the evidence is in the [Phase 6 report](../reports/phase-6/report.md).

Labels: **Confirmed** came from the owner's brief or master plan. **Proposed** is a Phase 6 decision the owner can still change.

**Updated 10 November 2026.** Home opens after account sign-in. Its five destinations are Today, Plan, Focus, Circle and Progress. The account sits at the rail's foot. [Plan](../plan/README.md), [Circle](../circle/README.md), [Focus](../focus/README.md), [Progress](../progress/README.md), [Account](../account/README.md).

## 1. What exists

Home reads the signed-in person's schedule, quests, study record and social data through the Native backend client. The timer dock and Focus still share one study session.

| Layer | Location | Owns |
| --- | --- | --- |
| Navigation state | `packages/spaces/src/home.ts` | Destinations, labels, the snapshot and its parsing, `createHomeNavigation`, rail keyboard targets. No React |
| Space | `spaces/home/HomeSpace.tsx` | The rail and the destination layers |
| Rail | `spaces/home/HomeRail.tsx` | The five destinations, as a column or a bottom bar, with the account at its foot |
| Page | `spaces/home/HomePage.tsx` | The still strip, the scrolling page, restoration, columns, `Section`, `PageTitle`, the empty and loading pages |
| Destinations | `spaces/home/destinations/` | Today, Plan, Focus, Circle, Progress. Plan and Progress mount their views from `spaces/home/plan/` and `spaces/home/progress/`, each on first visit |
| Data | `spaces/home/data/` | Typed view models composed from authenticated reads |
| Words and numbers | `spaces/home/format.ts` | Greeting, durations, and the day's summary |

## 2. The rail

**Confirmed:** a compact left rail with Today, Plan, Focus, Circle and Progress.

**Proposed details.**

- **It sits under the Spaces icon, in the same column,** with the icon centered above it. The rail is vertically centered in the rest of the column. The air between them says they are different levels of navigation, and the middle of the left edge is where a thumb rests on a tablet. The master plan's proposal put the destinations at the top.
- **Labels stay visible.** The plan proposed icons with a label on hover or long press, but a tablet has no hover, and an abstract icon should not have to be tapped to learn what it is. The column is still only 60 pt with a mouse and 68 pt with touch. Labels go only when the window is too short for them, and the icons keep their names for assistive technology and gain a tooltip.
- **The Marker flies along the left edge.** `TravellingMarker` gained `axis="y"`, so every theme's body and flight still apply. A line-shaped Marker stands upright. The icon's own mark also lights, so selection is never shown by color alone.
- **A compact window (under 600 pt) gets a bottom bar.** A rail would take a fifth of a 340 pt window. It is the same element in both shapes, so crossing the line moves it without remounting it.
- **Account sits at the end of the rail.** In the bottom bar, its width is reserved before the five destinations divide the safe-area width. The marker sits below the selected label.

| Input | Behavior |
| --- | --- |
| Touch, stylus | Tap. Targets are at least 44 pt |
| Mouse, trackpad | Click, with a hover tint. An open Spaces bar takes the click, so it never reaches the rail underneath |
| Keyboard (desktop) | Order starts with the Spaces icon and timer dock, then the rail and page. Up and Down move and wrap (Left and Right in the bottom bar), Home and End jump, Enter or Space selects. Focus stays on the rail. Tab leaves for the page |
| Android Back | Keeps the system's behavior. Home has nothing to close |
| Screen readers | A labelled tab list with tab panels. A destination change is announced. **TalkBack itself has not been run** |

## 3. Destinations

A page scrolls below the shell controls. Today keeps the date with the greeting, and other destinations may show context in the top strip when there is room. Offline status moves into the page in narrow layouts.

| Destination | Layout | Real actions | Disabled until later |
| --- | --- | --- | --- |
| **Today** | The dashboard: four parts with no surface around any of them. Progress under the greeting, the World island, what there is to do, and Circle, with the timer button at the middle where they meet. Two by two with room, see [Today](#today) | Begin focus, Study this, tick a quest, Calendar, Enter World, Progress, Circle, and answering a friend request or a party invitation. All real | Nothing |
| **Plan** | Planner (the [Planning Studio](../../planner/STUDIO.md): timeline, goal map, inspector, command bar, proposals and undo), Calendar (Month, Week, Agenda beside a day page, with one add field), Quests and goals, Classic plans | Create, move and complete quests and events, rest days, goals and subjects, and build, watch, answer and confirm an AI plan (Plans) | Drag to move or resize in Week; plan materials upload |
| **Focus** (replaced in Part 2 by the threshold: what, rhythm, where, **Enter**) | An instrument: subject, length, and Begin, then the running session. What is on this device, study desks and recent sessions beside it | Everything about a session: lengths, Begin, Pause, Resume, End. It is the same session as the dock and Workspace's Timer. A desk is still a preview, and says so | Nothing |
| **Circle** (three views since Part 3) | People (the ring and list), Messages, Parties, with Notifications and Find people as sheets | Find people, requests, message, remove, block; conversations, groups; party invitations, start, invite, leave | Realtime, party sessions, blocked list |
| **Progress** (six views since Part 2) | Overview, Stats, Standing, Honours, Skills, Codex. Level on one quiet line, no HP | Claim all, raise an attribute | Skill nodes |

Today also carries Sylvie's daily briefing line when she wrote one (`TodayBriefing`); quick conversation sheets (`QuickAsk`) stay available from Focus. See the [Circle guide](../circle/README.md) and the [Plan guide](../plan/README.md).

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
- **The day's summary is composed by `mapToday()` from timed entries, all-day events and quests.

**Deferred future possibilities, needing backend work.** Scheduled study parties. Showing what a friend is studying. A "desk" that bundles a background with sound and a layout. None is built, and none is implied by the template.

## 5. State and restoration

| State | Where | Survives |
| --- | --- | --- |
| Destination | The Home snapshot, written the moment it changes | Space changes, remounts, window changes, process kill, restart |
| Each destination's scroll position | Same snapshot, written after a 160 ms pause, on a destination change, when Home leaves, and on backgrounding | Same |
| Focus background | Existing account preference | Across signed-in clients |
| Chosen length, the session | The study session's own record | Everything ([Spaces guide](../spaces/README.md#10-the-study-session-and-the-timer-dock)) |

`createHomeNavigation(store)` is created beside the Spaces store in `App.tsx`, outside React. It keeps no copy of the truth: it reads the store's `home` snapshot, so a change from anywhere reaches the rail. Its listeners fire when the destination changes and never for a scroll, so a scrolling page renders nothing.

A snapshot is `{ destination, scroll: { today, plan, focus, circle, progress } }`. `parseHomeSnapshot` carries Phase 5's `{ scrollY }` over to Today and drops anything unknown. A scroll position is restored once the page's real content is there, because before that it would be clamped to the height of the loading state.

## 6. Mounting and memory

A destination mounts on its first visit and stays mounted and hidden until Home itself leaves. This is the opposite of Spaces, which mount one at a time, and the reason is [risk R15](../master-plan.md#81-major-technical-risks): mounting costs native memory that is not all returned. Going back and forth should mount nothing. Over 240 destination changes on the tablet, this held native heap flat at about 55 MB. A build that remounted each page held 73 to 94 MB, with no growth without limit, but higher and less steady ([report](../reports/phase-6/report.md#5-memory)).

- **Hidden means gone for every purpose but memory:** opacity 0, no touches, out of the accessibility tree (`importantForAccessibility`, `aria-hidden`), and on web `visibility: hidden`, which also removes it from the tab order. Not `display: none`: Fabric drops the native views of a `display: none` subtree, so showing it again would rebuild them.
- **The old page goes at once and the new one arrives.** Two pages crossing over each other is harder to read than either.
- **No `breathing` Marker and no looping animation in a settled Home.** It would drain battery, and `uiautomator` could not read the screen (Phase 5 rule 5). Only the loading state pulses. **One exception since 12 November 2026:** the island on Today, which the owner asked for. It is paused whenever the dashboard is not on screen and absent with reduced motion ([Today](#today)). Its effect on `uiautomator` and on battery has not been measured on a device.
- **No full-window SVG, and no shadow on anything that changes size** (Phase 5 rules 1 and 2). The ring in Circle is a bordered view, and the chart is plain views.

Measured figures are in the [Phase 6 report](../reports/phase-6/report.md#5-memory). `npm run android:memory-check -- --sweep=destinations --budget-native=<mb>` keeps this a regression check.

## 7. Data

**Phase 13 connected all four destinations.** Today puts timed events on the line and quests after it, in order, with no invented time, and "Study this" fills in Focus. Focus lists what the server accepted under Recent sessions, and what it has not under On this device. Progress reads the server's level, rank, XP and streak, the week from `detailed-stats?summary=true`, and offers Claim on an achievement that is ready. Circle shows friends, says hidden for what a friend hides, answers friend requests, and lists a party and invitations with no schedule. Desks are gone from a signed-in Focus ([ADR 0012](../decisions/0012-connected-app.md)). The table in §4 is the audit: this paragraph is what was built.

`useHomeResult(view)` binds each view to the signed-in backend. Empty, loading, offline and failed states come from those resources. Cached results clear when the account changes. The connection and sign-in screens appear before Home mounts.

## 8. Development and diagnostics

| Link | Web | Android |
| --- | --- | --- |
| A destination | `?space=home&home=circle` | `sylf-native://spaces?space=home&home=circle` |

New log line: `SYLF_HOME_MOUNT <destination> <ms>`, once per destination per Home mount.

## 9. Extending Home

1. Name the existing backend owner first, and add it to §4. No owner means defer it and write it down.
2. Add view models in `data/contracts.ts` and compose them from typed reads in `data/live.ts`.
3. Use `Section`, `HomeColumns` and `HomePage`. Do not add a second scroller, a second persistence path, or per-theme layout.
4. Keep text at `soft` or stronger: `faint` is 3:1, for marks and not for words.
5. Run `npm run desktop:frontend-check`. The historical Home checks contain template-era expectations. Verify tablet gestures and safe areas on a signed-in device when one is available.

## Part 5 (5 November 2026)

Today gained a status line, the weekly focus quest, a real "What's ahead" list and Sylvie's insights; the Sylvie sheet continues earlier conversations. See the [Part 5 report](../reports/expansion-part-5/report.md) for the parity table against Web.

## Today

**Redesigned 12 November 2026.** Today is a dashboard of four parts. None has a card, panel, fill, border or shadow: a part is set apart by air, by where its heading sits, and by one hairline between the rows. Decisions, the island's measurement and the screenshots are in the [Home redesign report](../reports/2026-11-12-home-redesign/README.md).

| Part | Where (desktop) | Shows | Reads |
| --- | --- | --- | --- |
| **Progress** (`TodayHeader`, `TodayProgress`) | Top left | The date, the greeting and the day in one sentence. Then level, rank and XP on a rule, today's study against the daily target as cells, the run of days, the last seven days, Sylph, and the week as bars. Opens Progress | The shell's `user-stats`, Progress's `progress-record`, and the day's target from `home-today` |
| **World** (`TodayWorld`, `TodayScenery`, `spaces/world/DashboardWindow`) | Top right | The island: the gate on its dais in the sea of cloud, in the hour's sky, moving slightly. The picture and the Enter link open World | `user-stats` for Sylph. The art is loaded with `import()` |
| **Objectives** (`TodayObjectives`, `QuestPath`, `TodayAhead`, `TodayBriefing`) | Bottom left | The day's timed events on a line, today's quests along a connected completion path, coming up quests on a matching path, the week's focus quest anchored at the bottom of the quests section, full-width open goals, and Sylvie's note. Opens Calendar | `home-today`, `progress-weekly-quest`, Plan's `plan-quests`, the briefing and insights |
| **Circle** (`TodaySocial`, `circle/AnswerRows`) | Bottom right | Party invitations and friend requests, answered in place; who is studying or online now; the party you are in. Opens Circle | `home-circle` |

**The hub** (`TodayHub`) is the way into a session: one button (Begin focus, Back to focus, or View calendar when an event is next) on the hairline between the rows. In the grid its middle is the gutter between the columns, which is the point where the four parts meet. It is in the page's flow, so it never covers content, and its position comes from the row's own measured width. It behaves as the button always did: it begins the next quest in Focus with its subject and title, returns to a running session, or opens Calendar for an event. What it will begin is named beside it in Objectives.

**Layout** comes from the page's own content width, inside the rail, padding and safe areas (`todayLayout.ts`), never from the device:

| Content width | Layout | Order |
| --- | --- | --- |
| 880 pt and up | `grid`: two rows of two, left to right 6 : 5 | Progress, World / the hub at the middle / Objectives, Circle |
| 560 to 879 pt | `paired`: the greeting, then Progress beside the island, then one column | Progress and World, the hub centred on the hairline, Objectives, Circle |
| Under 560 pt | `stack`: one column, with the way into a session first | Greeting, the hub, Objectives, Progress, World, Circle |

The page may be 1200 pt wide on Today (`HomePage`'s `wide`), and 1080 pt elsewhere.

**Behaviour that did not change.** A quest opens Focus with its subject and title (the hub's Begin focus enters the environment, and Study this prepares Focus). An upcoming event opens Calendar. The active clock reads the shared session and ticks only while the dashboard is on screen. A missing daily target has its own setup action, and a rest day says so. Timed events go on the line and quests follow with no invented time.

**Honest states.** The whole page waits for the day's read, and says so if it fails. Inside it, level and Circle each show a placeholder until their own read answers, and a short failure line with Try again if it fails. A list with nothing in it draws no heading: no goals, nothing coming up, no invitations and no briefing each render nothing. With no friends, Circle says so and offers Find people. An offline friend is not listed as around.

**Invitations** are answered on the dashboard through the same calls as in Circle (`acceptFriend`, `parties.answerInvite`), from one pair of rows in `circle/AnswerRows.tsx` that Circle's People and Parties views also use.

**The island** is the only thing on a settled Home that moves, which is the one exception to §6's rule of no looping animation, made because the owner's brief asks for it. It is five CSS animations of `transform` or `opacity` (Reanimated's CSS engine: real `@keyframes` on the web, the UI thread on a device), a few pixels each, alternating so there is no seam. React renders nothing while it runs and no JavaScript runs between frames. `useDashboardLive` pauses it whenever Today is not the destination on screen, the account page or the Focus environment is over it, or the app is in the background; Home unmounts when another Space is chosen. With reduced motion or the Still intensity no animation is created. A stepped theme moves it one whole pixel per step. The motion plan is `spaces/world/dashboardMotion.ts`. **It shows the lobby's gate, because no island art exists yet** (the World itself is Phase 15): it reuses the World's baked plates and adds no bitmap.

`npm run desktop:frontend-check` checks the arrangement at seven viewports and five theme combinations, that no part is boxed, that the hub sits where the parts meet and over none of them, the island's animations and idle cost, and the answers. `SYLF_FRONTEND_CHECK_ONLY=home` runs only Home's part.
