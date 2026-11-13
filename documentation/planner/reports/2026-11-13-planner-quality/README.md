# Planner quality review: many varied plans, scored automatically and by hand — 13 November 2026

Branch `planner/planning-kernel`, after the [shared syllabus library](../2026-11-13-syllabus-library/README.md). Current behaviour is in the [Studio contract](../../STUDIO.md).

## What the owner asked for

Run many varied tests of the planner, as hard as it can be pushed. Wherever a plan has an error, a miscalculation or simply isn't good enough, find what went wrong and fix that part of the planner, until the whole planner is right. Beside the automatic scorer, inspect every generated plan by hand, score it rigorously, and fix what it falls short on.

## How it was tested

- **19 cases** in [`scripts/test/planner-quality-cases.json`](../../../../scripts/test/planner-quality-cases.json), each with what a correct plan must show. Thirteen were written first; six more were added after round 1 so the fixes were not tuned only to the cases that exposed the problems.
  - UK GCSE (AQA Biology Paper 1), IB Maths AA HL over six months, JEE Main Physics at three hours a day with weak topics, AWS Solutions Architect at 45 minutes a day, USMLE Step 1 at six hours a day, the CFA Level I, the GRE quant section.
  - France's Bac philosophy, Pakistan's FBISE HSSC-II Physics, a student's own topic list starting in ten days.
  - Two books (Sapiens; Thinking, Fast and Slow), guitar and Python as skills, a dissertation literature review and a group marketing report as assignments.
  - A quiz tomorrow, a calculus midterm tomorrow, and a vague Auto request ("I keep failing probability, especially conditional probability and Bayes").
- **Each case went through the real Studio stream** with DeepSeek V4.1 Flash on a disposable database: `run-backend-local.mjs --generations` with `SYLF_GENERATION_FILE`.
- **The automatic scorer** ([`scripts/test/lib/plan-quality.mjs`](../../../../scripts/test/lib/plan-quality.mjs)) writes a scorecard and every session, in date order, for the manual review (`quality.md`). After round 1 it gained the checks the manual review showed it lacked:
  - the student's minutes a day held on every day (only a full paper may run longer, and only alone);
  - the time offered actually used;
  - assignments spread to their date;
  - a test tomorrow revised today;
  - key points never cut off.
- **The manual review** read every plan in full against six questions:
  - Is the syllabus right and complete for this exact paper?
  - Is the scope right?
  - Is the order good teaching?
  - Is the pacing realistic and does it use the time?
  - Are the descriptions useful?
  - Are the titles simple?
- **Nine rounds** in all: round 1, then fix-and-rerun rounds 2–9, and a final full round. Intermediate rounds keep only their scorecards.

## Scores

Manual scores out of 10. Round 1 is before any fix; final is the last full round, with three cases re-checked after the last fixes ([final-recheck](evidence/final-recheck/quality.md), [Sapiens](evidence/final-recheck-sapiens/quality.md)).

| Case | Round 1 | Final | What decided the final score |
| --- | --- | --- | --- |
| AQA GCSE Biology P1 | 6.5 | 9 | Complete (Respiration and animal organs now always present); 60 min a day held, three papers each on a day of its own |
| IB Maths AA HL, 6 months | 4 | 8.5 | 126 sessions using the hour a day, eight papers; outline sometimes coarse or oddly named |
| JEE Main Physics | 5 | 9.5 | All 20 official units (semiconductors, EM waves were missing); weak spots get spaced practice; 3 h a day used |
| AWS SAA-C03 | 5 | 7.5 | Follows the exam guide; 45 min a day held with one combined session a topic; sources still pull in out-of-scope services |
| USMLE Step 1 | 3.5 | 8.5 | Systems and disciplines (GI, pharmacology, pathology); 4 h a day (the account's cap), 4-hour practice blocks |
| Sapiens | 5 | 9 | The real 20 chapters (were invented names); a parts-only outline now triggers a lookup |
| Guitar | 7 | 9 | Ends at the target song; strumming still after barre chords in some runs |
| Dissertation lit review | 3.5 | 9.5 | 12 concrete steps (sources 1–8, 9–16, 17–25, drafting by word count), spread to the deadline; was a 7-step template in 4 days |
| Quiz tomorrow | 1 | 9 | Four sessions tonight; previously nothing at all was placed |
| Typed topics, starts in 10 days | 5.5 | 9 | Uses the 90 min a day; no clipped titles |
| "Especially Bayes" (Auto) | 6 | 8.5 | Bayes is guaranteed now; 10 days at a default hour a day instead of 3 h days nobody asked for |
| Bac philosophie | 4.5 | 6 | Method and many notions right, essay-style practice and the real 4-hour paper; the outline still mixes pre-2020 notions |
| FBISE HSSC-II Physics | 5.5 | 9 | Exact chapters; 2 h a day used |
| CFA Level I (new) | — | 9 | The ten official topics, two 2 h 15 m sessions as papers |
| GRE quant (new) | — | 8.5 | ETS's own math review list; granular |
| Thinking, Fast and Slow (new) | — | 9 | All chapters; short chapters share a sitting at 30 min a day |
| Calculus midterm tomorrow (new) | — | 9 | Quick revision tonight, then mixed practice |
| Marketing report (new) | — | 9 | The student's two sections, drafted, revised and checked against the group budget |
| Python skill (new) | — | 9 | Stages to a real project at 45 minutes, four days a week |
| **Mean** | **4.8** (13 cases) | **8.7** (19 cases) | |

The automatic scores in round 1 (91–100) looked fine; the manual review found the problems below. Comparable measures from the scorecards:

| | Round 1 | Final |
| --- | --- | --- |
| Days over the student's minutes a day | AQA 6, AWS 9, Bac 5, IB 2 | 0 everywhere |
| Planned hours (offered) | USMLE 86 (343); JEE 58 (193); IB 44 (123); FBISE 36 (107) | USMLE 254; JEE 174; IB 129; FBISE 100 |
| Quiz tomorrow, sessions placed | 0 of 12 | 4 of 4, tonight |
| Dissertation | 7 template steps in the first 4 days | 12 steps, last on the day before the deadline |

## What was wrong, and what was changed

**1. Plans used a fraction of the student's time.** USMLE at six hours a day got about 40 minutes a day, IB about 20, JEE 30. Every topic was one revision and one practice session, however long the plan.

- Exam and course plans now aim for about 80% of the minutes offered on the learning days. Under a default limit the aim is 55%.
- A topic is studied in parts of one session each; each part covers its own slice of the key points ("Kinematics revision (1 of 2)").
- Practice comes back after widening gaps of 2, 6, 13, 24 and 40 days. The gaps are squeezed before the exam, and late topics get fewer, so the last days stay with the papers.
- Long plans sit up to eight papers. Sessions take the nearest size that packs the day, not the largest smaller one: a 55-minute session had been halved.

**2. "An hour a day" became the paper's length on every day.** The daily cap was raised to the longest paper (115, 140, 180 minutes), so ordinary days ran far past what the student asked.

- The cap is now exactly the student's number.
- A full paper longer than the limit is a **solo sitting**: allowed, and alone on its day. This is new in the solver, the repair path and the verifier.
- Beyond the detailed calendar, each week holds at most the limit on each of its study days.
- The student's minutes a day lift the solver's comfort level for a new user, so six hours means six hours (up to the account's daily cap).
- Without a number, plans take a sensible default (exam 2 h 30 m, course 1 h, topic 1 h, book 45 m) rather than filling the day.

**3. A test tomorrow got nothing.** The "no new learning before an exam" buffer forbade today. Today now stays open, and a test one or two days away gets a few quick revision sessions covering every topic, then one mixed practice.

**4. Assignments fell back to a template.**

- One topic named in words rather than by reference made the model's whole breakdown unusable, and an item naming a later item was rejected for good. Both are fixed.
- The prompt now sizes writing by real effort (minutes a source, drafted words an hour) in 4–16 items.
- `paceWork` spreads the items over the time to the date.

**5. Syllabi were incomplete or padded.**

- The topic-list prompt now sizes by how much is examined: every official unit for big exams, the official outline's own level, never sub-sections or required practicals as topics. It also asks for every chapter of a book, never exam technique or coursework as topics, and the target as a skill's last stage.
- The double-check now first lists the official units. Sylf compares that list with the outline deterministically (`uncoveredUnits`), and any unit still uncovered gets one focused second look. This is what restored Respiration to AQA and pharmacology to USMLE.
- An outline built from research gets the same double-check even when it is not a library syllabus.
- Corrections are bounded more sensibly:
  - whole missing topics are kept up to a limit instead of all being dropped;
  - "missing topics" that are subtopics, exam technique or question formats are discarded;
  - long lists of removals are set aside;
  - a rename never creates a duplicate.
- Coursework is never a topic (`dropCoursework`).
- Whatever the learner singles out ("especially Bayes") is always covered (`coverFocus`) and treated as weak.
- A book outlined in a handful of parts is looked up.
- The topic-list call's output limit rose from 2,400 to 5,000 tokens; JEE's outline had nearly reached the old one.

**6. Text.**

- Key points are cut at a natural break, never with "…". Topic names may be 48 characters ("System of Particles and Rotational Motion" had lost its meaning at 40, and with it the weak-spot match).
- Long titles shorten at a phrase. Papers are numbered per paper.
- Essay subjects practise by planning and writing answers, not "method marks".
- Model-written titles are shortened at a break.
- Quick plans and combined sessions say what they are.
- The strategy line no longer says "0 mixed reviews" or "Physicss".

**7. Time far too short.** When a revision and a practice per topic will not fit even shortened, each topic gets one combined "revision and practice" session, for exams and for topic mastery. A long book packs short chapters into one sitting. Without this, work had been left unplaced.

## Verification

| Check | Result |
| --- | --- |
| `KERNEL_PROPERTY_RUNS=500 npm run test -- --run __tests__/planner/kernel` | 80 passed, 14 of them new in `pacing.test.ts`: the cap and solo papers, time used, defaults, the test tomorrow, paper numbering, clean points, assignment pacing, combined sessions, long books, week order, focus coverage, the official-unit comparison, rename and coursework hygiene |
| `npm run test -- --run __tests__/planner` | 1,788 passed, 269 skipped (opt-in database suites). One UI test timed out once under load and passed on its own |
| `node scripts/test/test-planning-studio-postgres.mjs` | 14 passed |
| `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit`; ESLint on changed files | clean |
| `cd native && npm run typecheck && npm run test`; parity | clean; 652 passed; the `planning.solve` hash is unchanged (its fixture has no daily-limit plans) |
| `run-backend-local.mjs --studio --dev --with-deepseek` (Native rebuilt) | 51 of 51, no console errors ([evidence](evidence/studio-check/)); two checks updated for the new "past paper practice 2" title |
| Generations | [round 1](evidence/round-1/quality.md) and [final](evidence/final/quality.md) in full; [rounds 2–9](evidence/) as scorecards |

## Limits, and what waits for the owner

- **First-time syllabus research still varies between runs.** The double-check, the official-unit comparison and the second look catch most gaps. A wrong first entry is saved for everyone until a student's "Something's off" corrects it. There is still no admin review of library entries.
- **Weakest case: the Bac philosophy outline.** It still mixes pre-2020 notions with the current seventeen, because the sources found are old. Session text around French topic names is English.
- **AWS** outlines pick up services outside SAA-C03 (Bedrock, Aurora DSQL) from current web pages.
- **Small leftovers.** In a crowded final week a 10- to 40-minute session can still be left unplaced (two of 128 in the final CFA run). Tight days can split a session into a short piece.
- **Week budgets beyond the calendar.** They are now ordered and capped, but placed day by day only as the calendar reaches them.
- **Cost.** About 20 seconds and three or four model calls for a syllabus planned for the first time; library hits stay at one call.
- **Not verified on the tablet, not deployed.** The two migrations from earlier reports still need applying to the hosted database.
