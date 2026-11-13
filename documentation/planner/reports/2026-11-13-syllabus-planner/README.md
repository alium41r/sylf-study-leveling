# Syllabus-first exam planning — 13 November 2026

Branch `planner/planning-kernel`, on top of the [Planning Studio](../2026-11-13-planning-studio/README.md). Current behaviour is in the [Studio contract](../../STUDIO.md); this report says why it changed, what was built and how it was checked.

## The problem

The owner asked the Studio for "Maths mid term Complete Paper 1 CAIE A levels" and got thirteen sessions called "Study block 1: Maths mid term, paper 1 CAIE A levels complet", "Retrieval 1: …" and a diagnostic. None said what to study. Those titles are the strategy library's no-topic template (`scaffold()`), which runs when the model is unavailable or fails. Even with the model the result would have been generic: the prompt forbade naming any topic that was not one of the student's Sylf syllabus nodes, and capped a goal at 4–12 items. The planner knew how to schedule but had nothing to say about **what** to study.

## A blind reference

A Claude Haiku subagent was given only the student's message, with no Sylf context and no tools ([evidence](evidence/haiku-blind-plan.md)). It wrote what a tutor would: all eight Paper 1 topics in order, a topic a day with named subtopics, error log, two mixed-review days, a full timed paper, a marking day and a light formula-sheet day. It also included Paper 3 content (R-formulae, sec/cosec/cot, product and quotient rules, binomial for rational n, modulus) and missed volumes of revolution. The shape is right; model recall of a specific syllabus is not reliable enough to trust unchecked.

## The design: what, how, when

| Layer | Decides | Owner |
| --- | --- | --- |
| **What** the exam covers | Topics in syllabus order, three to seven key points each, weight, difficulty, the paper's real length | Sylf's checked catalog (`lib/planner/catalog/syllabi.ts`) when the request names a paper it holds; the student's typed list; one model call (`syllabus.map`); or, without the model, the student's own Sylf syllabus nodes. With none, the planner asks for the topics instead of inventing sessions |
| **How** to prepare it | Revise then practise each topic in order; mixed reviews of every three topics at least two days later; full timed papers each followed by corrections; weak topics; light formula-sheet review the day before; nothing new in the final 24 hours | The study-path compiler (`lib/planner/kernel/curriculum.ts`), deterministic and shared with the device |
| **When** | Exact days and times around the calendar, rest days and caps | The existing solver and verifiers, unchanged in contract |

The model's job shrinks to the one thing it is good at, recalling a course's content, and for the most common requests it is not needed at all. Every session carries an aim, key points and a method, which become the quest's description.

## What was built

- **Kernel.** `Syllabus`, `SyllabusUnit`, `ItemDetails` on goals and items (stored in the existing JSON work model, so no migration). `compileStudyPath` lays the path over the student's study days with date windows the solver honours, sizes sessions from topic weight, difficulty and the student's rating, compresses when time is short, and re-compiles with stable keys (`<goal>.rev.u3`) so ratings never disturb studied work or quest identity. `questDescription`, `editSyllabus`, `parseTopicList` (one a line, "Topics: a, b", "chapters 1 to 5"), `parseTopicCommand` ("I'm weak at integration", "trig isn't in my exam", "skip series") and `pathPhases`.
- **Solver fix.** "No new learning in the final 24 hours" was measured from each item's own window end, so a topic paced to finish on Tuesday could never be placed on Monday or Tuesday. It is now measured from the exam date.
- **Catalog.** Cambridge Mathematics 9709 Papers 1–6 and Physics 9702 Papers 1, 2 (AS topics 1–11) and 4 (A Level topics 12–25), with paper lengths and marks. A match needs the board, the level and the paper; "physics mechanics" never matches maths Paper 4.
- **Server.** `planFromSyllabus` in the workflows, streaming `unit` and `syllabus` events; the `syllabus` action; the topic command on the fast path; the critic no longer runs on syllabus goals; the detailed horizon reaches an exam up to 28 days away so its whole path is in the calendar; quests get `questDescription`, Sylf goals name the syllabus and its topics. Answering a question that exists only in the open proposal used to fail with "already answered"; it is now answered on top of that proposal.
- **Native.** An empty Studio opens on the composer (what it is, what's in it, when), after the web planner. The activity card shows a stage rail (your week, syllabus, study path, calendar, checks) and the topics as they arrive. Beside the calendar an exam's **study guide** has Plan (phases with real dates), Topics (key points, Weak/Okay/Strong, "In this exam", add a topic, "Topics look right") and Day by day. The inspector leads with the session's aim, key points and method. Narrow week columns label blocks by topic and kind instead of breaking titles mid-word. Older exam plans offer "Re-plan topic by topic".

For the owner's request (today Fri 13 Nov, exam Tue 1 Dec, Sundays off) the Studio now proposes, with no model call: Quadratics, Functions, Coordinate geometry, Circular measure, Trigonometry, Series, Differentiation and Integration, each as "… revision" then "… past paper practice" from Fri 13 to Mon 23 Nov; "Mixed review: Quadratics, Functions and Coordinate geometry" on Thu 19 and "Mixed review: Circular measure to Integration" on Thu 26; "Paper 1 timed past paper" (2 h: 1 h 50 m plus setting up) on Wed 25 with corrections and weak topics after it; a second paper on Fri 27 and its corrections on Sat 28; and "Formula sheet and final review" on Mon 30. 24 sessions, every one placed, quality 99.

## Verification

| Check | Result |
| --- | --- |
| `npm run test -- --run __tests__/planner` | 1754 passed, 265 skipped (opt-in database suites) |
| `KERNEL_PROPERTY_RUNS=1000 npm run test -- --run __tests__/planner/kernel` | 45 passed; 1,000 random exams (1–14 topics, 8–28 days, random caps and rest days) with no hard-check failure |
| `node scripts/test/test-planning-studio-postgres.mjs` | 11 passed on disposable PostgreSQL, including a plan from the student's own syllabus nodes and "ask for the topics, then answer in the proposal" |
| `npx tsc --noEmit`, ESLint on changed files | clean |
| `cd native && npm run typecheck && npm run test && npm run check:boundaries` | clean; 652 passed; no violations |
| `run-backend-local.mjs --studio --dev --with-deepseek`, run 1 | 36 of 36 checks, no console errors ([evidence](evidence/)) |
| Run 2, after the catalog, fallback and label changes | 36 of 36 checks, no console errors; the screenshots and `studio-check.json` in `evidence/` are from this run |

Run 1 facts: the Maths proposal arrived in 0.4 s with no model call; 24 quests, each description with the aim, key points and method; rating Trigonometry weak and Quadratics strong proposed "Trigonometry extra practice" and "Quadratics quick check" and kept every existing quest's id. The model's map of "CAIE A level Physics Paper 2" (one call, 962 input and 1177 output tokens, first topic after 3.2 s, proposal after 8.7 s) had the right paper length but listed Electric fields and Quantum physics, which are A Level topics in the current 9702 syllabus, and missed Physical quantities and units. That is why 9702 joined the catalog; run 2 uses Chemistry for the model path. Run 2 repeated the Maths results (0.4 s, 24 sessions, quality 99) and mapped "CAIE A level Chemistry Paper 2 mock" with the model in one call (7.8 s; first topic after 2.4 s; 768 of 962 input tokens from DeepSeek's cache): the right paper (1 h 15 m, 60 marks) and broadly the right AS content, but not in syllabus order and with a "Practical skills" topic that belongs to Paper 3. The two model calls in these runs, plus the problem-set command each run also exercises, cost roughly a cent or two in total.

Screenshots in `evidence/`: empty composer, the planning card with its stage rail and topics, the proposal, the week beside the study guide, the topics and day-by-day views, the inspector, the rated proposal, dark mode, a custom accent and ground, and a phone.

## Not done, and what waits for the owner

- **Not verified on the tablet.** The Mac and Electron runs above are the evidence; the tablet checklist is unchanged.
- **Catalog coverage** is Mathematics 9709 and Physics 9702. Other courses use the model, whose topics are marked "check them against your syllabus" in the guide. Chemistry 9701, Biology 9700 and IGCSE syllabi are the obvious next entries.
- **Ratings are the student's.** The planner does not yet read marks from a past paper to rate topics itself.
- Nothing is merged, deployed or switched on in production; the Studio is still behind `SYLF_PLANNING_STUDIO`, and this change adds no migration.
- Docker Desktop's VM failed to start once ("Internal Virtualization error") and started cleanly after one restart; nothing was reset.
