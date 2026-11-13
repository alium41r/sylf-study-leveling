# Shared syllabus library, careful first-time research and plan feedback — 13 November 2026

Branch `planner/planning-kernel`, after [presets, research and long plans](../2026-11-13-planner-presets/README.md). Current behaviour is in the [Studio contract](../../STUDIO.md).

## What the owner asked for

Store syllabi once and reuse them instead of mapping every request. The first time Sylf sees a syllabus it must be researched very carefully, current and double-checked; syllabi already present stay as they are. After every plan, an optional, small, closeable prompt asks whether it is accurate: yes changes nothing, no re-runs the plan with the syllabus checked again and DeepSeek told the last plan was wrong. And a preset picker that shows only the chosen preset and opens a list of larger options, like a model picker.

## What was built

**Library** (`SyllabusOutline`, migration `20261113200000_syllabus_library`, `lib/planner/studio/outlines.ts`). One row per named syllabus, shared by every student. It holds the outline's content only: ratings, ticks and links to one student's syllabus nodes are stripped before saving and re-applied per student. Rows carry their sources, the edition, a trust level (`CHECKED` when researched against sources, `UNVERIFIED` when none were found), a version, and confirmation and report counts. Two keys find an entry (`outlineKeys`): by syllabus code (`caie|9701|p2`) and by board, qualification, subject and paper (`caie|a level|chemistry|p2`), so a request that names the code and one that does not meet. Board names collapse (Cambridge International and CAIE are one board); Cambridge's AS and A Level share a key because they share a syllabus, while other boards' AS and A Level stay apart. A code the model mentions elsewhere but leaves out of its field is recovered (`codeIn`, never a year).

**Order for an exam or course** (`planFromOutline`):

1. Sylf's hand-checked catalog (Cambridge 9709 and 9702): unchanged, no model call.
2. The student's own topic list: unchanged.
3. **Identify** (`syllabus.identify`, one short call): which official syllabus is this? Mocks, midterms and practice tests of an official syllabus count as that syllabus; personal or vague goals do not and plan as before.
4. **Library hit**: the stored outline, reused as it is. No research and no mapping. In the runs: about 1.5–2 s and one call.
5. **New syllabus, looked at with care** (`carefulOutline`): three searches (the official syllabus for this year, the paper's specification topics, the current edition), up to five pages read with official and educational hosts first; the outline mapped from them; then an independent **double-check** (`syllabus.verify`) against the same sources, as corrections (missing whole topics, topics from another paper or edition, names, papers). Corrections are bounded before they apply (`boundCorrections`): a flood of additions is a disagreement about granularity, a paper list must correct the same papers rather than split them, and an addition that restates an existing topic is dropped. The result is saved for everyone. About 15–30 s and three calls, once per syllabus.

**"Is this plan right?"** A small card at the top of the plan's study guide, once per plan round, with a close button. *Looks good* records it (`PlanFeedback`, `ACCURATE`; a shared entry's confirmations count it once) and changes nothing. *Something's off* takes an optional note and runs `recheck`: research again, map again told that the previous outline was reported wrong (with the note and the previous topics), double-check against the sources and the note, rebuild the plan keeping the student's ratings on topics that stay, and propose it in a new round, so the improved plan can be judged too. A correction confirmed against sources becomes the shared entry's next version; a re-check that finds nothing wrong changes nothing shared. Closing the card records `DISMISSED`. Sylf's hand-checked catalog is never changed by a report.

**Preset picker.** One large control showing the chosen preset's icon, name and a one-line description; opening it lists every preset as a large row with its description and a check on the current one (`PresetPicker`, on the design system's `Popover`).

## Verification

| Check | Result |
| --- | --- |
| `KERNEL_PROPERTY_RUNS=500 npm run test -- --run __tests__/planner/kernel` | 66 passed, including keys (synonyms, codes, AS and A Level, vague requests), code recovery, bounded corrections and restated additions |
| `npm run test -- --run __tests__/planner` | 1,774 passed, 269 skipped (opt-in database suites) |
| `node scripts/test/test-planning-studio-postgres.mjs` | 14 passed; both migrations applied unchanged and drift-checked against the schema; library save and reuse with nothing personal stored, a racing second save keeping the first, a revision bumping the version and report count, one answer per round, a confirmation counted once, the closed vocabulary enforced |
| `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit`, ESLint on changed files | clean. The regenerated Prisma client now needs a 4 GB heap for the full typecheck |
| `cd native && npm run typecheck && npm run test` | clean; 652 passed |
| `run-backend-local.mjs --studio --dev --with-deepseek` | 51 of 51 checks, no console errors ([evidence](evidence/)) |
| `run-backend-local.mjs --generations --dev --with-deepseek` | seven generations, all proposed with every check passed and nothing unplaced ([generations.md](evidence/generations.md)) |

The live run, end to end: the preset picker opens, lists every preset and closes on a choice; *Looks good* on the Maths plan closes the card, is recorded, and leaves the plan's version unchanged; "CAIE A level Chemistry Paper 2 mock" is identified, researched for the first time, double-checked and saved as `CHECKED` (22 topics, three calls, about 26 s); *Something's off* with the note "missing nitrogen compounds, polymerisation and organic synthesis" researches again and proposes a new round (in the final run the double-check confirmed those topics were already there, topics 19–21, and said the note was mistaken, which is right); and "Cambridge International AS Level Chemistry 9701 paper 2" comes from the library in 1.4 s with one call. An earlier run in which the re-check found real gaps fixed them and saved the shared entry as version 2.

Generations (final run): KCSE Biology Paper 1 researched (Kenyan sources), Paper 1 2 h and 80 marks, then the same syllabus asked again in other words reused from the library in 2 s with one call; the Moratuwa module researched and agreed by the double-check; AP US History researched with the nine periods; Edexcel Economics Paper 2 at 2 h and 100 marks; Spanish and the Auto mastery case planned as before (not named syllabi).

**Bugs found and fixed.** A "mock" was not counted as its official syllabus, so it skipped the library. Requests that did and did not name the code, or said AS rather than A Level for Cambridge, did not meet. The double-check, applied without bounds, turned AP's key concepts into topics and split its papers. Session titles cut long names mid-thought ("Terms of trade and international"); they are now cut at a natural break. HTML entities from web pages ("&amp;") reached topic names. A re-check that changed nothing still bumped the shared version.

## Limits, and what waits for the owner

- **Apply the migration** `20261113200000_syllabus_library` to the hosted database before enabling this (as with `20261113100000_planning_kernel`).
- The first student to plan a syllabus shapes everyone's starting point. Quality of that first pass varies with the sources found: KCSE Biology came out between 12 and 15 topics across runs, sometimes merging or missing Form 4 topics. Reports improve the entry; there is no admin review screen yet, and no expiry when a new edition is published (the edition is recorded for that).
- Not verified on the tablet. Nothing is merged, deployed or switched on in production.
