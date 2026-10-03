# Sylf AI Planner — Experience & Research Addendum v1.0

**Date:** 26 September 2026  
**Status:** Product requirements / implementation specification  
**Scope:** Major UX and product upgrade to the existing Planner Modes system after Phases 0–6.  
**Relationship to prior work:** Additive to the existing AI Planner Modes PRD, Planning Intelligence Addendum, and Phases 0–6. This document changes the planner intake/research/user experience substantially while preserving the validated planning, safety, lineage, quota, materialization, and replanning foundations already built.

---

## 1. Executive summary

The Planner Modes backend is substantially more intelligent than the current user experience communicates. The current Exam Planner asks the student to manually construct nearly all of the information that the AI later consumes: course name, topic list, exam date, daily availability, per-topic coverage, confidence, difficulty, priority, session preferences, and additional assumptions. This makes the planner feel like a long form with AI attached to the end rather than an AI product.

The product direction of this addendum is simple:

> **Sylf should do the research, organization, comparison, and first-pass structuring. The student should confirm, correct, and contribute only the information that only they can know.**

The default planner experience becomes a conversational, AI-assisted setup with a live structured Plan Brief beside it. A typical student should be able to describe the goal in natural language, provide a target date and a weekly study-time budget, confirm the syllabus Sylf found or imported, make a quick correction to preparedness if needed, and generate a first draft without manually entering dozens of topics or filling a card for every topic.

The existing detailed controls remain available as **Advanced setup**, not as the default path.

---

## 2. Why this upgrade is necessary

### 2.1 Current experience diagnosis

The current six-step Exam Planner has several compounding sources of friction:

1. **The experience announces itself as a long process.** “Step 1 of 6” makes the user expect a multi-minute setup before they have received any value.
2. **The user must manually provide the syllabus.** A student preparing for a known exam may have to open a textbook or syllabus and type 20–40 chapters/topics line by line.
3. **Availability is over-specified.** The default interface asks for minutes for every weekday even when a single weekly study-time budget would be enough for most students.
4. **Preparedness data scales linearly with topic count.** Every topic receives its own large card with coverage, confidence, difficulty, and priority controls.
5. **The most intelligent questions arrive last.** Smart Setup appears only after the user has already supplied most of the information manually.
6. **AI is mostly invisible until generation.** The student does the data preparation and only then asks the model to generate a plan.
7. **The final “Review your assumptions” page feels like more setup rather than value.** By that point the user has already done the hard work.

This is particularly poor for exams with broad syllabi. With 30–40 topics, the user can reasonably feel that they created the plan themselves.

### 2.2 Product failure mode

The current planner optimizes for **complete structured input before generation**. The desired product should optimize for **minimum user effort before useful AI output**, while preserving deterministic correctness on the server.

The system should therefore move from:

`FORM → FORM → FORM → FORM → FORM → AI`

to:

`TELL SYLF → SYLF RESEARCHES/STRUCTURES → USER CONFIRMS → AI DRAFT → USER REFINES`

---

## 3. Product thesis

### 3.1 Core principle

Sylf should ask the user only for information the user is uniquely qualified to provide.

**Sylf can do:**
- identify a known exam or course;
- find an official syllabus when web research is available;
- extract a syllabus from a PDF, photo, pasted outline, or table of contents;
- normalize a 40-topic list into a hierarchy;
- compare a target curriculum with a student's stated prior curriculum;
- identify likely overlap, partial overlap, and likely gaps;
- read the user's existing Sylf schedule, rest days, and already-planned work;
- distribute a weekly study budget across available days;
- derive capacity and validate feasibility;
- propose priorities when they are supported by a user instruction or a documented official source;
- ask only the high-value follow-up questions that materially change the plan.

**The user is uniquely qualified to provide:**
- what they are preparing for when Sylf cannot confidently identify it;
- their target date when it is not known;
- how many hours per week they realistically want to dedicate;
- hard schedule limitations Sylf does not know;
- whether Sylf's syllabus or curriculum mapping is wrong;
- subjective confidence or difficulty where it matters;
- personal priorities;
- final approval of plan assumptions and any execution-changing replan.

### 3.2 Default behavior

The planner should **prefill and propose** rather than present blank forms.

Every major input should follow this hierarchy:

1. Reuse reliable existing Sylf data when applicable.
2. Research or extract what can be established externally.
3. Infer only safe, non-personal structural facts.
4. Ask the user only for the remaining material unknowns.
5. Let the user override anything before generation.

---

## 4. Goals and non-goals

### Goals

- Reduce typical setup time to approximately **60–90 seconds** for a known exam with a discoverable syllabus.
- Make AI visibly useful before plan generation.
- Remove mandatory per-day availability entry from the default path.
- Remove mandatory per-topic preparedness entry from the default path.
- Support 30–40+ topic/chapter scopes without making setup scale linearly in effort.
- Add a small conversational Planner Copilot that can modify the structured plan requirements from natural-language instructions.
- Allow research-backed syllabus discovery and curriculum comparison with clear provenance and user confirmation.
- Keep the existing deterministic validators, hard constraints, safety rules, lineage, Core/Stretch semantics, Coverage Map, A1/A2/A3 intelligence, and Phase 5 user-approved replanning.
- Preserve Classic Planner as an independent fallback.

### Non-goals

- Do not let web research silently override the user's supplied scope.
- Do not claim that curriculum overlap equals personal competence or mastery.
- Do not invent official exam weighting, pass marks, or topic importance.
- Do not turn the Planner Copilot into an unrestricted general-purpose chat surface.
- Do not allow chat to silently mutate a confirmed plan or live Quests.
- Do not remove detailed controls; move them behind Advanced setup.
- Do not replace deterministic server validation with model judgment.

---

## 5. Success criteria

The redesign should be evaluated against user effort, not just generation validity.

### Primary product targets

- A known exam can reach **Ready to generate** with no manual syllabus typing.
- The default availability step requires **one weekly-hours input** unless the user chooses customization.
- Per-topic preparedness is optional; the user may generate with confidence unknown.
- A 40-topic syllabus is reviewable without 40 large cards.
- The typical user sees no more than **3 material follow-up questions** before first draft.
- The planner can generate a valid first draft without requiring the user to open a textbook just to copy chapter names.
- The student can understand what Sylf researched and correct it before it becomes authoritative input.
- The user can modify requirements conversationally without redoing the wizard.

### Instrumentation targets

Track content-free metrics for:
- time from Planner entry to first valid draft;
- abandonment before generation;
- number of manual fields touched;
- number of manually entered topics;
- number of AI-sourced topics accepted/edited/removed;
- number of Planner Copilot turns before generation;
- percentage of plans generated from Quick Plan versus Advanced setup;
- average count of per-topic preparedness edits;
- source-confirmation acceptance rate;
- first-draft confirmation/edit/regeneration rate.

---

## 6. New information architecture

The new Planner experience has two layers:

### Layer A — Quick Plan (default)

A conversational Planner Copilot plus a live **Plan Brief**.

Typical flow:

`Describe goal → identify mode → establish target/date/background → research/import scope → confirm scope → set weekly hours → resolve 0–3 material uncertainties → generate`

### Layer B — Advanced setup (optional)

Detailed access to:
- day-by-day availability;
- blocked dates;
- recovery reserve;
- per-topic coverage/confidence/difficulty/priority;
- session-length preferences or hard caps;
- mock/check details;
- all current mode-specific fields.

Advanced setup should be reachable at any time but should never be the price of entry.

---

## 7. Planner home redesign

The planner landing should stop feeling like a gateway to a form.

### Recommended primary entry

**Heading:** “What are you preparing for?”

A large conversational input:

> “I have the NUST NET on 15 November. I’m an A-Level student taking Maths, Physics and Computer Science, and I can study around 10 hours a week.”

Actions:
- **Plan it**
- Attach syllabus / PDF / photo
- Paste an outline

Secondary mode shortcuts may remain:
- Exam
- Course roadmap
- Chapter / unit mastery

But mode selection can also be inferred from the request and confirmed when ambiguous.

### Existing plans

Existing confirmed plans should appear below the creation surface. The page should not open with a large empty “Prepare for an Exam” card when the stronger action is simply to tell Sylf the goal.

---

## 8. The Planner Copilot

### 8.1 Purpose

The Planner Copilot is a small, focused conversation beside the structured planner. Its job is to transform natural-language instructions into safe changes to the Plan Brief.

It is not the normal System AI chat. It is a planner-specific interface with a bounded action vocabulary.

### 8.2 Recommended layout

On desktop:
- **Left:** compact chat thread / composer.
- **Right:** live structured Plan Brief.

On mobile:
- chat first;
- Plan Brief as a collapsible drawer/section;
- sticky “Generate draft” only when requirements are sufficient.

### 8.3 Example

**User:** “I’m doing the NET in November. I’m an A-Level student.”

**Sylf:** “I can help with that. Which NET stream are you taking, and roughly how many hours per week do you want to dedicate?”

**User:** “Engineering. About 10 hours.”

**Sylf:** “I found the current official NET Engineering scope and can compare it with your A-Level subjects. Which A-Level subjects and exam board are you taking?”

**User:** “CAIE Maths, Physics and Computer Science.”

**Sylf:** “I mapped the overlap. I found several areas likely covered by your background, a few partial overlaps, and several likely curriculum gaps. Review the scope before I use it.”

The Plan Brief updates alongside the conversation.

### 8.4 Planner Copilot actions

The assistant may propose or execute bounded structured actions only when authorized by the user's message:

- set planner mode;
- set exam/course/unit name;
- set target date;
- set subject/background curriculum;
- set weekly study hours;
- set unavailable days or blocked dates;
- research syllabus;
- import/extract syllabus;
- add/remove/rename/group topics;
- compare target syllabus with background curriculum;
- apply bulk coverage suggestions;
- set or clear confidence/difficulty/priority for selected topics;
- set hard versus soft session constraint;
- update recovery reserve;
- request plan generation;
- after confirmation, start the existing explicit replan flow.

### 8.5 Mutation rule

Before first generation, an explicit instruction such as “make Friday unavailable” may update the Plan Brief immediately and visibly.

An ambiguous suggestion should produce a preview or confirmation.

After a plan is confirmed, **all execution-changing changes continue to use Phase 5's proposal → diff → explicit confirmation → atomic reconciliation flow.** Chat never bypasses this.

---

## 9. The Plan Brief

The Plan Brief is the source of truth the user can inspect before generation.

It should show compact cards/rows for:
- Goal / mode
- Exam/course/unit
- Target date
- Background curriculum
- Scope source
- Scope count
- Weekly study budget
- Rest/unavailable days
- Recovery reserve
- Preparedness summary
- Hard constraints
- Soft preferences
- Research sources
- Open questions

Each row supports **Edit**. Complex detail expands on demand.

The user should never need to remember what they told the chat; the structured brief makes every assumption visible.

---

## 10. AI-assisted syllabus discovery

### 10.1 Default hierarchy

When the user names a known exam/course:

1. Attempt to identify an official current syllabus or official exam scope.
2. Prefer official primary sources.
3. Show the source and version/date when available.
4. Extract and normalize a hierarchical scope.
5. Ask the user to confirm the result before it becomes authoritative planner input.

### 10.2 Source priority

Preferred order:

1. Official exam body / university / admissions authority.
2. Official syllabus or specification PDF.
3. Official subject page or official curriculum document.
4. Official FAQ/handbook.
5. Reputable secondary source only when a primary source cannot be found.

Secondary sources must be visibly labeled as such.

### 10.3 No silent syllabus invention

If Sylf cannot confidently establish the scope:

> “I couldn’t verify an official syllabus for this. Upload the syllabus, paste the outline, or enter the topics yourself.”

Manual input remains the fallback, not the default.

### 10.4 User confirmation

Research output must be shown as a reviewable tree/list:

- Mathematics
  - Algebra
  - Functions
  - Sequences and series
- Physics
  - Mechanics
  - Electricity

Actions:
- Use this scope
- Remove selected
- Add missing topic
- Upload a different syllabus
- Use my own scope instead

Only confirmed scope becomes authoritative.

---

## 11. File and image intake

The user should be able to supply scope through:
- PDF syllabus;
- photo/screenshot of a contents page;
- pasted text;
- document upload;
- copied course outline.

Sylf extracts a hierarchy and asks for confirmation.

### Requirements

- Preserve headings and nesting where possible.
- Deduplicate repeated topic names conservatively.
- Never silently omit content because the input is large; segment and summarize with an explicit review.
- Show source filename/page context when useful.
- Do not treat extraction as evidence of personal coverage or confidence.

---

## 12. Curriculum comparison (“What do I probably already know?”)

This is one of the signature AI features of the new experience.

### 12.1 Use case

A student says:

> “I’m an A-Level student preparing for the NUST NET.”

Sylf may compare:
- the confirmed NET target syllabus;
- the relevant official A-Level syllabus for the student's exam board/subjects;
- optionally other background curricula the user names.

### 12.2 Output vocabulary

Curriculum overlap uses a separate vocabulary from confidence/mastery:

- **LIKELY_COVERED_BY_CURRICULUM**
- **PARTIAL_OVERLAP**
- **LIKELY_NEW_TO_CURRICULUM**
- **UNCLEAR**

These describe curriculum overlap only.

They must never mean:
- the user remembers it;
- the user is confident;
- the user is proficient;
- the user has mastered it.

### 12.3 Confirmation

Show a grouped summary:

**Likely familiar from your curriculum** — 14 topics  
**Partial overlap** — 7 topics  
**Likely new** — 5 topics  
**Unclear** — 2 topics

Then ask:

> “Does this roughly match what you’ve studied?”

Allow one-click corrections or drill-down.

### 12.4 Evidence

The comparison should retain compact provenance:
- target source;
- background curriculum source;
- retrieval date/version when known;
- mapping confidence / uncertainty.

Do not store full scraped pages in Planner snapshots.

---

## 13. Weekly study budget instead of seven daily minute fields

### 13.1 Default input

Replace the default seven-field availability form with:

**How much time can you realistically give this each week?**

Quick choices:
- 3 hours
- 5 hours
- 8 hours
- 10 hours
- 15 hours
- Custom

Or a compact numeric input:

`10 hours / week`

### 13.2 Distribution

Sylf distributes the weekly budget using:
- existing global rest days;
- known unavailable days;
- existing Quests/workload;
- hard constraints;
- user preferences;
- reasonable load balancing.

The server remains authoritative for exact date capacity.

### 13.3 Optional detail

Below the weekly budget:

> “Use my normal Sylf schedule” — default when available.

Then:

**Customize days**

Only when expanded does the current detailed day-by-day editor appear.

### 13.4 Why this is better

Most students know “I can give this about 8 hours a week” more easily than they know exact minutes for every weekday. The planner can do the distribution work and surface conflicts only when needed.

---

## 14. Preparedness should be optional, fast, and scalable

### 14.1 No mandatory per-topic cards

The user must be allowed to generate without rating every topic.

Unknown confidence is valid input.

### 14.2 AI prefill

Where curriculum comparison exists, Sylf may prefill **coverage suggestions** only.

Examples:
- “Likely studied before”
- “Likely partial overlap”
- “Likely new”

It must not prefill subjective confidence as fact.

### 14.3 Quick preparedness matrix

When the user chooses to refine preparedness, use a dense matrix rather than large cards.

Example:

| Topic | Not studied | Weak | Okay | Strong | Difficult | Priority |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| Algebra | ○ | ● | ○ | ○ | □ | ☆ |
| Functions | ○ | ○ | ● | ○ | □ | ☆ |
| Matrices | ● | ○ | ○ | ○ | ☑ | ★ |
| Trigonometry | ○ | ○ | ○ | ● | □ | ☆ |

One click sets a confidence state. No dropdown open + option click for every row.

### 14.4 Interaction requirements

- Entire radio target at least 44 px on touch where possible.
- Keyboard arrow navigation across confidence choices.
- Bulk apply to selected rows.
- “Apply to chapter” / “Apply to all untouched”.
- Collapse by section/chapter.
- Sticky column headers on desktop.
- Mobile uses compact row cards with segmented buttons rather than a wide horizontal table.
- `Unknown` remains a valid untouched state.

### 14.5 Priorities

Priority should default to neutral.

If official weighting is documented, Sylf may show:

> “The official source gives this section higher weighting.”

If weighting is not documented, Sylf must not invent it.

---

## 15. Ask only high-value follow-up questions

The existing Smart Setup logic should become conversational and earlier.

Instead of a final page titled “Review your assumptions,” Sylf asks a material question at the moment it becomes relevant.

Examples:

> “You said 45-minute sessions. Is that a hard limit, or should I just try to stay around it?”

Buttons:
- Prefer 45 minutes
- Never exceed 45 minutes

Or:

> “You entered ‘Algebra’ as one topic. Is that a single chapter or a larger section?”

Buttons:
- One chapter/unit
- Several subtopics
- Full section/module

### Rules

- 0–3 questions by default.
- One question at a time in chat.
- Closed choices when possible.
- Explain why only when it helps the decision.
- If no answer materially changes the plan, do not ask.
- The user can say “just use your best judgment” for soft assumptions.

---

## 16. Generate sooner, refine afterward

The planner should explicitly allow a first draft before every optional detail is known.

When required information is sufficient:

> **I have enough to make a first draft.**  
> You can fine-tune confidence, priorities, or schedule assumptions now or after you see the plan.

Actions:
- **Generate my plan**
- Fine-tune first

This is a core product rule: editing an existing draft is usually lower-friction than constructing a perfect input state from nothing.

---

## 17. Research timing

Research happens in two bounded layers.

### Layer 1 — Scope research

Triggered early when needed to construct the Plan Brief:
- identify official syllabus;
- extract topics;
- identify exam structure where officially documented;
- compare relevant curricula.

### Layer 2 — Generation research

Triggered only after the user confirms the Plan Brief and requests generation. It may gather additional bounded context needed for a better plan, such as official format constraints or source-backed topic relationships.

### Constraints

- No open-ended browsing loop.
- No autonomous external research after plan confirmation unless the user explicitly requests replan/research.
- Research results are summarized into bounded structured context.
- Every important external factual claim used to build scope should be traceable to a source.

---

## 18. Plan Brief readiness model

The client should not treat all fields as equally required.

### Required before first draft

For Exam:
- identifiable goal/exam;
- confirmed scope or explicit user-supplied scope;
- exam/target date;
- some usable study-capacity input (weekly budget or detailed availability).

### Optional but useful

- background curriculum;
- coverage suggestions;
- confidence;
- difficulty;
- priority;
- mock preference;
- preferred session length;
- soft constraints.

### Readiness states

- **NEEDS_CORE_INFO**
- **RESEARCH_AVAILABLE**
- **NEEDS_SCOPE_CONFIRMATION**
- **READY_FOR_DRAFT**
- **ADVANCED_REFINEMENT_AVAILABLE**

The UI should communicate readiness positively rather than showing “Step 4 of 6.”

---

## 19. Mode-specific adaptation

### Exam Planner

Best candidate for research-heavy Quick Plan:
- identify exam;
- official scope;
- background-curriculum comparison;
- target date;
- weekly budget;
- optional preparedness sweep;
- generate.

### Course / Syllabus Roadmap

Typical Quick Plan:
- identify course/qualification;
- import/research syllabus;
- target completion date;
- weekly budget;
- optional priority areas;
- generate strategic roadmap.

Do not create daily Quests until explicit expansion, preserving Phase 3.

### Chapter / Unit Mastery

Typical Quick Plan:
- subject/unit name;
- optionally upload chapter contents/pages/outline;
- current exposure in one sentence;
- weekly budget or target date;
- generate staged Mastery progression.

No need to ask per-subtopic confidence unless it materially changes the sequence.

---

## 20. Advanced setup

Advanced setup should preserve the power of the current UI without imposing it on everyone.

Sections:
- Scope hierarchy
- Weekly budget / detailed daily schedule
- Blocked dates
- Recovery reserve
- Topic preparedness matrix
- Priorities
- Hard constraints
- Soft preferences
- Mock/check details
- Research sources

This should be a single editable configuration surface, not another six-step wizard.

---

## 21. AI action architecture

The Planner Copilot should never directly edit arbitrary database rows. It should call bounded server-side planner actions that update a structured working brief.

Conceptual actions:

- `setGoal`
- `setTargetDate`
- `setWeeklyBudget`
- `setBackgroundCurriculum`
- `researchScope`
- `importScope`
- `confirmScope`
- `updateScopeUnits`
- `compareCurricula`
- `bulkSetCoverage`
- `bulkSetPreparedness`
- `setConstraint`
- `setPreference`
- `markUnavailableDay`
- `setRecoveryReserve`
- `requestGeneration`

The model proposes typed action arguments. The server validates them against the same contracts used by the Planner UI.

No action may bypass:
- ownership;
- bounds;
- hard-constraint validation;
- scope confirmation;
- quota rules;
- Phase 5 confirmed-plan reconciliation.

---

## 22. Working brief persistence

The implementation should preserve the existing PlannerPlan/PlannerRevision model as the durable authority for generated plans.

For pre-generation conversational setup, choose the smallest persistence mechanism that supports:
- refresh recovery;
- chat/brief synchronization;
- bounded research-source metadata;
- idempotent action application;
- expiry/cleanup.

Preferred order:

1. Reuse an existing PREPARING operation or bounded draft structure if semantically correct.
2. Otherwise add one narrow `PlannerBrief` / `PlannerIntakeSession` persistence concept.
3. Do not overload sealed PlannerRevision snapshots or Quest metadata.

The brief is not execution history and must not be confused with a confirmed plan revision.

---

## 23. Research-source data model

Store only bounded provenance needed to explain and reproduce scope construction:

- source URL;
- source title;
- source type (`OFFICIAL`, `OFFICIAL_PDF`, `SECONDARY`, `USER_UPLOAD`);
- publisher/domain;
- retrieved date/time;
- version/date if explicitly present;
- source hash or stable identifier when practical;
- extracted topic identifiers/labels;
- mapping confidence enum.

Do not store full copied web pages in Planner snapshots.

---

## 24. Authority model

The final authority order for planning inputs is:

1. **Explicit current user instruction**
2. **Confirmed user-edited Plan Brief**
3. **Confirmed research/import result**
4. **Existing Sylf schedule/account data**
5. **Learned SOFT preferences**
6. **Model suggestion**

A lower-authority source can never silently override a higher one.

Hard constraints remain deterministic authority.

---

## 25. Research correctness and trust

### Must do

- Prefer current official sources.
- Show source provenance before using discovered scope.
- Distinguish official facts from model organization.
- Mark uncertainty.
- Let the user correct scope.
- Revalidate dates and capacity on the server.

### Must not do

- invent official topic weightings;
- infer the user's mastery from curriculum overlap;
- silently merge conflicting syllabi;
- use a stale cached syllabus without surfacing its version/date when known;
- silently drop scope because the plan does not fit;
- treat a secondary prep website as official.

---

## 26. Handling large syllabi

A 40-topic exam should not produce a 40-card onboarding page.

### Requirements

- hierarchical sections;
- collapsed groups by default;
- search/filter topics;
- bulk select;
- bulk preparedness actions;
- summary counts;
- only surface exceptions/uncertainties;
- virtualize long lists if rendering warrants it;
- keep full authoritative scope server-side even when the UI is collapsed.

### Suggested summary

> 42 topics found  
> 21 likely familiar from your curriculum  
> 9 partial overlap  
> 8 likely new  
> 4 uncertain

Then show the 4 uncertain topics first.

---

## 27. Fallbacks

### Unknown exam

Ask for one of:
- official link;
- uploaded syllabus;
- photo;
- pasted outline;
- manual topics.

### Research unavailable

Do not block the planner. Fall back to upload/paste/manual.

### Conflicting sources

Show both and ask which one applies.

### Huge scope

Segment explicitly. Suggest Course Roadmap when the scope is truly course-sized.

### User wants no research

Provide “Use only what I give you.”

---

## 28. Privacy and security

Preserve all existing planner security invariants.

Research and Planner Copilot must not expose:
- service-role credentials;
- private plan content to public logs;
- full user academic content in telemetry;
- chain-of-thought;
- raw provider prompts/responses in analytics.

User uploads remain private.

Telemetry stays content-free.

Research URLs/titles may be stored as provenance, but private uploaded content should be referenced by owned file identity rather than copied into telemetry.

---

## 29. Quota and cost model

The product should avoid making every short Copilot turn consume a full weekly planner allowance.

Recommended model:

- Lightweight deterministic edits: no AI quota.
- Planner Copilot clarification turn: bounded chat/research allowance or existing AI usage layer.
- Syllabus research/import: bounded per intake session.
- Final generation: existing `planner` quota.
- Roadmap expansion: existing `plannerExpansion` quota.
- Replanning: existing `plannerRebalance` quota.

Do not allow unbounded research loops.

The exact quota implementation should reuse the existing usage-limiter infrastructure rather than create a parallel billing system.

---

## 30. Latency and progressive feedback

The experience should feel active before the final plan exists.

While researching:

> Finding the official syllabus…  
> Extracting 38 topics…  
> Comparing with your CAIE A-Level subjects…  
> Ready for your review.

Do not fake progress percentages.

The user should be able to edit other brief fields while research runs if concurrency is safe.

---

## 31. Mobile UX

Mobile must not reproduce a desktop matrix at full width.

Recommended mobile preparedness row:

**Algebra**  
`Not studied` `Weak` `Okay` `Strong`  
`Difficult` toggle · `Priority` star

Chapter groups collapse.

The Planner Copilot becomes the primary surface; the Plan Brief opens as a bottom sheet or stacked section.

Primary actions remain reachable with one thumb and roughly 44 px targets.

---

## 32. Accessibility

- Real buttons/radios/checkboxes.
- Matrix state announced with accessible labels.
- Keyboard-friendly row navigation.
- No color-only meaning for confidence/overlap states.
- Research-source status announced as text.
- Loading/research progress uses `aria-live` appropriately.
- Collapsible scope groups use native disclosure or correct ARIA.
- Focus returns predictably after applying a Copilot action.

---

## 33. Example end-to-end flow: NUST NET + A Levels

### User message

> “I’m an A-Level student preparing for the NUST NET Engineering exam on 15 November. I can study about 10 hours a week.”

### Sylf

1. Detects Exam mode.
2. Identifies NET Engineering.
3. Asks one material question: which A-Level subjects / exam board?

### User

> “CAIE Maths, Physics and Computer Science.”

### Sylf research

- Finds the current official NET scope/source.
- Finds relevant official CAIE subject syllabi.
- Builds a topic hierarchy.
- Maps curriculum overlap.

### Sylf response

> “I found 36 target topics. Based on the curricula, 17 look likely familiar, 8 partially overlap, 7 look likely new, and 4 are unclear. This is curriculum overlap, not a judgment of how well you know them.”

The UI shows sources and the grouped scope.

### User

> “Looks right, but matrices are weak for me and I haven’t done sequences properly.”

### Copilot actions

- Mark Matrices confidence = weak.
- Mark Sequences coverage = not studied / low confidence.

### Sylf

> “Got it. I’ll prioritize those without treating the other topics as mastered. I’ll use your 10-hour weekly budget and your normal Sylf rest days. I have enough to make a first draft.”

### User

**Generate my plan**

Only now does final plan generation consume the normal planner generation allowance.

This flow should take roughly one minute of active user effort, not ten minutes of form filling.

---

## 34. Example flow: user already has a syllabus

User uploads a PDF or photo.

Sylf:

> “I extracted 28 topics across 6 sections. I’m not going to research a different syllabus unless you ask. Review the extracted structure.”

User confirms.

Sylf asks:
- target date;
- weekly hours;
- at most 0–3 material questions.

Generate.

---

## 35. Example flow: fast manual mode

Some users will want zero research.

Provide:

**Use only what I give you**

Then accept:

> “Physics exam, November 12. Chapters 1–9 except chapter 6. 6 hours/week. I’m weakest at circuits and waves.”

Sylf parses the sentence into the Plan Brief and asks the user to confirm the extracted scope.

No multi-page wizard is required.

---

## 36. UX copy direction

Avoid administrative/form language.

Prefer:
- “Tell Sylf what you’re preparing for”
- “I found this syllabus”
- “Does this look right?”
- “How much time can you realistically give this each week?”
- “Anything here you know is especially weak?”
- “I have enough to make a first draft.”

Avoid:
- “Review your assumptions” as a mandatory final step;
- “Included topics — one per line” as the primary path;
- “Sunday · Minutes” / “Monday · Minutes” by default;
- repeated policy disclaimers that can be expressed more naturally once.

---

## 37. Backend compatibility requirements

This redesign must preserve the hard-won Phase 0–6 architecture.

Do not weaken or bypass:
- PlannerPlan / PlannerRevision / PlannerQuestLink;
- PlannerCheckResult;
- PlannerPreference / PlannerFrictionEvent;
- strict contracts;
- capacity authority;
- date-only semantics;
- generation budgets;
- semantic critic / targeted repair;
- Core/Stretch safety;
- Coverage Map semantics;
- explicit confirmation;
- Phase 5 atomic replan reconciliation;
- no automatic mastery claims;
- Classic Planner isolation.

The new UX should produce better inputs for the same trusted planning engine.

---

## 38. Recommended implementation workstreams

### Workstream A — Quick Plan shell

- New Planner landing.
- Natural-language goal input.
- Plan Brief.
- Weekly-hours default.
- Advanced setup drawer.
- Remove six-step presentation from default path.

### Workstream B — Scope import and research

- Official syllabus discovery.
- Upload/photo/PDF extraction.
- Source provenance.
- Hierarchical scope confirmation.
- No silent external syllabus changes.

### Workstream C — Curriculum comparison and fast preparedness

- Background curriculum input.
- Research-backed overlap map.
- Compact preparedness matrix.
- Bulk actions.
- Uncertainty-first review.

### Workstream D — Planner Copilot

- Bounded action schema.
- Chat-to-brief updates.
- Inline follow-up questions.
- Refresh recovery.
- Confirmed-plan changes routed into existing replan flow.

### Workstream E — Quality closure

- End-to-end manual browser QA.
- Known-exam flows.
- 40-topic scalability.
- Mobile.
- Research failure/fallback behavior.
- Time-to-first-draft and abandonment instrumentation.

Do not attempt all five workstreams in one uncontrolled refactor. Each should finish with regression against the Phase 0–6 planner suite.

---

## 39. Acceptance criteria

### Quick Plan

- A user can create an Exam draft without entering seven daily minute fields.
- A user can create an Exam draft without manually rating every topic.
- A user can enter one weekly-hours value and let Sylf distribute capacity.
- Detailed daily customization remains available.

### Research

- A known exam can load a reviewable sourced syllabus.
- Research cannot silently become authoritative without confirmation.
- If no trustworthy source exists, the UI falls back safely.
- Source provenance is visible.

### Curriculum comparison

- Target and background curriculum can be compared.
- Output uses overlap language, not mastery/confidence claims.
- User corrections override the mapping.

### Preparedness

- 40 topics can be reviewed efficiently.
- One-click confidence selection works.
- Bulk actions work.
- Unknown is valid.
- The user can skip the entire preparedness refinement.

### Planner Copilot

- Natural-language changes update the Plan Brief through typed actions.
- Every mutation is bounded and validated.
- Chat cannot bypass explicit confirmation for confirmed plans.
- The user can see the final structured state at all times.

### Existing architecture

- Existing Phase 0–6 planner tests remain green.
- Classic Planner remains independent.
- No direct client Prisma.
- No service-role exposure.
- No autonomous replan mutation.

---

## 40. Required test scenarios

At minimum:

1. Known exam + official syllabus + weekly hours → draft.
2. Known exam + background curriculum → overlap map → correction → draft.
3. Unknown exam → upload syllabus → extracted scope → draft.
4. User refuses research → manual natural-language scope → draft.
5. 40-topic syllabus → collapsed hierarchy + matrix without rendering/performance failure.
6. Weekly hours only → correct server capacity distribution.
7. Weekly hours + one unavailable day → redistributed capacity.
8. Advanced daily schedule overrides weekly default correctly.
9. User skips preparedness → valid plan still generated.
10. Copilot: “make Friday unavailable” updates brief.
11. Copilot: “matrices are weak” updates only Matrices.
12. Copilot: “remove chapter 6” requires explicit scope-change confirmation.
13. Research source conflict → user must choose.
14. Stale/failed research → safe fallback.
15. Confirmed plan chat change → enters Phase 5 replan proposal, not direct mutation.
16. Mobile 40-topic scope.
17. Keyboard-only preparedness matrix.
18. Dark/light/custom appearance.
19. Source provenance privacy and telemetry audit.
20. No external syllabus research when the user selected “Use only what I give you.”

---

## 41. Recommended rollout sequence

### Stage 0 — Instrument current flow

Measure abandonment and time-to-first-draft before changing the UX.

### Stage 1 — Low-friction local-only UX

Ship behind the existing Planner Modes feature flag:
- weekly-hours default;
- compact preparedness matrix;
- optional preparedness;
- Advanced setup;
- no research yet.

### Stage 2 — Research/import

Add:
- official syllabus discovery;
- file/image extraction;
- source confirmation.

### Stage 3 — Curriculum comparison

Add:
- background curriculum;
- overlap map;
- uncertainty-first review.

### Stage 4 — Planner Copilot

Add chat-to-brief actions after the underlying fields and research flows are proven.

### Stage 5 — UX quality gate

Manual browser testing, latency, analytics, accessibility, mobile, source correctness, and known-exam end-to-end trials.

Only after this should Planner Modes be reconsidered for enablement.

---

## 42. Product quality gate before public enablement

Public enablement should require evidence that the redesign actually solved the original problem.

Required evidence:
- normal known-exam setup does not feel like a six-step questionnaire;
- users do not need to manually enter 30–40 topics for known exams;
- the weekly-hours path is the default and works;
- per-topic preparedness is optional and efficient when used;
- Planner Copilot can materially reduce setup work;
- research is sourced and correctable;
- time-to-first-draft is materially lower than the old flow;
- the generated plan quality remains at least as strong as the Phase 6 validated engine;
- manual browser QA has been completed.

---

## 43. Final product principle

The Planner should feel less like configuring an AI system and more like delegating a planning problem to one.

The target interaction is:

> **“Here is what I’m preparing for, here is my situation, and here is how much time I have.”**

Sylf should respond:

> **“I found the scope, organized it, compared it with your background, identified what I’m unsure about, and built the assumptions. Check these few things, then I’ll make the plan.”**

That is the experience that makes the intelligence built in Phases 0–6 visible to the user.
