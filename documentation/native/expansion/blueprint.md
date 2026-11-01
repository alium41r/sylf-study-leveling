# Expansion blueprint — the student's Sylf, redesigned

**Part 1, 1 November 2026. Approved structure, designs for review.** The owner approved the Home navigation, the immersive Focus environment, and moving Calendar and Planner to Home after parity. Everything else here is Proposed. It is the design source for Parts 2 and 3. It is a direction with exact structure and states, not pixel specifications: each slice refines it on real screens.

Rules come from the [design guide](../design/README.md). Web is a reference for behavior only, and no web layout is reused here.

## 1. What the current screens taught

Read from the [Phase 13 journey captures](../reports/phase-13/evidence/journey/), by eye.

| Screen | Works | Falls short |
| --- | --- | --- |
| **Today** | The line through the day is the app's best idea. The greeting has real presence | Quests sit under the line and can't be ticked here. "Study this" floats far from its quest. **"Go to" repeats the Spaces switcher.** Only timed events get a primary action, and a student's day is mostly quests |
| **Focus** | The large clock feels like an instrument | A card inside a page, repeating the dock's 25:00. "Study session" says nothing. The clock comes before the choice that sets it. Length chips can't express a rhythm |
| **Workspace Planner, Calendar** | Honest and real | A list in a window. The month shows no marks for events, and its add form sits behind the Command Center (T-3) |
| **Progress** | Quiet, numbers from the server | Doesn't answer "am I studying enough?": no target. A single minute draws a full bar. A wall of Claim buttons is the loudest thing on the page |
| **Everywhere** | Air, type voices, the Marker | Pages share one template, so nothing feels special. The palette icon at top right is a development entry |

## 2. Design direction

**The idea: one line runs through Sylf.** Aloft has one point of light that says "this one, now". Today already places it on a line through the day. Extend that into the structure of the product, so a student's time is the material of the interface.

| Where | The line is | The Marker is |
| --- | --- | --- |
| Today | The day | What is next |
| Plan, Calendar | The week, as a time grid | Now |
| AI Planner | Six stages of a plan | The stage at work |
| Focus environment | The session's phases, along the bottom | This moment |
| A party | The same line, shared | One small Marker per person |
| Progress | Thirty days | Today |
| Onboarding | A short path | This step |

Students learn one reading of the app. It costs almost nothing to render and no other study app looks like it.

**Principles for every new surface.**

1. **One primary action per moment.** If a page has two emphasized buttons, one of them is wrong.
2. **Arrive already useful.** Every screen shows the next sensible thing without being configured.
3. **Add is one field.** Natural text first, detail on request. `lib/calendar/quick-add.ts` is pure and already parses it.
4. **Say what is true.** Refusals in the server's meaning, in plain words, with the way forward beside them.
5. **Depth by pushing, not by stacking.** A long flow is a pushed page. A sheet is for one decision.
6. **Reward is a quiet fact.** Earning shows as a changed number and one line. Nothing celebrates at the student.
7. **Hide nothing that matters while studying, and show nothing else.**

## 3. Navigation

Approved. Five destinations, plus Account at the rail's foot.

```
Today · Plan · Focus · Circle · Progress                    (rail, or bottom bar under 600 pt)
          │       │       │         └ Overview · Stats · Standing · Honours · Skills · Codex
          │       │       └ People · Messages · Parties
          │       └ Threshold, then the Focus environment above the Spaces
          └ Calendar · Quests · Plans
```

- **Order.** Plan goes second, because planning leads to studying.
- **Sub-views** use `Segmented`. They scroll in a compact window, and the choice is kept in the Home snapshot.
- **Deep links** reach any sub-view, so Today, Sylvie and the dock can land exactly.
- **Remove "Go to"** from Today. The Spaces switcher does that.
- **The palette icon** stays a development entry until Appearance moves to Account.

## 4. Today

**Moment:** I've just opened Sylf. What do I do?

```
Wide                                                     Compact
┌───────────────────────────────────────────────────┐    ┌──────────────────┐
│ Sunday 1 November               [dock]            │    │ Sun 1 Nov  [dock]│
│ Good morning.                                     │    │ Good morning.    │
│ One quest to finish, and 2 events ahead.          │    │ One quest, 2     │
│                                                   │    │ events ahead.    │
│ ┌─ NEXT ──────────────────────┐  Today's target   │    │ ┌─ NEXT ───────┐ │
│ │ ■ Optics past paper         │  ▮▮▮▮▮▯▯▯ 40/90   │    │ │■ Optics past │ │
│ │   Physics, 30 min           │                   │    │ │  [ Begin ]   │ │
│ │   [ Begin ]     Later       │  Sylvie           │    │ └──────────────┘ │
│ └─────────────────────────────┘  One line of      │    │ 40 of 90 min     │
│                                  briefing   Ask   │    │ ──── The day ──  │
│ ──── The day ─────────────────                    │    │ 06:53 ▫ Lab      │
│ 06:53 ▫ Lab seminar                               │    │ ☐ Optics         │
│ 23:00 ▫ Revision hour                             │    │ ☐ Mechanics      │
│ Unscheduled  ☐ Mechanics  ☐ Vocabulary            │    │                  │
└───────────────────────────────────────────────────┘    └──────────────────┘
```

- **Next** is one card: the most sensible thing now, chosen by a pure function from events and quests, never inventing a time. **Begin** goes straight into the Focus environment with the plan filled in.
- **Quests join the day.** They stay untimed in an "Unscheduled" lane on the line (G-3, confirmed by Part 1: quests have no time or order field beyond `createdAt`).
- **A tick works here,** through the server (needed for parity).
- **Today's target** comes from `dailyGoalMinutes` and `detailed-stats`. On a rest day it says so and asks nothing.
- **States.** Empty: one clear prompt to Plan. Offline: last copy, with a note. Failed: says why and retries. A session running: Next becomes "Back to your session".
- **Keyboard.** `Enter` on Next begins. **Screen reader:** Next is read first, then the day in order.

## 5. Plan

**Moment:** I want to see what's ahead and shape it.

### Calendar

```
Wide: the Almanac                                         Compact: agenda first
┌──────────────────────────────┬──────────────────────┐   ┌────────────────┐
│ Calendar · Quests · Plans    │ Tuesday 3 November   │   │ Cal·Quests·Plans│
│ ‹ November 2026 ›  M  W  D   │ 40 of 90 min studied │   │ ‹ Nov 2026 ›   │
│                              │                      │   │ M T W T F S S  │
│  M  T  W  T  F  S  S         │ ▫ 09:00 Lab seminar  │   │ strip of weeks │
│  ·  ·  ▪  ·  ·  ─  ·         │ ☐ Optics past paper  │   │ ────────────── │
│  ·  ■  ·  ▪  ·  ─  ·         │ ◆ Mock exam deadline │   │ Tue 3          │
│  density dots, rest as dash  │                      │   │ ▫ 09:00 Lab    │
│                              │ ┌──────────────────┐ │   │ ☐ Optics       │
│                              │ │ Add to Tuesday…  │ │   │ [Add…]         │
└──────────────────────────────┴──┴──────────────────┴─┘   └────────────────┘
```

- **One add field** on the day page: "Lab at 3pm", through `quick-add.ts`, with quest or event chosen by a toggle. The editor opens only for more.
- **Month** shows density and rest days, not event text. Text belongs to the day page, so the month stays calm.
- **Week and Day** are a `TimeGrid`, a tablet's natural calendar. A long press creates, and a drag moves or resizes on 15-minute steps, with keyboard alternatives.
- **Study history** comes from `calendar/month`, read only for Month. Events come from `calendar/personal`.
- **A rest day** explains itself. Adding a quest there offers "Move to Monday" or "Change rest days", answering the server's refusal in place.
- **Conflicts** use the server's revisions: a stale save keeps the draft and offers the latest.

### Quests and goals

- Grouped by goal, each goal a thread with its own progress. Quests with no goal form "On their own".
- A subject is a colored mark, and subjects are managed here.
- Difficulty, deadline and scope are shown only while editing.
- **A planned quest says it belongs to a plan,** and offers what the guards allow. Refused edits explain why.
- Goal deadlines appear on the calendar.

### Plans

See [§6](#6-ai-planner-v2). With V2 off, a real sentence says plans aren't available yet, and saved ones stay readable.

**Five states everywhere.** Loading keeps the structure. Empty teaches by one action. Offline: reads show the last copy, and writes are refused plainly.

## 6. AI Planner V2

**Moment:** Exams are coming. Help me build something real, and let me trust it.

The flow is long and sometimes takes hours, so its design goal is **calm trust**. Each step is a pushed page inside Plans, on the plan's own line.

```
Details ── Materials ── Ask ── Research ── Strategy ── Translation ── Schedule ── Review ── Ready ── Confirm
                               └───────── six server stages, faithful, never on a timer ─────────┘
```

| Step | Design |
| --- | --- |
| **Details** | A brief written like a sentence: "I'm preparing for *A-Level Physics* by *14 June*." Topics and availability below, prefilled from subjects and rest days. Saved as they type, and it says saving is free |
| **Materials** | Add a PDF or text, up to 3 MiB each. Explicit permission for research, in plain words |
| **Ask** | What will happen, roughly how long, and the spending ceiling. One button: **Build my plan** |
| **Watching** | The line, with the Marker on the real stage. One sentence of what is happening. Expandable detail for the curious. **"You can leave. This keeps going."** Stop is always there |
| **A question** | One card at a time, from the exact retained questions. The plan waits, and says so |
| **Reading** | The strategy as a document, in Voice type, on `DocumentSurface`. Research notes and review findings are margins beside it, or sections below in compact |
| **Confirm** | Exact changes as a list grouped by week: added, moved, removed. Required acknowledgements as plain checkboxes. **Confirm** is at the end, separate, and impossible to reach by accident |
| **After** | Quests land in Today and Plan. A line says how many, and where |

**Stops are designed, not errors.** Cancelled, out of budget, stale calendar, expired continuation and worker unavailable each get their own sentence and next step. A lost acknowledgement offers **Retry same action**, never a new request.

**Never:** a percentage, a fake typing effect, a score that sounds like approval, or a retry that spends money without asking.

## 7. Focus

### The Threshold (Home's Focus)

**Moment:** I'm about to study. In one glance: what, how, where.

```
┌───────────────────────────────────────────────────┐
│ What    Optics past paper · Physics        change │
│ Rhythm  Pomodoro                                  │
│         ▮▮▮▮▮ ▯ ▮▮▮▮▮ ▯ ▮▮▮▮▮ ▯ ▮▮▮▮▮ ▯▯▯        │
│         25 min focus, 5 min break, four rounds    │
│ Where   [Classic] [Dusk library] [Rain window] …  │
│                                                   │
│                  [ Enter ]                        │
│ ──── Recent ───────────────────────────────────── │
└───────────────────────────────────────────────────┘
```

- **The rhythm is drawn,** not described, so all seven modes are understood without a settings page: Free Flow, Pomodoro, 52/17, Animedoro, Deep Work, Sprint, Flowtime. Each draws its own pattern, and tuning opens in a sheet.
- **The clock leaves this page.** It belongs to the session.
- **Sessions on this device and on the server** keep their honest separation.

### The Focus environment

**Moment:** I'm studying. Nothing else exists.

```
┌───────────────────────────────────────────────────┐
│                                                   │
│                  Optics past paper                │
│                                                   │
│                     24:12                         │
│                                                   │
│                                                   │
│  ━━━━━━━■━━━━ ┄ ━━━━━━━━━━ ┄ ━━━━━━━━━━ ┄ ━━━━━  │
└───────────────────────────────────────────────────┘
```

- **Full window, above the Spaces,** with no dock and no Spaces icon.
- **The phase line** runs along the bottom, with the Marker at this moment.
- **Controls appear on touch or pointer movement,** and fade after four seconds: Pause, End, Sound, Sylvie, Leave.
- **Leave is not End.** Leaving returns to where the student was, with the dock showing the session. **End** still asks.
- **Breaks change the air, not the layout.** The ground lightens, and the words change to "Break, 5 minutes". The timer never shouts.
- **Eye comfort** dims without touching system settings.
- **Backgrounds** come from `focus-backgrounds`, with a solved scrim so text meets contrast, on any image, in any theme. Timer position honours a background's `timerPosition` and focal point.
- **The end** is a short, truthful summary. "Saved to your record" appears only once the server accepts, in the same words as today.
- **Every exit** releases the background and wake lock.
- **Keyboard.** Space pauses, `Escape` leaves. **Screen reader:** time is announced on request and at phase changes, never every second.

## 8. Progress

**Moment:** Am I doing enough? How does this all work?

| View | Answers | Design |
| --- | --- | --- |
| **Overview** | Am I on track? | Today against target, this week against the weekly milestone, 30-day heat strip with the Marker on today. Level and HP as one quiet line. **Bars scale to the target, not the longest day,** so one minute looks like one minute |
| **Stats** | Where does my time go? | Subjects, rhythm by time of day, recent sessions, 7 and 30 days |
| **Standing** | How do I compare? | You in context, two above and two below, then the top. Global or friends. Four orderings. Hidden stays hidden. Shown in Part 2 only after privacy is reviewed |
| **Honours** | What have I earned? | A shelf by category. Ready items gather into one **Claim all** row, which fixes the double tap. Locked ones say how |
| **Skills** | How is my ability growing? | Attributes first, with investing. Subject constellations follow if slice D proves them useful |
| **Codex** | How does Sylf work? | A real book: chapters, Voice type, search, cross-links, locks from the catalog. Reachable from any "what's this?" |

**Level-up** is one line under the session summary, and the number changes. Nothing covers the screen.

## 9. Circle

**Moment:** Who's here, and can we study together?

```
Wide: Messages                                  People
┌───────────────┬───────────────────────────┐   The ring stays: friends around one
│ Aisha      2m │ Aisha · studying, 40 min  │   circle, the number studying in the
│ Physics group │                           │   middle. Hidden reads as hidden.
│ Bilal         │ Did you finish the paper? │   Requests sit at the top. Find
│               │        Nearly. Join me?   │   people is one field.
│               │ [ Study together ]        │
│               │ ┌───────────────────────┐ │   Parties
│               │ │ Message…              │ │   One room, four seats, from the
└───────────────┴─┴───────────────────────┴─┘   server. Enter joins the line.
```

- **Conversation is the home of social.** "Study together" sits inside it, so an invitation happens where friends already are.
- **Messages use alignment and air, not colored bubbles,** with accent spent only on what is unread.
- **Compact** pushes the thread over the list. Android Back returns.
- **A party room is the Focus environment with people in it:** one Marker per member on the shared line, no chat wall. Words go in the conversation, afterwards.
- **Invitations never interrupt focus.** They wait for a break or the end.
- **States:** blocked, not accepting messages, left group, and offline drafts all have plain words.

## 10. Sylvie

**One presence, not two features.** The assistant and the companion are the same character.

| Where | How she appears |
| --- | --- |
| Today | One line of briefing and **Ask**, with her small mark |
| Quick-ask | A sheet tucked to wherever it came from. `Alt+/` on desktop. Same thread, same runtime |
| Workspace | The full tool, unchanged in role |
| Focus environment | Only behind the Sylvie control, with a bounded subject hint |
| After a session | One optional line, only if she has something real to say |

- **A proposal is a card:** exactly what will change, **Confirm** and **Not now**. Stale ones say so. Nothing changes silently.
- **Thinking** shows honest status from the server's events. Text appears as it arrives once streaming is proved, and until then a calm indicator stands in (T-6).
- **Rich text** covers headings, lists, code, links and tables. **Maths must work,** because web renders KaTeX and students rely on it.
- **The companion** is small, drawn from existing pixel art, and still most of the time. A prerendered sprite costs nothing to keep. She never moves during focus.

## 11. Account

**One long page with an index beside it, not a settings tree.** Reached from the rail's foot.

| Section | Holds |
| --- | --- |
| **You** | Avatar, name, username, bio, frame, title, aura, name color, links, beside a live "What others see" |
| **Study** | Daily target, rest days, modes, subjects |
| **Appearance** | Theme Studio, out from behind `DEV_TOOLS`. Mode, accent, ground, per the account |
| **Privacy** | Each setting with who sees what, in a sentence |
| **Notifications** | Grouped, with device permission beside them |
| **Security** | Password, devices with this one marked, sign out everywhere, connected accounts |
| **Leaving** | Reset progress, delete account. Two steps, plain consequences, at the very end |

Buying stays in World. No control appears for anything that is a stub (`2fa`, provider `link`).

## 12. Onboarding

**The smallest flow that gives a useful first day.** Three steps on a short line, after a first sign-up.

1. **What are you studying?** Type subjects, with suggestions. The server needs a `code`, so it is derived. Board and level come only if the student opens them, because web's defaults (CAIE, A-Level) would otherwise be silently wrong.
2. **What's a good day?** Daily target and rest days, with sensible defaults shown. **HP is explained here in one sentence,** because it is on by default.
3. **Start.** Begin a first 25 minutes, or go to Plan.

Everything is skippable, and skipping still records completion through `POST /api/user/onboarding`, so web never asks again. Appearance waits for Account. Study Without an Account stays as it is.

## 13. Workspace

No visual change beyond eight tools in the Command Center. The freed slots tighten it. Alt shortcuts follow tool order, and the Workspace guide lists them. The Timer tool's plan picker offers today's quests.

## 14. New components

Add to `@sylf/design-system` or `spaces/home/` only when two surfaces need them. Each needs Showcase and Design check coverage, in all six themes.

| Component | Used by | Note |
| --- | --- | --- |
| `TimeLine` | Today, AI Planner, onboarding | Extracted from `DayRow` |
| `PhaseLine` | Focus environment, Threshold, parties | Rendered from a mode's pure phases. No SVG at full width |
| `SubNav` | Plan, Circle, Progress | `Segmented` plus snapshot state |
| `PushedPage` | Plan, Circle, Account | Back, Escape and Android Back through `useDismiss` |
| `CalendarMonth`, `TimeGrid`, `DayPage` | Plan | Plain views and one gesture layer. Off-screen weeks unmount |
| `QuickAddField` | Plan, Today | Parses as it is typed |
| `DateField`, `TimeField`, `Stepper` | Editors, schedule | Native pickers where they serve better |
| `HeatStrip`, `BarChart` | Progress | Plain views, as the week chart is |
| `MessageRow`, `Composer` | Circle, Sylvie | With `useKeyboardLift` |
| `ProposalCard`, `ChangeRow` | Sylvie, AI Planner | The one pattern for confirming a change |
| `RichText` | Sylvie, AI Planner, Codex | One renderer. Output is untrusted |
| `Sprite` | Companion, avatars | Prerendered |
| `RemoteImage` | Profiles, backgrounds | Approved hosts only, sized to display, released when unseen |

## 15. Motion

Everything uses the existing motion system.

| Moment | Motion |
| --- | --- |
| Enter the environment | The clock's place grows to fill the window, then the page falls away. Reduced motion is a fade |
| Phase change | The Marker crosses to the next segment. The ground shifts over a second |
| Sub-view | The Marker travels under `Segmented`, and the old view goes at once |
| Push | A short horizontal slide that remembers its origin |
| Claim | The row settles, and the number changes. Nothing bounces |

Nothing loops in a settled view, because `uiautomator` and battery both need that.

## 16. Quality bar

A surface is done when it:

1. Answers its moment in one glance.
2. Has one primary action.
3. Works at 340 pt and on a landscape tablet, with large text.
4. Has all five states, written for a person.
5. Reads correctly in all six themes, light and dark, and with custom colors.
6. Holds its place across Space changes and a process kill.
7. Uses the keyboard and a screen reader properly.
8. Could not be mistaken for a website or a template.
