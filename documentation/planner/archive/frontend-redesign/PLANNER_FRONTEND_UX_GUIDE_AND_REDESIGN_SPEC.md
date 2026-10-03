# PLANNER FRONTEND UX GUIDE AND REDESIGN SPEC

**Audit + content design only. No code was changed.**

This document translates the *existing, completed* Planner backend into a user-experience
specification for a frontend redesign. Every statement about behaviour below is taken from the
current implementation — cited by file — not from intent or aspiration. Where the backend cannot do
something, this document says so rather than designing a UI that would lie.

Read alongside: `lib/planner/intake/readiness.ts`, `lib/planner/intake/to-input.ts`,
`lib/planner/intake/findings.ts`, `lib/planner/copilot/contracts.ts`,
`lib/planner/copilot/outcomes.ts`, `lib/planner/copilot/map.ts`, `lib/planner/copilot/run.ts`,
`lib/planner/constraints.ts`, `lib/planner/capacity.ts`, `lib/planner/contracts.ts`.

---

## 1. CURRENT QUICK PLAN UX DIAGNOSIS

### What exists today

`app/components/planner/quick-plan/QuickPlan.tsx` renders **one long scrolling page** containing, in
DOM order:

| # | Element | Component |
| --- | --- | --- |
| 1 | Eyebrow, mode heading, lede | inline |
| 2 | Session/Copilot notice banners (conditional) | inline |
| 3 | **Goal** input | inline |
| 4 | **Subject** input (marked optional) | inline |
| 5 | **Date** input | inline |
| 6 | EITHER scope review + source panel, OR "what Sylf found" + the five-way scope-source control + manual scope textarea | `ScopeReview`, `SourcePanel`, `ScopeEditor` |
| 7 | **Exam board or system** + **Academic level** (both optional) | inline |
| 8 | **Weekly time** presets + custom + "use my normal schedule" + weekday preview | `WeeklyBudgetControl` |
| 9 | **Background curriculum** disclosure | `BackgroundCurriculumControl` |
| 10 | Overlap review (conditional on a comparison existing) | `OverlapReview` |
| 11 | **Copilot** — as a `<details>` inside the page | `PlannerCopilot` |
| 12 | **Preparedness matrix** | `PreparednessMatrix` |
| 13 | **Customize days** disclosure | `AvailabilityControl` |
| 14 | One Smart Setup question (conditional) | inline |
| 15 | **"Your plan brief"** — an 11-row always-open `<details>` | `PlanBriefPanel` |
| 16 | Generation panel: readiness, warnings, generate, review, confirm | `GenerationPanel` |
| 17 | "Prefer the detailed setup?" link to Advanced | inline |

### The diagnosis

**Seventeen stacked elements, of which four are essential.** The student's real task is four
facts; the page presents roughly twenty controls and two disclosures around them. The measured
consequences:

1. **No visible order.** A student cannot tell that Goal → Scope → Time are the path and everything
   else is optional. The essential inputs at #3–#5 and #8 are separated by the most complex
   control on the page (#6).
2. **The scope step is the hardest and the least explained.** Five mutually-overlapping actions
   ("Find syllabus", "Upload a syllabus", "Paste an outline", "Use only what I give you", plus the
   always-present manual textarea) are presented as peer buttons in one fieldset, with no statement
   of what happens after each or whether they are alternatives.
3. **Repetition between the brief and the controls.** `PlanBriefPanel` restates Goal, Subject,
   Date, Scope, Weekly time, Availability, Preparedness, Exclusions, Reserve, Readiness and Open
   questions — all of which are already visible in the controls immediately above it. It is
   `<details open>`, so it is not even collapsed.
4. **Two disclosures that both look optional but differ in kind.** "Add your background curriculum"
   changes what Sylf can *verify*; "Customize days" only re-spreads time that is already
   distributed. They read identically.
5. **The Copilot is buried and mislabelled.** It is a `<details>` at position #11 whose summary
   reads *"Ask Sylf to change something — or ask why the plan looks the way it does"*. It is below
   the fold, competes with the page for width, and its label suggests an optional aside rather than
   the fastest path to most changes.
6. **Generate sits below everything.** Reaching the primary action means scrolling past the brief
   and through the preparedness matrix.

### The good news — the backend is already progressive

The backend does **not** need more input than the page already collects, and it explicitly
tolerates less. `briefReadiness` (`readiness.ts`) requires exactly four things, and
`refinementCodes` treats *every* other field as an offer:

```
"Optional refinement is not a deficiency. A brief that can generate is reported as
ADVANCED_REFINEMENT_AVAILABLE when optional detail exists, with canGenerate: true."
```

So the redesign is a **presentation** problem, not a capability problem. That is the single most
important finding of this audit.

---

## 2. CURRENT FIELD SEMANTICS

Each control, what it actually does, and what the server does without it.

### Goal / "Exam or goal" / "Course or goal" / "Unit or chapter"

- **Action**: `setGoal` → `brief.goal.title` (max 200 chars).
- **Required**: **Yes** — `GOAL_MISSING` blocks. Readiness state becomes `RESEARCH_AVAILABLE` when
  research could fill the scope, otherwise `NEEDS_CORE_INFO`.
- **What it becomes**: the plan's `title`, and — when Subject is blank — the `subjectName` in every
  mode (`to-input.ts`: `brief.subject.name?.trim() || brief.goal.title.trim()`). In **Mastery** it
  *is* `unitTitle` and `focus`. In **Roadmap** it is the roadmap's name.
- **If absent**: nothing generates; the button is disabled with "What you are preparing for" listed.

### Subject (optional)

- **Action**: `setSubject`.
- **Required**: **No.**
- **What it does**: names the subject for the engine. If blank, the goal title is used instead.
- **Note**: the input is free text; `subjectId` is only populated for a Sylf-managed Subject. A
  typed subject is `FREE_TEXT`.
- **If absent**: entirely harmless. Plans are generated with the goal title as the subject.

### Date ("Exam date" / "Finish by")

- **Action**: `setTargetDate`. In EXAM, Quick Plan sets **`endDate` and `examDate` to the same
  value** (`QuickPlan.tsx`), because the adapter refuses a mismatch (`EXAM_DATE_MISMATCH`).
- **Required**: **Yes** — `TARGET_DATE_MISSING`. Also, in EXAM, an `endDate` with no `examDate`
  raises the same code.
- **Bounds**: horizon maximum **365 days** (`LIMITS.horizonDays`). Advanced Setup's own validation
  says "Choose a future exam date within 365 days."
- **If absent**: the generate button stays disabled.

### Scope — the manual textarea ("What do you need to cover?")

- **Action**: `updateScopeUnits` (add/remove/rename), one unit per line.
- **Required**: **Yes, but the *source* is free.** `SCOPE_MISSING` blocks when there are no units;
  `SCOPE_UNCONFIRMED` blocks when units exist only as an unconfirmed candidate.
- **If absent**: generation is blocked — *unless* research or import produced a candidate the
  student can confirm.
- **Behaviour worth knowing**: the field reconciles on **blur, not per keystroke**; a unit that was
  not renamed keeps its identity, so the student's preparedness survives an edit; a large list is
  *grouped* rather than truncated and the UI says so.

### Scope — the five scope-source actions

Covered in full in §7. In brief: `Find syllabus` triggers research; `Upload a syllabus` accepts
PDF/PNG/JPEG/WebP; `Paste an outline` opens a textarea; `Use only what I give you` sets
`researchPolicy = "OFF"`; and the manual textarea is always available.

### Exam board or system, and Academic level (both optional)

- **Action**: `setBackground` → `brief.backgroundCurriculum.{board, level, label}`.
- **Required**: **No**, but with a real consequence. `QuickPlan.tsx` states it plainly: *"Used to
  find an official syllabus. Without it Sylf will not claim a source is official."*
- **What it does**: (a) it is what the research engine's authority registry uses to decide whether a
  host belongs to the exam board — without it the same page is graded `SECONDARY`, no claim can
  cover an objective, and the run honestly reports `WEAK`; (b) in **Roadmap** it becomes
  `qualification` (`level · board`).
- **If absent**: research still runs and still returns a scope, but it cannot classify anything as
  official. This is the single highest-value optional field in the product.

### Weekly time ("How much time can you give this each week?")

- **Action**: `setWeeklyBudget`. Presets 3h / 5h / 8h / 10h / 15h, or Custom (0.5–168 h), or "Use my
  normal Sylf schedule" which stores **null** and lets the server supply the figure the account's
  own schedule implies.
- **Required**: **Yes** — `CAPACITY_MISSING`. Satisfied by *any* of: a weekly figure, a positive
  daily override, or an account schedule that implies one.
- **What it is**: a **target for this plan**, and explicitly *"never a hard cap"*. The engine's own
  hard limits still apply.
- **Consequence**: 0 renders as "`No study time is placed yet.`" if nothing distributes.

### Availability / Customize days

- **Action**: `setDailyOverrides`, `markUnavailableDay`.
- **Required**: **No.** A refinement code `DAILY_AVAILABILITY` appears when it is unset, and nothing
  blocks.
- **What it does**: pins per-weekday minutes, marks weekdays as "Days you cannot study at all"
  (creating a HARD `UNAVAILABLE_WEEKDAY` constraint), and excludes specific dates.

### Background curriculum

- **Action**: `setBackground`. Fields: qualification label, subjects, board, level.
- **Required**: **No.** Refinement code `BACKGROUND_CURRICULUM`.
- **What it does**: enables **curriculum comparison** — which topics the student has met *on paper*.
  It never says anything about how well they know them, and never writes preparedness.
- **If absent**: the comparison cannot run; the plan is generated without overlap information.
  Nothing is blocked.

### Preparedness matrix

- **Action**: `setPreparednessState`, `setDifficult`, `setPriority`, `clearPreparedness`.
- **Required**: **No.** Refinement code `PREPAREDNESS` while `brief.preparedness.length < units`.
- **States**: `Not rated` / `Not studied` / `Studied, not rated` / `Weak` / `Okay` / `Strong`, plus
  per-unit difficulty and priority (Neutral/Low/High).
- **If absent**: `PlanBriefPanel` says exactly what happens — *"Not stated — Sylf will plan as work
  that may need learning."* The adapter maps unstated to `covered: null, confidence: null,
  difficult: null`, which the planner reads as *unstated*, never as "not covered" or "very weak".

### Recovery reserve

- **Required**: **No.** Refinement code `RESERVE`; defaults per mode (EXAM/ROADMAP/MASTERY each have
  their own). Bounded 0–50%.

### Smart Setup question

- **Required**: **No.** The UI says *"Skipping changes nothing: Sylf keeps its own default for
  this."* At most one question is shown, drawn from a closed set of four reason codes
  (`PRIORITY_UNCLEAR`, `AVAILABILITY_PATTERN_UNCLEAR`, `CONSTRAINT_STRENGTH_UNCLEAR`,
  `SCOPE_SIZE_UNCLEAR`).

### The Plan Brief panel

- Read-only display of server-held state with "Edit" buttons that move focus to the owning control.
  Eleven rows, open by default. **Diagnosis: this is the page's largest redundancy** (§16).

### Advanced Setup

- A separate surface (`ExamPlanner` / `RoadmapPlanner` / `MasteryPlanner`), reached by a toggle in
  the workspace toolbar. Six numbered steps + a saved-plans step. Audited in §8.

---

## 3. ESSENTIAL vs OPTIONAL vs ADVANCED MATRIX

### ESSENTIAL — without these, nothing generates

| Control | Blocking code | Notes |
| --- | --- | --- |
| Goal | `GOAL_MISSING` | Mode-specific label |
| Scope (any source, confirmed) | `SCOPE_MISSING` / `SCOPE_UNCONFIRMED` | Research, upload, paste or typing |
| Date | `TARGET_DATE_MISSING` | In EXAM, end date **and** exam date |
| Weekly time | `CAPACITY_MISSING` | A figure, a daily override, or the account schedule |

That is the complete list. `MODE_MINIMUM` in `readiness.ts` is **identical for all three modes**.

### CONTEXTUAL — strongly recommended, changes quality, never blocks

| Control | Why it matters | Leave blank when |
| --- | --- | --- |
| **Exam board / system + level** | The *only* input that lets Sylf call a source official. Also becomes the Roadmap's `qualification`. | The target genuinely has no board (some university courses, self-study) |
| **Subject** | Names the subject; falls back to the goal title | The goal already names it clearly ("CAIE A Level Biology 9702" needs no subject) |
| **Background curriculum** | Enables the curriculum comparison — what the student has met on paper | The student is starting from nothing, or has no prior qualification to compare |
| **Preparedness** | Tells Sylf what to teach versus what to rehearse | The student wants Sylf to assume nothing (the documented default) |

### ADVANCED — real capability, correct to keep out of the default path

| Control | Where it belongs |
| --- | --- |
| Per-weekday minutes and excluded dates | "Customize days" disclosure, or Advanced |
| Recovery reserve percentage | Advanced |
| Hard constraints (`MAX_SESSION_MINUTES`, `UNAVAILABLE_WEEKDAY`, `MAX_WEEKLY_MINUTES`) | Advanced, plus the Copilot |
| Soft preferences (8 kinds: even spread, fewer dates, weekly workload, earlier workload, balanced periods, unit order, fewer switches, session length) | Advanced, plus the Copilot |
| Plan-item editing, release, rebalance | Review/confirmed stages only |

### REMOVE FROM DEFAULT VIEW

| Element | Recommendation |
| --- | --- |
| 11-row always-open "Your plan brief" | Replace with the compact summary in §16 |
| Readiness as a *field* in a list | Fold into the generate panel's own sentence (already there) |
| "Open questions: N optional questions" | Delete — it is a count of a count |
| "Recovery reserve: Mode default" | Delete from the summary; show only when explicitly set |
| Both disclosures stacked at the same visual weight | Differentiate (§5) or move "Customize days" to Advanced |
| The manual scope textarea shown simultaneously with a reviewable candidate | Show one or the other (§7) |

---

## 4. EXAM PLANNER USER GUIDE

### Headline

**Exam Planner** — badge *Day-by-Day Sprint*

> *"Deadline-driven preparation for one exam, planned day by day."* (existing chooser copy)

### One-sentence explanation for the student

> Tell Sylf which exam, what it covers, and when it is. Sylf builds a day-by-day plan that works
> through learning, recall, practice, and exam readiness — and it can look up the syllabus for you.

### What is essential

1. **Exam or goal** — e.g. "Biology mock exam"
2. **Exam date** — the deadline that drives everything
3. **What you need to cover** — researched, uploaded, pasted, or typed
4. **Time per week**

### What is optional

- Subject (falls back to the goal title)
- **Exam board or system** and **level** — *the highest-value optional field*: it is what makes an
  official syllabus recognisable
- Background curriculum (enables the comparison)
- Preparedness per topic
- Weekly availability detail, reserve, constraints

### What the backend derives without being asked

From `to-input.ts`, all of these are filled by the adapter and are **not** asked in Quick Plan:

| Field | Value when unstated |
| --- | --- |
| `exam.format` | `UNSPECIFIED` |
| `exam.approach` | `STANDARD` (the alternative, `TRIAGE`, is Advanced/Copilot only) |
| `exam.preferredMinutes` | **45** minutes, unless a `SESSION_LENGTH_PREFERENCE` constraint exists |
| `exam.mockMinutes` | `null` |
| `exam.allowExamDayStudy` | `false` |
| `recoveryPercent` | The EXAM mode default |

### Scope behaviour

Research tries to find the board's own specification. With a board and level set, an official
document is classified `OFFICIAL`/`OFFICIAL_PDF` and its wording can *cover* an objective; without
them the same page is `SECONDARY`, nothing can be covered, and the run reports honestly that it is
weak. Typing topics, uploading a PDF, or pasting a contents page all work equally well and all
produce a candidate the student confirms.

### Expected output

A day-by-day set of sessions across four stages — COVERAGE, CONSOLIDATION, PRACTICE,
EXAM_READINESS (`EXAM_STAGE_INTENTS` in `exam-policy.ts`) — with intentions such as LEARN, RECALL,
REVIEW, PRACTICE, TIMED_PRACTICE, MISTAKE_REVIEW, MOCK_EXAM and FINAL_REVIEW. Each session has a
date and a length of 15–120 minutes (Advanced can set the ceiling; the engine's hard item bound is
15–240).

### Best example

| Field | Value |
| --- | --- |
| Goal | `CAIE A Level Mathematics 9709` |
| Exam date | `2027-05-12` |
| Scope | **Find syllabus** |
| Board / level | `CAIE` / `A-Level` |
| Weekly time | 8h |
| Optional | Background curriculum "CAIE A-Level, Mathematics" |

### Common mistake

> Typing every topic by hand *and* pressing Find syllabus, then wondering which one Sylf used.
> Only one scope survives: the candidate replaces nothing until confirmed, and confirming it
> replaces the typed list. Do one, or do research first and edit the result afterwards.

---

## 5. ROADMAP USER GUIDE

### Headline

**Course / Syllabus Roadmap** — badge *Long-Horizon Pacing*

> *"Strategic long-term planning across months of material and milestones."*

### One-sentence explanation

> Give Sylf a whole course or qualification and the date you want to finish, and it lays out months
> of work as periods with milestones you can check off.

### What is essential

1. **Course or goal** — e.g. "A-level Chemistry, full syllabus"
2. **Finish by**
3. **Scope**
4. **Weekly time**

### What is optional

- Subject, background curriculum, preparedness
- Board and level — here they do double duty: they become the roadmap's **`qualification`** string
  (`level · board`) *and* they make official sources recognisable

### What the backend derives without being asked

| Field | Value when unstated |
| --- | --- |
| `roadmap.qualification` | `level · board` from the background curriculum, or `null` |
| `roadmap.granularity` | **`MONTH` if the horizon exceeds 70 days, otherwise `WEEK`** (`ADAPTER_DEFAULTS.monthGranularityAfterDays`) |
| `recoveryPercent` | Roadmap default (**15%**, `ROADMAP_RESERVE`) |

Granularity is the one derived value a student will notice, and it is not asked anywhere: a
three-month roadmap is planned in months because that is what the horizon implies. **The redesigned
UI should state it rather than let it surprise them** — see §21 copy.

### Scope behaviour

A whole syllabus is expected, so the scope will usually be large. Roadmap has its own bounded
envelope (`ROADMAP_LIMITS`, including its own input byte budget and topic/milestone/period caps)
and is the mode where **segmentation** is most likely: when the scope is larger than one plan can
hold, Sylf plans it in segments, reports `FEASIBILITY_SEGMENT_REQUIRED` as an advisory, and says so
in the plan brief ("planned in N segments").

### Expected output

Periods (monthly or weekly) each holding milestones with an outcome, plus the sessions that reach
them. Milestone outcomes are bounded 12–240 characters; a roadmap may carry up to 52 milestones and
52 periods.

### Best example

| Field | Value |
| --- | --- |
| Goal | `Complete CAIE A-Level Chemistry` |
| Finish by | `2027-06-30` |
| Scope | **Find syllabus**, then trim what you don't need |
| Board / level | `CAIE` / `A-Level` |
| Weekly time | 10h |
| Optional | Background "IGCSE, Chemistry" → comparison marks what's already met |

### Common mistake

> A finish date two weeks away for a two-year syllabus. Nothing is blocked — the engine will plan
> what fits and warn — but every session becomes dense and the plan is unpleasant. Sylf's job is to
> warn; the student's is to decide.

---

## 6. MASTERY USER GUIDE

### Headline

**Chapter / Unit Mastery** — badge *Deep Progression*

> *"One unit taken through understand, recall, practise, review, then a check."*

### One-sentence explanation

> Pick one chapter or unit you want to actually master, and Sylf takes it through understanding it,
> recalling it, practising it, reviewing it, and one check at the end.

### What is essential

1. **Unit or chapter** — e.g. "Photosynthesis". **This is also the plan's `unitTitle` and `focus`.**
2. **Finish by**
3. **Scope** — the topics inside the unit
4. **Weekly time**

### What is optional

- Subject, background curriculum, preparedness
- Board and level (still useful for official sources)

### What the backend derives without being asked

| Field | Value when unstated |
| --- | --- |
| `mastery.unitTitle`, `focus` | **The goal title itself** |
| `mastery.desiredDepth` | `SOLID` (alternatives `ORIENTATION`, `DEEP` are Advanced/Copilot only) |
| `mastery.priorExposure` | `NEW` (alternatives `SOME`, `MOSTLY`) |
| `mastery.checkPreference` | `MIXED_PRACTICE` |
| `mastery.targetDate` | The brief's end date |

**This is the mode with the largest gap between what is asked and what the engine accepts.**
Depth, prior exposure and check preference all meaningfully change the plan and none are asked in
Quick Plan. `priorExposure: NEW` is a conservative default that assumes the student is starting
fresh — honest, but a student who has already studied the unit gets a plan built for a beginner.

### Scope behaviour

Scope is the *topics inside the one unit*, not the unit itself. This is the mode where a short,
specific list is best: five to fifteen topics. Research still works, but for a single chapter the
manual list is often faster and more accurate than a search.

### Expected output

A staged progression through the unit's phases, with recall, practice and review sessions, ending in
one check. Mastery has the smallest scope and the tightest cadence of the three modes.

### Best example

| Field | Value |
| --- | --- |
| Goal | `Master Integration` |
| Finish by | `2027-03-01` |
| Scope | typed: `Substitution`, `By parts`, `Partial fractions`, `Trigonometric integrals`, `Definite integrals` |
| Weekly time | 5h |
| Optional | Preparedness: mark `Substitution` as *Okay*, everything else *Not studied* |

### Common mistake

> Putting the whole subject in the unit field. "Mathematics" as a Mastery unit produces a mastery
> plan for an entire subject, which is what Roadmap is for. The field wants one chapter.

---

## 7. SCOPE-SOURCE GUIDE

Five sources exist. They are **alternatives, not a checklist**, and only one result is kept.

| Action | What it actually does | Use when | Result |
| --- | --- | --- | --- |
| **Find syllabus** | `researchScope` — searches the web, reads pages, extracts a scope with verified evidence | The target has an official specification Sylf can find | A **candidate** with units, sources, coverage and evidence — awaiting confirmation |
| **Upload a syllabus** | PDF/PNG/JPEG/WebP → text extraction → scope | The student has the document | A candidate, `origin: IMPORT`, no public sources |
| **Paste an outline** | `importScope` from text | The student has a contents page as text | A candidate, `origin: PASTE` |
| **Type topics** | `updateScopeUnits` | The student knows the list, or wants to edit a candidate | Confirmed directly — **no confirmation step** |
| **Use only what I give you** | `researchPolicy = "OFF"`, persisted | The student does not want Sylf searching | **Not a scope source.** It disables research entirely — see below |

### The critical rule

> **A candidate is not a scope until it is confirmed. Typing is a scope immediately.**

`readiness.ts` encodes exactly this: `USER_MANUAL` and `SYLF_SUBJECT` scopes count as confirmed;
researched and imported scopes count only once `scope.confirmedAt !== null`. Hence two distinct
blocking codes — `SCOPE_MISSING` (nothing at all) and `SCOPE_UNCONFIRMED` (a candidate is waiting).

### So: do I need to type all my topics?

**No — and you should not do both.** Pick one:

- **Research is the default for anything with an official syllabus.** Press Find syllabus, check
  the result, tick what you want, confirm. You do not type anything.
- **Typing is for when you already know.** Research on a single chapter is often slower than typing
  five lines.
- **After a candidate exists, the textarea edits it.** Confirming applies the units; everything
  else in the candidate is discarded. If you typed first and then confirmed a candidate, the
  candidate wins and your typed list is replaced.

### Where the manual editor should appear

The current UI shows the review card **or** the editor, which is right — but the decision rule is
subtle and the student cannot see it. Recommended rule for the redesign:

| State | Show |
| --- | --- |
| A candidate with units exists | **The review card only**, with "Add your own units instead" as a secondary action that discards the candidate and reveals the editor |
| A candidate with **no** units exists (a failed search) | **The message *and* the full scope-source control** — a failed search must never take the scope path away |
| No candidate | The full scope-source control |

That third case is already a fixed bug in the current code (`reviewableCandidate` in
`QuickPlan.tsx`, with a comment recording that a unit-less candidate once replaced the entire scope
path). **The redesign must preserve this distinction**, or it will reintroduce it.

### "Use only what I give you" — exact meaning

- Sets a **persisted** `researchPolicy = "OFF"` on the brief.
- It is *not* a scope source. It changes what Sylf is allowed to do.
- With it on: no provider call, no page fetch, no research model call. Verified live in Phase 3 —
  `searchCalls 0, sourcesFetched 0, httpRequests 0, modelCalls 0`, no nodes, no sources, no coverage,
  no evidence panel.
- It survives a page refresh: a later mount cannot decide on its own to search for someone who has
  already said not to.
- It can be reversed ("Allow a search again").
- **Recommended placement**: this belongs with the scope-source choice but should be visually
  distinguished as a *permission*, not a button in a row of sources.

---

## 8. WEEKLY-TIME / AVAILABILITY GUIDE

### The weekly figure

- **Required** (any one of: weekly minutes, a positive daily override, or an account schedule).
- **It is a target, not a cap.** The current copy says so: *"A realistic target, not a promise."*
- It is a target **for this plan only** — never an account-wide setting.
- "Use my normal Sylf schedule" stores **`null`** and the server supplies the implied figure. The
  brief stays honest about which of the two the student chose.

### How to choose a number

| Situation | Guidance |
| --- | --- |
| First plan, unsure | Pick the preset closest to a *normal* week, not a best week. 5h is a reasonable default. |
| Has an existing Sylf schedule | "Use my normal Sylf schedule" — no number to invent |
| Unusual week (shift work, alternating weeks) | Pick the weekly figure, then open **Customize days** |
| Genuinely ambitious | Allowed. Sylf warns; it does not refuse. See §18. |

### Per-day detail

- Pins minutes per weekday.
- "Days you cannot study at all" creates a **HARD** `UNAVAILABLE_WEEKDAY` constraint — the only way
  a weekday becomes genuinely off-limits.
- Individual dates can be excluded.
- The account's rest days are shown but are *not* the same thing: they come from the account, they
  are reported as `restWeekdays`, and the engine treats them as blocked.

### What the student sees back

The server distributes the weekly figure across the horizon and returns a seven-value weekday
vector, rendered as a per-day preview (e.g. `Mon 1h 30m · Wed 2h · Sat 3h`). **This preview is the
single best feedback control in the current UI** and the redesign should keep it prominent: it is
where an unrealistic week becomes visible before generation.

### The honesty rule for the redesign

Never present the weekly figure as a limit. `WeeklyBudgetControl`'s comment is explicit that the
budget is *"never a hard cap — the engine's own hard limits still block what they always blocked."*
If the UI shows a number the engine will not honour, it is lying.

---

## 9. BACKGROUND CURRICULUM EXPLANATION

### What it is

What the student studied **before** the target. A qualification label, optional subjects, and a
board and level.

### What it is for

**Curriculum comparison** — a separate, research-backed capability. Sylf compares the student's
background curriculum against the confirmed scope and classifies each unit as:

| State | Meaning |
| --- | --- |
| `LIKELY_COVERED_BY_CURRICULUM` | Met on paper in the background qualification |
| `PARTIAL_OVERLAP` | Partly met |
| `LIKELY_NEW_TO_CURRICULUM` | Not in the background |
| `UNCLEAR` | Could not be asserted |

The student can **correct any of it**, and their correction outranks Sylf's ("keeping what Sylf
said" — the original record is preserved beside the correction).

### What it is NOT

This is the distinction the current copy already gets right and the redesign must not blur:

> **Comparison says what was *met on paper*. It says nothing about how well it is known.**
> Preparedness is the student's own statement about their knowledge; overlap never writes
> preparedness, and the engine never receives overlap at all.

### When to use it

- The student has a prior qualification that overlaps the target (IGCSE → A-Level, FSc → university).
- Not useful when starting a subject from nothing, or when the target has no prior stage.

### When to leave it blank

Whenever the student does not want a comparison. Nothing is blocked; the plan is built without
overlap information.

### Why it is worth keeping in the default view

Unlike per-day overrides, this field **changes what Sylf can tell the student** — it is the one
optional field besides board/level that unlocks a whole capability. It should stay visible but
collapsed, phrased as an offer.

---

## 10. PREPAREDNESS EXPLANATION

### The six states

| State | Student label | What the engine is told |
| --- | --- | --- |
| `UNKNOWN` | Not rated | Unstated — plan as work that may need learning |
| `NOT_STUDIED` | Not studied | The plan owes this unit its learning step |
| `STUDIED_UNRATED` | Studied, not rated | Met before, but no claim about quality |
| `WEAK` | Weak | Needs teaching and heavy rehearsal |
| `OKAY` | Okay | Needs rehearsal more than teaching |
| `STRONG` | Strong | Needs maintenance and practice |

Plus per unit: **difficulty** (a boolean, only ever set by the student) and **priority**
(Neutral / Low / High).

### Is it required?

**No.** `readiness.ts` raises `PREPAREDNESS` as a *refinement* while fewer units are rated than
exist, and a refinement never blocks. Generation does not wait for it.

### What happens if it is left completely blank

Every unit is `null` in the contract, which the planner reads as **unstated** — not as "not covered"
and not as "very weak". Sylf plans conservatively: it assumes work that may need learning. The
student gets a usable, slightly cautious plan.

### The rule the redesign must preserve

`copilot/contracts.ts` states it for the model and it applies equally to the UI:

> *"There is no field for a model judgement about importance, difficulty, mastery or confidence, so
> 'this looks important' cannot become a priority and 'you probably know this' cannot become
> preparedness."*

**Preparedness and priority are only ever written by an explicit student action** — a click in the
matrix, a Copilot command the student issued, or a coverage suggestion the student accepted. The UI
must never pre-tick a state, never infer one from the comparison, and never present a suggested
value as if the student had said it.

### How to invite it without demanding it

The current framing is correct and should be kept and sharpened:

> "Rating what you already know is optional. Anything you skip, Sylf plans as work that may need
> learning."

---

## 11. COPILOT CAPABILITY GUIDE

### What the Copilot is, architecturally

A **bounded interpreter**, not an agent. One turn = read state → project context → one
interpretation pass → resolve against state → decide outcome → optional one wording pass. There is
**no loop, no tool call, and no second attempt at the same question** (`copilot/run.ts`).

### The five things it can return

| Outcome | Meaning |
| --- | --- |
| `ANSWERED` | An explanation or a clarification. Changes nothing. |
| `PROPOSED` | One or more changes, held in a signed token for the student to confirm |
| `ROUTED` | The request belongs to an existing capability (research, comparison, draft edit, replan, release) |
| `REFUSED` | A closed error code, and for a missing prerequisite, the one thing to add first |

### The 15 intents

`INTAKE_UPDATE`, `SCOPE_UPDATE`, `PREPAREDNESS_UPDATE`, `BACKGROUND_UPDATE`, `AVAILABILITY_UPDATE`,
`PREFERENCE_UPDATE`, `CONSTRAINT_UPDATE`, `RESEARCH_REQUEST`, `COMPARISON_REQUEST`, `EXPLAIN`,
`DRAFT_EDIT`, `CONFIRMED_PLAN_CHANGE`, `RELEASE_GENERATED_ITEM`, `REPLAN_REQUEST`, `UNKNOWN`.

### Which messages can change the brief

**17 command shapes exist.** Their authority is not equal:

**Applied immediately, no confirmation** — when *all* of these hold: exactly one command, `HIGH`
confidence, the command is in the direct list, and it creates no hard constraint and removes no
scope:

| Command | Natural phrasing |
| --- | --- |
| `SET_WEEKLY_HOURS` | "I only have 6 hours per week." |
| `SET_TARGET_DATE` | "Make the deadline two weeks later." |
| `SET_BACKGROUND_CURRICULUM` | "I did IGCSE Chemistry." |
| `SET_PREPAREDNESS` | "I never studied matrices." / "I'm weak at mechanics." |
| `SET_OVERLAP_CORRECTION` | "We did cover this in my last course." |
| `SET_PRIORITY` | "Calculus matters most." |
| `SET_DIFFICULTY` | "Integration is the hard part for me." |

**Always requires confirmation** (the proposal carries a reason code):

| Reason code | Triggered by |
| --- | --- |
| `MULTI_COMMAND` | More than one command in one message |
| `LOW_CONFIDENCE` | The interpretation is not `HIGH` |
| `HARD_CONSTRAINT` | A `HARD` `SET_CONSTRAINT` — "Sundays are completely off" |
| `SCOPE_REMOVAL` | An `UPDATE_SCOPE` that removes anything |
| `RESEARCH` | `REQUEST_SCOPE_RESEARCH`, `REQUEST_CURRICULUM_COMPARISON` |
| `DRAFT_EDIT` | `REQUEST_DRAFT_EDIT` |
| `REPLAN` | `REQUEST_REPLAN` |
| `RELEASE` | `RELEASE_GENERATED_ITEM` |

**Routed, never executed by the Copilot itself** — `RESEARCH`, `COMPARISON`, `DRAFT_EDIT`,
`REPLAN`, `RELEASE` are the planner's own existing capabilities. The Copilot decides *which* one;
the flow that owns it does the work.

### Purely explanatory

`EXPLAIN` is legal in **every** lifecycle and changes nothing. Its facts are **assembled
server-side** — up to 6 facts of up to 240 characters — and the model only chooses wording. It can
answer, with real data:

- Why a named unit is in the plan (confirmed unit? overlap with background? preparedness? priority?
  difficulty?)
- Where the confirmed scope came from, with each source's type and whether it is *"the verified
  authority for this target"*, *"a credible institution, but not the verified authority"*, *"material
  you supplied"*, or *"not an authority"*
- Which weekdays are unavailable and why
- The weekly target and whether a hard maximum exists
- Whether a comparison is `READY` or `STALE`

### The lifecycle gate

| Lifecycle | When | What is legal |
| --- | --- | --- |
| `PRE_GENERATION` | No draft yet | All brief edits + research + comparison + explain |
| `DRAFT_REVIEW` | A draft exists | Draft edits, releases, explain. **Brief edits are refused.** |
| `CONFIRMED` | The plan is confirmed | Replan, release, explain. **Structure changes only through a replan.** |

The refusal is explicit (`COMMAND_NOT_ALLOWED_IN_STATE`): *"This plan is already confirmed, so its
structure changes through a replan. Ask me to rebalance the remaining work instead."*

### When it asks a question instead of acting

Five closed clarification codes, each with a different next action for the student:
`HARD_OR_SOFT` ("is that a limit or a preference?"), `WHICH_UNIT`, `WHICH_DATE`,
`CURRICULUM_OR_PREPAREDNESS`, `SCOPE_OF_CHANGE`. One question, at most 4 concrete options.

### What the Copilot must NOT pretend it can do

| Cannot | Why | What the UI should offer instead |
| --- | --- | --- |
| General conversation | One interpretation pass, no chat loop | Nothing. Do not present a general assistant. |
| Answer questions about the world | No search, no knowledge tool | "I can look up a syllabus" → routes to research |
| Upload or read a file | **There is no import command.** `CAPABILITY_COMMANDS` has no IMPORT | Direct the student to the Upload control |
| Invent a topic's importance, difficulty or mastery | No field exists for a model judgement | Ask the student, or route to the matrix |
| Change a confirmed plan's structure | Lifecycle gate | Offer a replan |
| Write to the database itself | The model's output surface has no such shape | — |
| Remember the conversation | **The transcript lives in the browser tab**, sent with each request, truncated to the last 8 turns and 2,400 characters. There is no conversation store on either side | Do not promise saved history |
| Do more than 5 changes at once | `maxCommandsPerTurn: 5` | Ask the student to split it |

### Hard limits the UI should respect

`maxMessageChars 600` · `maxCommandsPerTurn 5` · `maxModelPassesPerTurn 2` · `maxRecentTurns 8` ·
`maxRecentChars 2400` · `maxTurnsPerSession 12` · `summaryChars 300` · `questionChars 200` ·
`clarificationOptions 4` · **`proposalTtlMinutes 30`**.

**The 30-minute proposal expiry is the one a redesign is most likely to break.** A proposal is a
signed, expiring, session-bound, version-bound token: it dies if the brief changes, if the session
changes, or after 30 minutes. The UI must show proposals as **ephemeral and bound to the current
state**, never as a queued action.

---

## 12. EXAMPLE COPILOT CONVERSATIONS

Each flow below is legal under the current backend. The bracketed line records the outcome.

### A. A single high-confidence brief edit — applied directly

> **Student:** I only have 6 hours per week.
> **Sylf:** Set your weekly study target to 6 hours. *(outcome: `ANSWERED`-style direct apply,
> `SET_WEEKLY_HOURS`, weekly target)*
> ↳ The Plan Summary's "Weekly time" row updates. No confirmation asked, because this is one
> reversible change the student could have made by hand.

### B. A preference that must not become a rule — the clarification path

> **Student:** Keep Sundays free.
> **Sylf:** Is Sunday completely off-limits, or would you rather Sylf avoided it when it can?
> *(clarification `HARD_OR_SOFT`, ≤4 options)*
> **Student:** Avoid it if you can.
> **Sylf:** Sundays will be avoided where the plan allows. *(soft preference)*

This is the single most important conversation in the product: it is the boundary between a
constraint the engine must honour and one it should merely try to honour.

### C. Preparedness, stated by the student

> **Student:** I'm weak at mechanics.
> **Sylf:** Marked Mechanics as weak. *(direct apply — `SET_PREPAREDNESS`, state `WEAK`)*

Resolved server-side against the *confirmed scope*: if "Mechanics" matches nothing, the answer is a
refusal or `WHICH_UNIT`, never a guess.

### D. An explanation that changes nothing

> **Student:** Why did you schedule this?
> **Sylf:** "Sequences and series" is one of the units you confirmed for this plan. You have not
> said how well you know it, so Sylf plans it as work to learn. This scope was confirmed from 2
> sources: cambridgeinternational.org (official pdf: the verified authority for this target);
> prepblog.example (secondary: not an authority).
> *(outcome `ANSWERED`, up to 6 server-assembled facts)*

### E. A multi-part request — proposed, not applied

> **Student:** Make the first week lighter and add two weeks to the deadline.
> **Sylf:** I understood two changes: shorten the first week's sessions, and move the deadline to
> 12 June. *(proposal, requires `MULTI_COMMAND`)*
> [Apply] [Cancel]
> ↳ The proposal is a signed token, valid 30 minutes, and dies if the brief changes.

### F. A destructive request — proposed with a reason

> **Student:** Drop trigonometry, I've done it.
> **Sylf:** This removes 3 units from your scope: Trigonometry, Sine rule, Cosine rule.
> *(proposal, requires `SCOPE_REMOVAL`)*
> [Apply] [Cancel]

### G. A missing prerequisite — refused with the one thing to add

> **Student:** Compare this with my A-Level background.
> **Sylf:** One thing first: add your background curriculum. [Add it]
> *(refusal `COPILOT_PREREQUISITE_MISSING`, prerequisite `BACKGROUND_CURRICULUM_REQUIRED`)*

### H. After confirmation — structure is closed

> **Student:** Remove the final mock exam.
> **Sylf:** This plan is already confirmed, so its structure changes through a replan. Ask me to
> rebalance the remaining work instead.
> *(refusal `COMMAND_NOT_ALLOWED_IN_STATE`)*

### I. A request the Copilot cannot serve

> **Student:** Use my uploaded syllabus instead.
> **Sylf:** I can't swap the scope from here — that happens in the scope step. [Take me there]
> *(There is no import command in the backend. The UI must route, not promise.)*

### Presentation rules for proposals

1. **Show the consequence, in the student's terms, per command** — `CopilotCommandPreview` already
   carries a `consequence` sentence derived from the *current* state.
2. **Name the reason for confirming.** "I understood two changes" is a different message from
   "this removes 3 units."
3. **Two actions only: Apply and Cancel.** No "edit the proposal" — the commands are inside a signed
   token and cannot be rewritten by the client.
4. **Mark it as expiring.** Pending → applied / expired / superseded.
5. **Never queue proposals.** A proposal belongs to the version of the brief that produced it.

---

## 13. GOOD INPUT EXAMPLES FOR ALL MODES

### EXAM PLANNER

| # | Goal | Subject | Deadline | Scope source | Manual scope | Board / level | Weekly |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `CAIE A Level Mathematics 9709` | *(blank)* | 2027-05-12 | Find syllabus | — | CAIE / A-Level | 8h |
| 2 | `University final: Advanced Macroeconomics` | Economics | 2027-01-20 | Upload the module handbook | — | *(blank)* | 10h |
| 3 | `NUST NET Engineering preparation` | Engineering | 2027-02-04 | Find syllabus, then trim | — | *(blank — no board)* | 12h |
| 4 | `Biology mock exam` | Biology | 2027-03-09 | Paste the teacher's topic list | — | *(blank)* | 5h |
| 5 | `A-Level Physics Paper 2 retake` | Physics | 2027-06-01 | Find syllabus | *(add "Practical skills" after confirming)* | CAIE / A-Level | 6h |

**Why these work:** each names a *specific* examination or assessment; the deadline is a real date
within 365 days; the scope has exactly one source; and where an official board exists it is stated,
which is what lets Sylf verify a source.

### COURSE / SYLLABUS ROADMAP

| # | Goal | Subject | Finish by | Scope source | Board / level | Weekly |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `Complete CAIE A-Level Chemistry` | Chemistry | 2027-06-30 | Find syllabus | CAIE / A-Level | 10h |
| 2 | `University Calculus I` | Mathematics | 2027-05-15 | Paste the course syllabus | *(blank)* | 8h |
| 3 | `Self-study Python curriculum` | Computer Science | 2027-04-01 | Type the list | *(blank)* | 6h |
| 4 | `FSc Pre-Engineering, full two-year syllabus` | *(blank)* | 2027-07-31 | Find syllabus | *(blank)* | 15h |

**Why these work:** a whole qualification or an entire course; a horizon in months, not weeks; a
scope that is genuinely the whole syllabus. Roadmap is the mode that *expects* to be segmented, so
a big list is correct here rather than a mistake.

### CHAPTER / UNIT MASTERY

| # | Goal | Subject | Finish by | Scope source | Weekly |
| --- | --- | --- | --- | --- | --- |
| 1 | `Master Integration` | Mathematics | 2027-03-01 | Type: Substitution, By parts, Partial fractions, Trigonometric integrals, Definite integrals | 5h |
| 2 | `Learn Electrostatics` | Physics | 2027-02-15 | Type: Coulomb's law, Electric field, Gauss's law, Potential, Capacitance | 4h |
| 3 | `Master Chapter 7 of the textbook` | Chemistry | 2027-03-20 | Paste the chapter contents | 3h |
| 4 | `Photosynthesis` | Biology | 2027-02-28 | Find syllabus | 5h |

**Why these work:** one chapter or one concept, never a subject; a short topic list that is genuinely
*inside* the unit; a finish date close enough that mastery is achievable.

---

## 14. BAD / VAGUE EXAMPLES FOR ALL MODES

### EXAM PLANNER

| Bad goal | Why it fails |
| --- | --- |
| `Study harder` | No examination, no deadline, nothing to research. Sylf cannot know what "harder" covers. |
| `Maths` | A subject, not an exam. There is no date, no board, no paper — the scope would be invented. |
| `My exams` | Plural with no date. Which exam? When? The plan cannot be paced. |
| `Prepare for everything by next month` | Unbounded scope with a vague date. Nothing is structurally blocked, but every objective is unanswerable and the plan will be noise. |

**The pattern:** a good exam goal names **a specific examination and implies a date**. If a friend
could not tell you which paper it is, Sylf cannot either.

### COURSE / SYLLABUS ROADMAP

| Bad goal | Why it fails |
| --- | --- |
| `Learn science` | A field, not a course. No syllabus exists to roadmap. |
| `Finish my degree` | Years long — the horizon bound is 365 days, and the scope is unknowable. |
| `CAIE A-Level Chemistry` *(with a 10-day deadline)* | Correct goal, impossible horizon. Nothing blocks, but the roadmap becomes dense sessions and the advisory will say so. |

**The pattern:** a roadmap needs **a qualification or a course with a defined body of material**, and
a horizon measured in weeks-to-months.

### CHAPTER / UNIT MASTERY

| Bad goal | Why it fails |
| --- | --- |
| `Mathematics` | An entire subject in the unit field. This is what Roadmap is for. |
| `Get better at physics` | Not a unit. Unmasterable as stated — there is no finish line. |
| `Everything in Chapter 7` | "Everything" is not a topic list; the scope becomes whatever Sylf guesses. |
| `Integration` *(with no topics and no research)* | The unit is right but the scope is empty, so nothing generates. Perfect goal, blocked plan. |

**The pattern:** Mastery wants **one unit, and the topics inside it**. The goal names the unit; the
scope lists its parts.

---

## 15. PROPOSED GUIDED FRONTEND FLOW

### Recommended structure

The requested three-step shape is correct, with one addition the semantics genuinely require.

```
STEP 1 — WHAT ARE YOU PLANNING?
  • Goal (mode-specific label)
  • Subject (optional, collapsed behind "Add a subject")
  • Deadline
  → Sylf can already tell whether research is possible here

STEP 2 — WHAT SHOULD SYLF COVER?
  • One primary action, chosen by Sylf from what Step 1 implied:
      "Find the official syllabus"  ← when research is possible
      "Add your topics"             ← when it is not
  • The other two sources as secondary text actions: Upload · Paste
  • Board / level, shown HERE, because this is the step they affect
  • "Use only what I give you" as a distinct permission toggle
  → Produces a confirmed scope

STEP 3 — HOW MUCH TIME DO YOU HAVE?
  • Weekly time (presets + custom + "my normal schedule")
  • The weekday preview
  • "Customize days" as a secondary disclosure
  → Immediately shows the feasibility picture

REVIEW
  • Compact Plan Summary (§16)
  • Warnings, if any, as acknowledgements
  • Generate
```

### Why Step 2 needs board/level inside it

The current UI already places them there, and the code comment explains why: *"The board is what
makes an official source recognisable at all, so it is asked for where research is asked for — not
buried in Advanced setup."* The redesign must not move them to a settings step; they belong to the
scope step because they change what the scope step can achieve.

### Where the optional capability fields go

Not in the steps. After Step 3, in a single **"Make it sharper (optional)"** area containing:

- Background curriculum → unlocks comparison
- Preparedness matrix → unlocks teaching-vs-rehearsal
- Both are collapses, both labelled optional, neither blocking.

This is the correct home for them because they are *refinements of an already-valid brief* — which
is exactly what `readiness.ts` calls them.

### Progressive disclosure rules

| Level | Contents | Default |
| --- | --- | --- |
| Always visible | Goal, deadline, scope action, weekly time, Generate | Open |
| One click | Subject, Customize days, Make it sharper, the Plan Summary details | Collapsed |
| Two clicks | Advanced Setup | Separate surface |

### What must NOT be a step

- Preparedness. Making it a step makes a refinement feel mandatory and adds a screen that most
  students should skip.
- Background curriculum. Same reason.
- Days. Belongs to the time step as a disclosure, not its own screen.

---

## 16. PROPOSED COMPACT PLAN BRIEF

The current 11-row panel restates what is already on screen. Replace it with a summary of
**decisions**, not fields.

### Always visible (before Generate)

```
YOUR PLAN
CAIE A Level Mathematics 9709
A-Level · CAIE                      ← board/level, only when set
12 May 2027 · 8 weeks away

COVER        34 units, from the official CAIE specification
             └ confirmed from cambridgeinternational.org (official)
TIME         8h a week → Mon 1h · Tue 1h 30m · Thu 2h · Sat 3h 30m
```

Four rows. Every one is decision-relevant: *what*, *when*, *how much scope*, *how much time*.

### Shown only when populated

| Row | Show when |
| --- | --- |
| Subject | Subject differs from the goal title |
| Background | A background curriculum is recorded |
| What you already know | At least one unit has stated preparedness — as a count, e.g. "Rated 12 of 34" |
| Excluded | Any unavailable weekday or blocked date exists |
| Reserve | `recoveryPercent !== null` (i.e. explicitly set — never show "Mode default") |

### Hidden under "Review details"

- Full unit list
- Full source list with types and document dates
- Preparedness detail per unit
- Constraints and soft preferences
- The engine's hard limits (`sessionLimitMinutes`, `weeklyLimitMinutes`, `unavailableWeekdays`)
- Readiness state and internal counts

### Copy for the summary header

> **Your plan** — this is everything Sylf will work from. Anything you leave out, Sylf decides for
> you and tells you what it assumed.

### Why this is the right cut

`PlanBriefPanel`'s own comment says the panel exists so it *"can never flatter the brief"* — every
row is server-held truth. That principle is right and should be kept. What should go is the
**duplication**: Mode, Readiness, Open-questions-count and "Reserve: Mode default" are not decisions
a student makes or reads before pressing Generate. The new panel answers "what will Sylf build?"
in four lines and puts the audit trail one click away.

---

## 17. ADVANCED SETUP BOUNDARY

### What Advanced Setup is today

A toggle in the workspace toolbar (`PlannerWorkspace.tsx`) that swaps Quick Plan for the original
mode wizard. Its own subtitle says: *"⚙️ Advanced setup: full manual control across each step,
exactly as before."*

| Mode | Steps |
| --- | --- |
| Exam | Your Exam plans · What are you preparing for? · What is included? · When is the exam? · When can you study? · How prepared are you? · Review your assumptions |
| Roadmap | Your roadmaps · What are you studying? · What is included? · When should it be finished? · When can you study? · How far along are you? · Review your roadmap |
| Mastery | Your mastery plans · What are you mastering? · What is included? · How deep, and by when? · When can you study? · How far along are you? · Review your mastery plan |

### Who needs it

A minority, and a specific one: students who want to see and set **assumptions the adapter would
otherwise default**, or to load and manage saved plans.

### What it offers beyond Quick Plan — the genuine list

| Capability | Why it stays Advanced |
| --- | --- |
| **Mastery depth** (`ORIENTATION` / `SOLID` / `DEEP`) | Defaults to `SOLID`; a real choice with real consequences — "How deep, and by when?" |
| **Mastery prior exposure** (`NEW` / `SOME` / `MOSTLY`) | Defaults to `NEW`; a student who has studied the unit gets a plan built for a beginner unless they say otherwise |
| **Mastery check preference** | Defaults to `MIXED_PRACTICE` |
| **Exam format** and **approach** (`STANDARD` / `TRIAGE`) | Format defaults to `UNSPECIFIED`, approach to `STANDARD`. `TRIAGE` is a deliberate strategy for a weak position. |
| **Preferred session minutes** (15–120) and mock length | Defaults to 45 minutes |
| **`allowExamDayStudy`** | Defaults to `false` |
| **Review your assumptions** | The screen that shows every derived value before generating |
| **Saved plans** | Listing and resuming earlier plans |
| **Preference panel** | The 8 soft preferences and 3 hard constraint kinds |

### What must NOT leak back into the default Quick Plan UI

These are Advanced for a reason and adding them back is how the current page became seventeen
elements long:

1. **Mastery depth / prior exposure / check preference.** A student cannot answer these without
   understanding them; the default is honest and the plan is usable.
2. **Exam format and approach.** `TRIAGE` in particular is a strategic decision, not a setup field.
3. **Session length and mock length.**
4. **The saved-plans step.** It is a *list*, not a setup choice; Quick Plan already has one plan.
5. **The full preference panel.** Soft preferences belong to the Copilot ("keep Sundays free") and
   to Advanced, never to the first run.
6. **"Review your assumptions."** Quick Plan's compact summary (§16) is the equivalent; a second
   full review screen would duplicate it.

### The one thing Advanced should keep in Quick Plan's reach

The **`priorExposure`** default of `NEW` is the weakest default in the adapter for a Mastery student
who has already studied the unit. The recommended frontend answer is **not** to add the field to
Quick Plan — it is to let the Copilot and the **preparedness matrix** cover it: a student who marks
units `Studied, not rated` or `Okay` has already told Sylf more than `priorExposure` would.

---

## 18. WARNING vs BLOCKER UX

### The rule the product already holds

> **WARN ABOUT TRADEOFFS, THEN LET THE USER MAKE THE PLAN THEY WANT.**

`GenerationPanel` already implements it and says so:

> *"These do not stop you. Read them, and change the brief instead if you would rather avoid them."*

Warnings are **acknowledgement checkboxes**, not gates. `verifyAcknowledgements` refuses an
acknowledgement for a warning that was not raised, or for a blocker — so a client cannot pre-accept
something the student never saw.

### The 13 advisory warnings (acknowledge and proceed)

| Code | Student-facing consequence |
| --- | --- |
| `SOFT_PREFERENCE_UNHONORED` | This plan departs from a scheduling preference you set. It stays feasible, but it may feel less comfortable to follow. |
| `TASK_VAGUE` | Some tasks do not say precisely what to do, so they may be harder to start. |
| `DENSITY_SPIKE` | One date carries far more work than the rest of the plan. |
| `REDUNDANT_TOUCH` | Two items serve the same purpose on the same date. |
| `SEQ_WEAK` | The order of some work is not ideal for learning, though it remains doable. |
| `PRIORITY_MISS` | A topic you marked as higher priority receives less attention than usual. |
| `ROBOTIC_PATTERN` | Some items read as a repeated template rather than tailored work. |
| `INTENSITY_SPIKE` | One date stacks several demanding items, which may be tiring even though the minutes fit. |
| `FEASIBILITY_REDUCED_RESERVE` | The recovery reserve is below the usual level, leaving less slack between sessions. |
| `FEASIBILITY_OVERLOADED_AVAILABILITY` | Your stated availability is tight for this scope, so the plan uses most of the time you have. |
| `FEASIBILITY_SEGMENT_REQUIRED` | The scope is larger than one plan can hold, so it is planned in segments. |
| `SCHEDULED_ON_REST_DAY` | Some work falls on a rest day you normally keep free. It stays scheduled there unless you change it. |

**Recommended presentation:** a bounded list above the Generate button, each with a checkbox and the
sentence above verbatim. Group them under one heading — the current copy ("N things worth knowing")
is good and should be kept.

### The genuine blockers — and there are only five kinds

| Blocker | What it actually is |
| --- | --- |
| **Missing essentials** | `GOAL_MISSING`, `SCOPE_MISSING`, `SCOPE_UNCONFIRMED`, `TARGET_DATE_MISSING`, `CAPACITY_MISSING` |
| **Infeasible capacity** | `validateCapacity` returns `feasible: false` when a day with proposed work is **blocked** or **over capacity** (`remaining < 0`, where `remaining = budget − reserve − existing − proposed`) |
| **Schema bounds** | Items 200 · proposed items per generation 90 · topics 50 · milestones 52 · periods · horizon **365 days** · per-item minutes 15–240 · daily minutes 0–720 · recovery 0–50% |
| **Hard constraints** | Exactly three kinds can be `HARD`: `MAX_SESSION_MINUTES`, `UNAVAILABLE_WEEKDAY`, `MAX_WEEKLY_MINUTES` |
| **Payload ceilings** | `inputBytes 32768`, `payloadBytes 262144` |

### Deliberately NOT blockers

| Situation | Treatment |
| --- | --- |
| Ambitious weekly time | Target, not a cap. Warns at most. |
| Long plan (up to 365 days) | Allowed. Beyond 365 days the horizon bound refuses. |
| Large scope | **Segmented**, not refused — `FEASIBILITY_SEGMENT_REQUIRED` is an *advisory*. |
| Unusual schedule | Supported via daily overrides and unavailable weekdays |
| Long sessions | Bounded by the hard item cap (15–240 min), not by policy |
| Dense plan | `DENSITY_SPIKE` / `INTENSITY_SPIKE` warnings, never a gate |

### Two "accept and continue" gates that are not blockers

`EXCLUSIONS_REQUIRE_ACCEPTANCE` and `RESERVE_ACCEPTANCE_REQUIRED` arrive as generation failures with
an explicit **"Accept this and continue"** button (`GenerationPanel.tsx`). **The redesign must
preserve this as an acceptance, not an error state** — it is the flexibility principle in its purest
form.

### Copy rule

> Never write "you can't" for something the engine will do with a warning. Write what will happen,
> and let the student decide.

---

## 19. DESKTOP INFORMATION ARCHITECTURE

The proposed layout is sound. One refinement: the guided workspace should be **three steps inside
one scrolling column**, not three separate screens, because the essentials are interdependent
(choosing a scope changes what time means) and the backend re-derives readiness after every change.

```
┌──────────────────────────────────────────────────────────────────────┐
│ Planner navigation                                                   │
│ [← Classic Planner]  [Exam Planner · Day-by-Day Sprint]  [Advanced]  │
├───────────────────────────────────────────┬──────────────────────────┤
│ GUIDED WORKSPACE  (max ~58rem)            │ SYLF COPILOT  (~22rem)   │
│                                           │                          │
│ 1  WHAT ARE YOU PLANNING?                 │ ┌──────────────────────┐ │
│    Exam or goal     [________________]    │ │ Ask me to change     │ │
│    + Add a subject  (collapsed)           │ │ something, or ask    │ │
│    Exam date        [____-__-__]          │ │ why the plan looks   │ │
│                                           │ │ the way it does.     │ │
│ 2  WHAT SHOULD SYLF COVER?                │ ├──────────────────────┤ │
│    ┌───────────────────────────────────┐  │ │ YOU: I'm weak at     │ │
│    │  Find the official syllabus       │  │ │      mechanics       │ │
│    │  Upload · Paste · Enter topics    │  │ │ SYLF: Marked         │ │
│    └───────────────────────────────────┘  │ │      Mechanics as    │ │
│    Exam board / system  [▾]  [▾] level    │ │      weak.           │ │
│    □ Use only what I give you             │ │                      │ │
│                                           │ │ ── PROPOSAL ──       │ │
│ 3  HOW MUCH TIME DO YOU HAVE?             │ │ Remove 3 units?      │ │
│    [3h][5h][8h][10h][15h][Custom]         │ │ [Apply]  [Cancel]    │ │
│    Mon 1h · Wed 2h · Sat 3h               │ ├──────────────────────┤ │
│    ▸ Customize days                       │ │ [message]    [Send]  │ │
│                                           │ └──────────────────────┘ │
│ ▸ MAKE IT SHARPER (optional)              │                          │
│    Background curriculum · What you know  │  Suggestions:            │
│                                           │  · Change my weekly hours│
│ YOUR PLAN                                 │  · Make weekends lighter │
│ 8 weeks · 34 units · 8h a week            │  · Why is this topic     │
│                                           │    included?             │
│ N things worth knowing  ☐  ☐              │                          │
│ [ Generate my plan ]   [ Fine-tune first ]│                          │
└───────────────────────────────────────────┴──────────────────────────┘
```

### Rules for the layout

1. **The Copilot is a persistent panel, not a `<details>`.** Always mounted at ≥1024px, its own
   column, its own scroll, input pinned to the bottom — visually a normal chat.
2. **Steps are anchors, not screens.** One column, numbered headings, scroll-spy in the nav.
3. **Generate is sticky.** It must not require a scroll to the bottom of the page.
4. **One primary action per step.** Step 2 must not present five peer buttons.
5. **Proposals render inside the Copilot panel** and, when they touch the brief, the affected step
   shows a subtle "this will change" marker before Apply.
6. **The transcript is tab-local.** Do not offer "clear history", "saved conversations", or
   anything implying persistence — there is no store.

---

## 20. MOBILE INFORMATION ARCHITECTURE

### Copilot on mobile

A permanently-persistent side panel is wrong below ~1024px: it would halve the width, which is the
opposite of what the current build already had to fix (the Phase 3 browser QA asserts **0px
horizontal overflow at 390px**).

**Recommended: a floating action button opening a bottom sheet at ~85vh.**

```
┌─────────────────────────────┐
│ ← Classic   Exam Planner ⚙ │  sticky nav
├─────────────────────────────┤
│ 1 WHAT ARE YOU PLANNING?    │
│   Exam or goal [__________] │
│   Exam date    [__________] │
│                             │
│ 2 WHAT SHOULD SYLF COVER?   │
│   [ Find the official       │
│     syllabus ]              │
│   Upload · Paste · Enter    │
│   Board [▾]   Level [▾]     │
│                             │
│ 3 HOW MUCH TIME?            │
│   [3h][5h][8h][10h]         │
│   [15h][Custom]             │
│   Mon 1h · Wed 2h · Sat 3h  │
│   ▸ Customize days          │
│                             │
│ ▸ MAKE IT SHARPER           │
│                             │
│ YOUR PLAN                   │
│ 8 weeks · 34 units · 8h     │
│                             │
│ ☐ 1 thing worth knowing     │
│ ┌─────────────────────────┐ │
│ │   Generate my plan      │ │  sticky
│ └─────────────────────────┘ │
│                    ( ✨ )   │  FAB
└─────────────────────────────┘
        ↓ tap
┌─────────────────────────────┐
│ ═══  Sylf            ✕      │  bottom sheet, 85vh
│                             │
│ YOU:   I only have 6 hours  │
│ SYLF:  Set your weekly      │
│        target to 6 hours.   │
│                             │
│ ┌─ PROPOSAL ──────────────┐ │
│ │ …                       │ │
│ │ [Apply]      [Cancel]   │ │
│ └─────────────────────────┘ │
│ ┌─────────────────┬───────┐ │
│ │ message…        │ Send  │ │
│ └─────────────────┴───────┘ │
└─────────────────────────────┘
```

### Mobile rules

1. **The sheet keeps its own scroll**; the planner scroll position is preserved underneath.
2. **Proposals dock above the input**, never inline in the transcript — so an expiring proposal is
   always in view.
3. **Suggestions collapse to a horizontal chip row** above the input.
4. **Generate is a sticky bar**, not a button at the end of the page.
5. **The status/notice banner must remain `aria-live="polite"`** — the current build does this and
   the Phase 3 mobile checks depend on it.
6. **No horizontal scroll at 390px.** This is already asserted in the harness; the redesign must keep
   passing it.

---

## 21. RECOMMENDED USER-FACING COPY

### Step headings

| Where | Copy |
| --- | --- |
| Step 1 | **What are you planning?** |
| Step 2 | **What should Sylf cover?** |
| Step 3 | **How much time do you have?** |
| Optional area | **Make it sharper** — *optional, and Sylf works without it* |
| Summary | **Your plan** |
| Generate | **Generate my plan** |

### Field labels and helpers

| Field | Label | Helper |
| --- | --- | --- |
| Goal (EXAM) | Exam or goal | *The exam or assessment you are preparing for.* |
| Goal (ROADMAP) | Course or goal | *The course or qualification you want to get through.* |
| Goal (MASTERY) | Unit or chapter | *One chapter or topic you want to properly master.* |
| Subject | Subject *(optional)* | *Leave blank if your goal already names it.* |
| Date (EXAM) | Exam date | *Sylf plans backwards from this day.* |
| Date (ROADMAP/MASTERY) | Finish by | *Sylf paces the work to land on this date.* |
| Board / level | Exam board or system · Academic level *(both optional)* | *This is how Sylf recognises an official syllabus. Without it, it will not call a source official.* |
| Weekly time | How much time can you give this each week? | *A realistic target, not a promise. Sylf spreads it around your rest days and whatever you already have planned.* |
| Days | Customize days | *Only if your week is unusual.* |

### The scope step — the five actions in recommended wording

```
What should Sylf cover?

  ┌────────────────────────────────────────────────────────────┐
  │  Find the official syllabus                                │
  │  Sylf searches for the board's own specification, reads    │
  │  it, and shows you what it found before anything is used.  │
  └────────────────────────────────────────────────────────────┘

  Or:  Upload a syllabus (PDF or image)  ·  Paste an outline

  ──────────────────────────────────────────────────────────────

  Exam board / system  [ Not sure / other ▾ ]   Level  [ ▾ ]
  This is how Sylf recognises an official syllabus.

  □ Use only what I give you
    Sylf will not search for anything. You supply the scope.
```

After a search finishes:

```
What Sylf found
34 units from cambridgeinternational.org (official specification)
2 of 3 questions answered.

  ☑ Sequences and series        Covered
  ☑ Calculus                    Covered
  ☐ Statistics                  Some evidence

  What Sylf could not settle
  · Which syllabus version applies — still unclear

  ▸ Why does Sylf think this?

  [ Use these 34 units ]   [ Add your own units instead ]
```

### The three source actions, explained in one line each

| Action | One line |
| --- | --- |
| **Find official syllabus** | *Sylf looks for the board's own specification and shows you what it found.* |
| **Upload a syllabus** | *Have the PDF or a photo of the contents page? Sylf will read it.* |
| **Paste an outline** | *Copy a contents list and paste it here.* |
| **Enter topics** | *Already know the list? Type one topic per line.* |
| **Use only what I give you** | *Stop Sylf searching. You supply everything.* |

### Copy for the things students get wrong

| Situation | Copy |
| --- | --- |
| Research found nothing | *Sylf could not find a usable syllabus for this. Add your topics below, or paste a contents page.* |
| A candidate exists *and* the editor is open | *Confirming these units replaces the list you typed.* |
| Research disabled | *You asked Sylf to use only what you give it, so nothing is looked up.* [Allow a search again] |
| No preparedness | *Not rated — Sylf will plan this as work that may need learning.* |
| Board blank | *Without a board or level, Sylf cannot confirm that a source is official. It will tell you when it cannot.* |
| Time blank | *No study time is placed yet. Set how much time you have.* |
| Roadmap auto-monthly | *A three-month roadmap is planned in months rather than weeks.* |
| Segmenting | *This scope is larger than one plan can hold, so Sylf plans it in segments.* |
| Confirmed plan, structural ask | *This plan is already confirmed, so its structure changes through a replan.* |
| Copilot asked to upload | *I can't swap the scope from here — that happens in the scope step.* |
| Copilot can't do something | *I can't do that from here.* + **the one control that can.** |

### Copilot panel copy

| Element | Copy |
| --- | --- |
| Header | **Sylf** |
| Empty state | *Ask me to change something, or ask why the plan looks the way it does.* |
| Input label | *Message Sylf* |
| Input placeholder | *e.g. I'm weak at mechanics* |
| Send | *Send* |
| Proposals | **I understood:** {summary} → [Apply] [Cancel] |
| Expiring | *This needs confirming within 30 minutes, and it will not apply if your brief changes.* |
| Clarification | **One thing to check** → question + options |
| Prerequisite | **One thing first:** {what is missing} → [the control] |
| Explanation | **Why** → up to 6 facts, each with its source |
| Refusal | The closed-code message, never a guess |

### Words to avoid

| Avoid | Use |
| --- | --- |
| "Advanced" as a warning | "Optional" |
| "Required" on a refinement | "Optional" |
| "You must" | "Sylf needs this to…" |
| "Invalid" | what is wrong and what to do |
| "Budget" (sounds like a cap) | "weekly time" / "target" |
| "Constraint" in student copy | "limit" (HARD) or "preference" (SOFT) |
| "Preparedness" in student copy | "what you already know" |
| "Scope" in student copy where avoidable | "what Sylf should cover" |
| "Candidate" | "what Sylf found" |

---

## 22. THINGS GEMINI MUST NOT CHANGE

**Do not change any of the following. Each is load-bearing and each is enforced.**

1. **The four essentials.** Goal, scope, date, weekly time. Adding a fifth required field breaks
   `MODE_MINIMUM` and the generate path.
2. **Optional means optional.** Never disable Generate for a missing refinement. `canGenerate` is
   true as soon as the essentials exist, and the UI must not invent a stricter rule.
3. **A unit-less candidate is a message, not a review.** If a search returns no units, the full
   scope-source control must remain available. This was a real bug and there is a comment in
   `QuickPlan.tsx` recording it.
4. **A candidate is not a scope until confirmed; typed units are.** Do not "auto-confirm" a
   researched scope to save a step.
5. **Provenance is never decorative.** If a source is shown, show its type and whether it is the
   verified authority. Never render a "source" Sylf did not fetch.
6. **Preparedness and priority are student statements only.** No pre-ticking, no inferring from the
   comparison, no defaults presented as the student's answer.
7. **Warnings are acknowledgements, not gates.** Never turn an advisory into a blocker.
8. **The weekly figure is a target, not a cap.** Never render it as a limit the engine will enforce.
9. **The Copilot's proposal boundary is fixed.** Direct apply only for one high-confidence
   reversible brief command; everything else proposes. Do not add an "auto-apply" toggle.
10. **The lifecycle gate is real.** After confirmation, structural changes route through a replan.
    Do not offer an edit that the backend will refuse.
11. **Never rewrite a proposal client-side.** The commands live inside a signed token.
12. **Never promise conversational memory.** There is no store on either side; the transcript is
    tab-local and truncated to 8 turns.
13. **Never present the Copilot as a general assistant.** It is a bounded interpreter with a closed
    vocabulary.
14. **Do not expose model chain-of-thought anywhere.** Explanations are server-assembled facts.
15. **Do not add a fifth scope source** without a backend capability behind it.
16. **Keep `aria-live` on readiness, notices and status.** The accessibility tests assert labels and
    the browser QA asserts the loading states.
17. **Keep 0px horizontal overflow at 390px.**
18. **Do not rename modes or badges.** *Exam Planner / Day-by-Day Sprint*, *Course / Syllabus
    Roadmap / Long-Horizon Pacing*, *Chapter / Unit Mastery / Deep Progression* are the established
    vocabulary.

---

## 23. BACKEND ASSUMPTIONS GEMINI CAN SAFELY RELY ON

These are guaranteed by the current implementation and can be built against without further
checking.

### Readiness and gating

- Readiness is computed **server-side** and re-derived on every write. The client displays it; it
  never computes it.
- The four essentials are identical across all three modes.
- `canGenerate` is true whenever the essentials are present, regardless of refinements.
- The route re-derives readiness at generate time, so a UI that enables the button optimistically
  still gets a structured 422 with `missing` codes rather than a silent failure.
- Readiness states are a closed set: `NEEDS_CORE_INFO`, `RESEARCH_AVAILABLE`,
  `NEEDS_SCOPE_CONFIRMATION`, `READY_FOR_DRAFT`, `ADVANCED_REFINEMENT_AVAILABLE`.

### Inference the UI can lean on

| The student omits | The backend supplies |
| --- | --- |
| Subject | The goal title |
| Exam format / approach | `UNSPECIFIED` / `STANDARD` |
| Session length | 45 minutes |
| Recovery reserve | The mode's own default |
| Roadmap qualification | `level · board`, or null |
| Roadmap granularity | `MONTH` beyond 70 days, else `WEEK` |
| Mastery unit title | The goal title |
| Mastery depth / exposure / check | `SOLID` / `NEW` / `MIXED_PRACTICE` |
| Preparedness | Unstated (`null`), never "not covered" |

### Availability and capacity

- The server distributes the weekly figure across the horizon; the client never computes a
  distribution.
- Account rest days, floating dates and existing committed work are known server-side and shown
  through `restWeekdays` / `scheduleWeeklyMinutes`.
- Capacity failure is a **post-generation** validation with a structured reason per day
  (`BLOCKED` / `OVER_CAPACITY`).

### Research and provenance

- Research runs only when asked; nothing searches on its own.
- With `researchPolicy = "OFF"` there are **zero** external calls — provider, fetcher and model —
  and no coverage or evidence data.
- A candidate carries `status` (`OK` / `WEAK` / `UNAVAILABLE`), `depth`, `coverage` (per-objective
  states `COVERED` / `PARTIAL` / `UNANSWERED` / `CONFLICTED`) and `evidence` (verified claims only).
- Coverage has **no model-authored field**. An objective is `COVERED` only with at least one
  server-verified excerpt.
- Source `sourceType` is derived from the host and the authority registry, never from page wording.
- Confirming a scope copies the referenced source records onto the brief and clears the candidate;
  from then on every ref resolves with no dependence on the run.

### Copilot

- One turn, bounded: ≤5 commands, ≤2 model passes, ≤600 characters, no loop, no tool call.
- Closed vocabularies for intents, commands, confirmations, clarifications, prerequisites and
  errors — so the UI can switch on codes rather than parsing sentences.
- Direct apply requires one command, `HIGH` confidence, a direct-list command, no hard constraint,
  no scope removal. Everything else is a proposal.
- Proposals are HMAC-signed, session-bound, version-bound, and expire after 30 minutes.
- `EXPLAIN` is legal in every lifecycle and never changes state; facts are server-assembled (≤6).
- The transcript is client-held and sent per request (last 8 turns, ≤2,400 chars).

### Persistence and identity

- The intake session survives a refresh; the brief is server-held and versioned.
- Every write is version-guarded: a stale writer gets a `409`, and the UI already handles
  re-applying the last change.
- Confirming the plan creates the plan and its Quests atomically; **nothing is created before
  confirmation.**

---

## BACKEND CHANGES REQUIRED FOR THIS REDESIGN: NO

**The redesign is buildable entirely on the existing backend.** The guided three-step flow, the
compact plan summary, the persistent Copilot panel, the mobile bottom sheet, and every piece of copy
in §21 use only capabilities that already exist and are already tested.

The gaps found during this audit are **not frontend-blocking**. They are listed here so that Gemini
designs around them instead of discovering them, and so a future phase can decide whether they are
worth closing.

### Gap 1 — The Copilot cannot upload or switch to an uploaded syllabus

`CAPABILITY_COMMANDS` contains `REQUEST_SCOPE_RESEARCH`, `REQUEST_CURRICULUM_COMPARISON`,
`REQUEST_DRAFT_EDIT`, `REQUEST_REPLAN` and `RELEASE_GENERATED_ITEM`. **There is no import command.**

*Consequence:* the message *"Use my uploaded syllabus instead"* cannot be honoured. The rest of the
example messages in this spec can.

*Frontend answer (no backend change):* the Copilot refuses with a closed code and the panel offers a
control that routes to the scope step. Do not present upload as a conversational capability.

*If it were ever added:* it would be a new capability command, which is a real (if small) backend
change — explicitly out of scope here.

### Gap 2 — The Copilot sees at most 60 scope units

`PlannerCopilotContextV1.scopeUnits` is capped at **60**, while a confirmed scope may hold up to
**200** nodes.

*Consequence:* on a large roadmap, a request about a unit beyond the first 60 resolves as
`UNKNOWN_REFERENCE` rather than being understood.

*Frontend answer:* none needed for the redesign; behaviour is a refusal, not a wrong answer. Worth
knowing so the Copilot is not advertised as understanding the whole of a very large scope.

### Gap 3 — There is no conversation store

Confirmed in `copilot/client.ts`: turns live in the tab and travel with each request. A refresh
loses them.

*Frontend answer:* the persistent panel holds turns in component state and promises nothing more.
This constrains the *copy*, not the layout.

### Gap 4 — Mastery's depth, prior exposure and check preference are unreachable from Quick Plan

The adapter hard-codes `SOLID` / `NEW` / `MIXED_PRACTICE`, and no Copilot command sets them.

*Consequence:* a Mastery student who has already studied the unit gets a plan built for a beginner
unless they use Advanced Setup.

*Frontend answer, and the recommended one:* route it through **preparedness**, which is a real
Copilot command and already in Quick Plan. Marking units `Studied, not rated` or `Okay` tells Sylf
more than `priorExposure` would. If a future phase wants the fields themselves in the guided flow,
that is a backend change (a new command or an adapter read of the brief) — **not required for this
redesign.**

---

*End of specification. No React, CSS, backend, API, validation, schema, research or quota code was
modified in producing it.*
