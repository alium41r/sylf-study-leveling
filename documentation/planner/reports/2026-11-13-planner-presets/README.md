# Planner presets, research and long plans — 13 November 2026

Branch `planner/planning-kernel`, after [syllabus-first exam planning](../2026-11-13-syllabus-planner/README.md). Current behaviour is in the [Studio contract](../../STUDIO.md).

## What the owner asked for

Presets the student picks before planning (five or more, plus Auto chosen by the model); a smarter composer with optional prompts; plans that can run for months; the settings sheet fixed; the seven-day box removed and the interface's text cut down; research when the model needs it; and real generations across different areas of education.

## Was research already integrated?

Not in the Planning Studio. The older V2 planner has a full research stack (`lib/planner/research/`: DeepSeek Search with Brave, Serper and SearXNG fallbacks, a safe page fetcher with address, redirect, size and PDF rules, extraction and evidence). The Studio never called it. It now does, through `lib/planner/studio/research.ts`, and only when the model asks.

## What was built

**Presets** (`PlanPreset`, compiled by `lib/planner/kernel/curriculum.ts`):

| Preset | Shape | Without a date |
| --- | --- | --- |
| Auto | The model picks one of the others while mapping the outline; without the model, `inferPreset` picks from the request's words | — |
| Exam | Revise and practise each topic in order, mixed reviews, timed papers with corrections and weak topics, light final day | 4 weeks |
| Whole course | Study then practise each topic in order; every three topics reviewed two days later and recalled again about ten days later; a timed checkpoint every six topics; the exam tail when it ends in an exam; up to six papers over a long course | about four days a topic, up to a year |
| Topic mastery | Subtopics studied and practised in the first half; recall checks at gaps of one, three, seven and fourteen days; a mastery test | 3 weeks |
| Skill | Per stage: a lesson, practice sessions (more for weak stages) and a milestone check, on about the student's days a week at their session length | as many weeks as the sessions need |
| Reading | Parts in order at a steady pace, a written recap every three parts, a final recap | about 1.6 days a part |
| Assignment | The existing research, outline, draft, revise, check breakdown | — |

**Composer.** Preset tiles (Auto first), one title field, the date with relative chips (2 weeks to 6 months), and prompts that each open one small field: hours a day, topics, board or level, weak spots, target, start date, notes, subject; days a week and session length for a skill. Hours a day becomes a hard daily cap for that plan (`goal_cap`, never below its longest sitting); weak spots mark those topics weak (more time, extra practice); board or level and the target go to the model and the catalog matcher; the start date delays the plan.

**Research.** The outline map returns `confidence` and, when it is not high, a `research` query. The server searches once, ranks official and educational hosts first, reads up to three pages, and maps again from them. The syllabus records `researched` and its sources, and the study guide names the hosts.

**Long plans.** Up to 40 topics; weekly budgets reach 52 weeks; plan phases take their dates from session windows beyond the detailed horizon; the guide's Days view adds a "Later" roadmap by week.

**Interface.** The seven-day box is gone and settings sit beside the command bar. The three Studio sheets (settings, new plan, tell the planner) had no padded scrolling body, which is why the settings content ran past the sheet's edge; they now use the same padded scroll as every other sheet, and settings use two selects instead of twenty chips. Copy was cut throughout: no explanatory paragraphs in the composer, the guide or the hero; "Why it's here" folds away in the inspector.

## Verification

| Check | Result |
| --- | --- |
| `KERNEL_PROPERTY_RUNS=1000 npm run test -- --run __tests__/planner/kernel` | 58 passed, including 1,000 random instances per property across every preset, pace and window |
| `npm run test -- --run __tests__/planner` | 1,767 passed, 267 skipped (opt-in database suites) |
| `node scripts/test/test-planning-studio-postgres.mjs` | 12 passed on disposable PostgreSQL, including the preset, pace and weak spots surviving into the stored proposal, and a whole course with weekly budgets |
| `npx tsc --noEmit`, ESLint on changed files | clean |
| `cd native && npm run typecheck && npm run test && npm run check:boundaries` | clean; 652 passed; no violations |
| `run-backend-local.mjs --studio --dev --with-deepseek` | 42 of 42 checks, no console errors: presets offered (Auto first), settings beside the command bar and the seven-day box gone, the composer's hours-a-day and weak-spot prompts reaching the plan (a 120-minute goal cap, Integration marked weak with extra practice), Auto choosing Exam from the catalog, every session placed and every day within 2 h, the settings sheet inside its width, and the model researching a course it was unsure of |
| `run-backend-local.mjs --generations --dev --with-deepseek` | six real generations, all proposed with every check passed and nothing unplaced; results below |

**Bugs found by these runs and fixed.**

- *A goal's preset, type and pace were lost.* `planFromOutline` held the goal object across `apply()`, which replaces the work model with a copy, so writes after the scope note landed on a stale object. The goal is now looked up after every operation (and in `decompose`'s fallback).
- *Same-day order (solver).* When two sessions of equal load and length shared a day, the one that depends on the other could take the first free time, leaving its predecessor nowhere to go. Placement within a day now goes in dependency order. This changes the `planning.solve` parity hash; the V8 value is re-recorded (`e7880522`) and the Hermes value still waits for the on-device run.
- *Crumbs (solver).* Two short pieces of one session on different days were discarded as crumbs before they were tried together. Pieces that make a full sitting are now joined first.
- *Tight daily limits.* Under a cap, sessions are sized to a whole, half, third or quarter of the day's allowance (never grown), a paper takes its real length when the day allows it, the number of papers fits what the last days can hold, the end of the plan gets the days its work needs, and the weak-topics session may use the light final day.
- *Labels.* Paper names are shortened for titles ("Paper 2", "Section I, Part A"); long topic names are cut at a word, never mid-word.
- *Skills.* Practice days are chosen per calendar week (the old spacing gave three days instead of four); an open-ended skill gets every session it needs; a short dated one drops extra practice and middle milestones before stages, then uses every day.
- *Answers in a proposal.* (From the previous change.) A question asked in an open proposal is answered on top of it.

## Generations

Six cases from `scripts/test/planner-generation-cases.json`, run as a new student through the real stream with DeepSeek V4.1 Flash and research enabled (DeepSeek Search). The full outlines, sessions and descriptions are in [`evidence/generations.md`](evidence/generations.md) and `generations.json`. The generations were run three times while fixing; the table describes the final run and notes what varied.

| Case | Area | Result | Correct? |
| --- | --- | --- | --- |
| KCSE Biology Paper 1 mock, 5 weeks, 2 h a day, weak in genetics and ecology | National board outside the UK and US (Kenya) | Exam. Researched (KNEC notes, teacher.co.ke and others). 16 topics in Form 1–4 order with concrete key points; Paper 1 as 2 h, 80 marks; genetics and ecology marked weak with extra practice; 47 sessions, 3 timed papers, every day at most 2 h | Mostly. Paper length and marks are right (an earlier run said 150 minutes). Two KCSE topics are missing in this run: Classification and Support and movement (an earlier run had Classification). The student would add them in the Topics view |
| EN2063 Signals and Systems, University of Moratuwa, whole module over 12 weeks, 90 min a day | Lesser-known university course (Sri Lanka) | Whole course. Researched; the University of Moratuwa ENTC handbook (ent.uom.lk) was among the sources. 12 topics from signal classification to the z-transform and filters, spaced reviews and a checkpoint test, 32 sessions to 4 Feb, no exam tail because no paper was named | Plausible and well ordered; the module's exact outline was not checked against the handbook by hand |
| AP US History, exam 7 May 2027, 1 h a day, aiming for a 5 | American high school, a whole year | Whole course with exam. No research (confident). The nine official periods (1491–1607 to 1980–present) plus the four exam skills; 52 sessions over six months with six timed mocks; most of it as weekly budgets beyond the four-week calendar | Content is right. Section timings varied between runs: the final run listed Section I as 55 min (it is 95 with short answers) and Section II as 95 (it is 100); an earlier run had both right |
| Edexcel A Level Economics A Paper 2, 6 weeks, weak in exchange rates and fiscal policy | A Levels, a non-Cambridge board | Exam. 12 topics covering Themes 2 and 4 (performance, AD/AS, growth, inflation, unemployment, balance of payments and exchange rates, policies, globalisation, trading blocs, developing economies) and exam technique; exchange rates marked weak; 3 timed papers | Coverage is right. The final run gave Paper 2 as 80 marks (it is 100, as an earlier run had). "Fiscal policy" did not match a topic name, so it was not marked weak |
| Conversational Spanish from scratch, 4 days a week, 30 min | Adult skill, no deadline | Skill. 10 stages from sounds and greetings to a ten-minute conversation; 56 sessions of 30 minutes on four days a week to mid-February | Sensible A1 progression. Earlier runs researched CEFR descriptors; this one did not |
| "Get really good at integration by parts and substitution", 2 weeks | Auto | Auto chose Topic mastery. 9 subtopics, recall checks at widening gaps, a mastery test on the last day; every session placed | Right. Before the prompt named academic techniques under mastery, one run chose Skill |

**What this says.** The structure of every plan is right and deterministic. The topic lists are good where the course is well known or researchable, and research visibly helped with the local syllabi (KCSE, Moratuwa, and Cambridge Chemistry in the live check). Paper metadata from the model (lengths and marks) varies between runs; where that matters, a catalog entry is the fix, which is why Cambridge 9709 and 9702 are in the catalog. Each generation took 5–20 s and one or two model calls (a search when the model was unsure); all the model calls in these runs cost a few cents.

## Not done, and what waits for the owner

- Not verified on the tablet, and the Hermes value of the `planning.solve` parity case still needs the on-device run.
- Catalog coverage is still Cambridge 9709 and 9702; KCSE, Edexcel, AP and others come from the model and research, with the accuracy described above.
- Nothing is merged, deployed or switched on in production. No migration: presets, pace and sources live in the existing JSON work model.
