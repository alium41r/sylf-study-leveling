# Expansion Part 5 report — a complete frontend experience

**Status: built and verified on this Mac against a disposable local backend, with screenshots. Not run on the tablet, not run against a hosted service, no real AI provider called.** 5 November 2026, on `expansion-part-3`. The owner's brief was to make Sylf Native feel complete: find what is missing, hidden, sample-only or cluttered by running both apps, and fix the ordinary things first.

## 1. How both apps were inspected

- **Sylf Web** ran from its development server (`next dev`) on a disposable PostgreSQL in Docker, signed in as a seeded student. I walked Home, Calendar, Objectives, Shop and Locker, and read the route and settings structure for the rest.
- **Sylf Native** ran as its production web export behind `scripts/dev/native-live-host.mjs`: a small Node host that is Electron's main process reduced to a server, using the same `createBackendProxy`, so the page holds no token and every screen reads the real backend. It was driven in the browser pane at desktop, tablet and phone widths, and in light and dark.
- Data came from `scripts/dev/seed-local.mjs` (four students, friends, subjects, goals, quests, an event, a conversation, a party invitation) and `scripts/dev/backfill-local.sh` (a month of study history, written straight into the disposable database because the API cannot backdate a session). Both refuse anything that is not this machine.

## 2. What changed, by area

| Area | Before | Now |
| --- | --- | --- |
| **Progress overview** | The thirty-day chart was **blank**: its bars had zero width (a layout bug), and the Today meter drew 120 hairlines | Real bar charts for the week (Monday to Sunday, with the target as a line) and the month; readable segmented meters; the **weekly focus quest** with its reset, streak and reward |
| **Stats** | Numbers and lists only | A daily bar chart for 7 or 30 days above the numbers |
| **Today** | A plan, a briefing and a button | A status line (level, XP, streak, Sylph), the weekly focus quest, a real **What's ahead** list from your quests, and Sylvie's note and insights |
| **Quests and goals** | Text rows with a "Details" label and no hierarchy | Quests with a subject colour stripe, XP, a **Study** action and the day; goals as cards with progress and **days left** |
| **Calendar** | Month and a Week grid that never showed quests; month arrows in Week | Month, Week, **Day** and Agenda; a quest lane in Week and Day; week and day navigation; **events typed in words** ("Lab tomorrow at 3pm") with the parsed time shown before saving; square hour lines |
| **Profiles** | None (a friend sheet with three buttons) | A **full profile** for anyone you see (Circle, Standing, search, party rooms): level, rank, title, bio, attributes, honours, and the actions the server allows. Privacy is the server's: hidden values are absent, never zero. HP is never read |
| **Circle** | A text list; a form-like conversation with your own name in its title | Avatar rows with presence; a **chat** with bubbles, day separators, tap-to-edit and delete, the other person in the title that opens their profile |
| **Sylvie** | A sheet with the latest turn | The sheet lists **earlier conversations** to pick up, shows the thread's history, and continues it; images, maths, proposals and confirmation as before |
| **Parties** | (Part 3 and 4) | Unchanged here, now openable from a profile |

## 3. Parity against Sylf Web

| Web feature | Native | Notes |
| --- | --- | --- |
| Dashboard: XP, level, focus time, quota, quests, study circle, streak quest | **Works** (Today, Progress, Circle) | HP is absent by decision (ADR 0017) |
| Timer: seven modes, breaks, environment, backgrounds | **Works** | Part 2 |
| Objectives: goals and quests | **Works, redesigned** | Bulk "select" is not built |
| Calendar: month, week, day, quick add, today pane | **Works** | Natural-language quick add reuses web's `lib/calendar/quick-add` |
| Calendar: notebooks and ink, shared calendars, Google/Microsoft/ICS connections | **Not built** | Notebooks are Phase 14. Connections and shared calendars are heavy server work, listed for a later part |
| Social: friends, search, messages, groups, parties, blocking, notifications | **Works** | Part 3, plus profiles and chat here |
| Public profile | **Works** | |
| Sylvie: chat, history, images, proposals | **Works** | `AiMemory` has no read API |
| AI Planner V2 | **Built, not verified live** | Needs the server flags and a provider (E-6) |
| Rankings (friends, everyone, four orders) | **Works** (Standing), rows open profiles | |
| Achievements, claim all, attributes, Codex | **Works** | |
| Settings: appearance, themes, privacy, notifications, profile, security, devices | **Works** (Account) | |
| Focus backgrounds, audio, calculator | **Works** | |
| Notes, PDFs, whiteboard, resource shelf | **Placeholders by design** | Phase 14. The tools say so plainly |
| Shop, Locker items, pixel avatar and artwork | **Not built** | They need the pixel avatar renderer (A-15) and belong to World (Phase 15). The seeded local database has no catalogue, so Web's Shop is empty there too |
| Skill nodes and subject constellations, compile, forge-apex | **Later** | A canvas and a paid AI call |
| Archive, badges, collection pages | **Covered** by Codex and Honours | |

## 4. Verification

| Check | Result |
| --- | --- |
| Native typecheck, whole-package ESLint, boundary audit (334 files), single-copy check | Clean |
| Native unit tests | **578 passed**, 1 skipped (43 files), including new tests for the meter units, day wording and cosmetics mapping |
| Real-server integration | **37 of 37**: the Part 3 and 4 suite plus four new tests for profiles (a friend's profile with server permissions and no HP, a stranger's, a blocked pair's restricted view) and the weekly focus quest |
| Electron backend check | 39 of 39 |
| **Live Electron stage** (real window, real server, second person through the API) | **All checks pass** (33 of 33), no console errors. New in this part: Today status and weekly quest, **real bars with width**, the week drawn Monday to Sunday, a quest with its Study action that lands on Focus with the quest chosen, an event typed in words that is previewed and saved, a friend's profile, a conversation read as a chat, Sylvie offering an earlier conversation |
| Phone (390), tablet (820) and light-mode captures of Today, Plan, Progress and Circle | Taken and read; no overflow or clipped text found |

Screenshots are in [`evidence/`](evidence/): `live-*.png` (the journey, including 12 to 18 for this part) and `part5-phone-*`, `part5-tablet-*`, `part5-light-*`.

## 5. Defects found and fixed

| Where | Defect | Fix |
| --- | --- | --- |
| Progress | Thirty-day chart rendered nothing (tooltip wrapper had no width) | Rebuilt as `Bars` |
| Meters | A minutes target drew one segment per minute (Today, Progress, Calendar day page) | `meterUnits` keeps it to about a dozen |
| Progress | "1 study days" | Pluralised |
| Quests | "Details" stood in for the title; no hierarchy; no way to start studying a quest | Redesigned |
| Calendar | Week showed no quests; arrows moved a month; hour grid drew rounded boxes | Quest lane, week and day navigation, square lines |
| Messages | Conversation titled with your own name; edit and delete always visible | Chat view |
| Boundary audit | Flagged a field called `document` as the DOM, which blocked any use of `lib/calendar/quick-add` | The audit understands property access and a local `document` binding. Real DOM use is still caught |
| QuickAsk | A duplicated `testID` attribute (compile error) that a mis-aimed check had hidden | Removed; the check script now always runs from `native/` |

## 6. Remaining limits, plainly

- **Phase 14:** Notes, PDFs, whiteboard ink, the resource shelf.
- **Phase 15 and the renderer decision:** Shop, Locker items, avatars and artwork.
- **Later:** skill nodes, calendar connections and shared calendars, notifications that wake the device.
- **Unverified:** the tablet (touch, Hermes, pickers), hosted services, the Planner V2 flow against a provider, TalkBack, and long-session battery.
- **Seed artefacts, not product defects:** the local student's XP bar and Sylvie's level answer disagree (the backfill set a column by hand); study history shows today's date for API-seeded sessions (the server cannot backdate).
