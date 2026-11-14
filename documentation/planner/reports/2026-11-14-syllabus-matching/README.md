# Syllabus matching decided by the model, over an indexed search — 14 November 2026

Branch `planner/planning-kernel`, after the [planner quality review](../2026-11-13-planner-quality/README.md). Current behaviour is in the [Studio contract](../../STUDIO.md).

## What the owner reported and asked for

"A level CAIE Further Maths paper 1 and paper 2" was planned at once from Sylf's checked Cambridge **Mathematics 9709 Paper 1** list, with no model call. The owner asked that DeepSeek be called every time and decide whether a syllabus Sylf already holds (the checked catalog or the shared library) is the one asked for. If it is, the plan is built from it; if not, the syllabus is researched. The stored syllabi had to be searchable efficiently, never one by one. The fix had to handle every case rather than store the subjects under test.

## What was wrong

- **A keyword matcher decided before the model.** `matchSyllabi` ran first and short-circuited everything else. Its Mathematics test accepted any "maths" word, so Further Mathematics (9231), a separate syllabus, matched 9709. On a match, DeepSeek was never asked.
- **Library keys kept only the first paper.** "Paper 1 and Paper 2" became `…|p1`, so a two-paper request could reuse a one-paper entry.
- **A plan's title was cut at 60 characters before planning.** Everything after the cut never reached the model or the matcher. "…Further Mathematics 9231 Papers 1 and 2 test" was planned as "…9231 Pap", and the title shown to the student ended mid-phrase ("…complete for").

## What was built

**One vocabulary of search terms.** `syllabusTerms` (kernel, pure) reduces a request and every stored syllabus to the same small set of terms: `board:caie`, `qual:alevel`, `code:9709`, `paper:1`, `tier:higher`, and subject words such as `w:further` and `w:mathematics`. It handles synonyms ("maths" is mathematics), papers in any wording ("papers 1, 3", "P1/P3", "paper one", "Paper IV"), codes that are never years, and drops planning words ("midterm", "mock", "May").

**Indexed search of both stores** (`syllabusCandidates`):

| Store | Index | Lookup |
| --- | --- | --- |
| Checked catalog (`lib/planner/catalog/syllabi.ts`) | Inverted index built once, term to papers (`searchCatalog`) | Only papers sharing a code or subject word with the request are scored |
| Shared library (`SyllabusOutline`) | `terms text[]`, GIN-indexed (migration `20261114100000_syllabus_search`) | `terms && anchors` uses the index; Postgres orders by shared terms; the top rows are scored (`searchOutlines`) |

A request with no code and no subject word ("CAIE A level paper 2") reaches nothing. `matchScore` ranks candidates. Shared terms count by kind; subject words on only one side count against, so Further Mathematics is not Mathematics; a different code or board counts heavily against. At most six candidates are shown to the model. Library rows saved before the column existed are indexed on the server's first search.

**The model decides, every time** an exam or course is planned without the student's own topic list. The identify call (`syllabus.identify`, one short call) receives the candidates and names the syllabus. It returns `match`: the candidates that are exactly what is asked for, or none. The rules are the same board, qualification and subject; a variant with its own syllabus is a different subject; the same edition when named; and together exactly the papers asked for, with no paper meaning a whole-course entry only. Anything unsure returns none, and the syllabus is researched.

**Its choice is checked** (`agreesWith`, pure). A match is refused when:

- the codes or boards differ;
- the subject has words the stored syllabus lacks, or the other way round;
- the stored papers are not exactly the papers asked for.

The papers the learner typed fill in, or correct, the paper the model gives. When the search did not show the exact library entry for what the model identified, that entry is used, since the model never turned it down.

**Without the model** (no key, quota spent, or the call failed), only the strict catalog match is trusted, and it now never matches a variant (Further or Additional Mathematics).

**The whole request reaches planning** (`PlanInput.request`): the search, the identify call, mapping, research queries, focus detection and the general breakdown. The goal's title is shortened by the kernel at a natural break ("A level CAIE Further Maths paper 1 and paper 2 complete").

**Library keys keep every paper** (`caie|9231|p1+p2`).

## Live runs

Real DeepSeek calls against a local server on a fresh disposable database. Nothing was stored in advance; every library entry below was researched by an earlier request in the same runs ([script](evidence/match-runs.mjs)).

| Request | Decision | Time, calls |
| --- | --- | --- |
| A level CAIE Further Maths paper 1 and paper 2 complete for midterm exams preparation | First time: 9231 identified, no stored match, researched (13 topics of Further Pure 1 and 2), saved | 23.6 s, 3 |
| The same request again | **Found in the library**, reused as stored | 2.3 s, 1 |
| Cambridge International A Level Further Mathematics 9231 Papers 1 and 2 test | Library, the same entry | 1.8 s, 1 |
| CAIE Further Maths P1 and P2 mock exams in December, I need to cover everything properly (Auto) | Library, the same entry | 1.7 s, 1 |
| Cambridge A Level Further Mathematics 9231 Paper 1 Further Pure Mathematics 1 only | Not the Papers 1 and 2 entry; researched, exactly the 7 Further Pure 1 topics | 21.1 s, 3 |
| CAIE A Level Further Mathematics Paper 3 Further Mechanics | Researched (6 Further Mechanics topics) | 20.3 s, 3 |
| Edexcel A level Further Maths Core Pure 1 exam | Another board: researched, never a Cambridge entry | 18.0 s, 3 |
| Maths mid term Complete Paper 1 CAIE A levels | **Model confirmed the checked catalog** (9709 Paper 1) | 2.4 s, 1 |
| CAIE A level maths papers 1 and 3 mocks | Catalog, Papers 1 and 3 together (17 topics) | 1.7 s, 1 |
| Cambridge International A Level Physics 9702 Paper 4 mock | Catalog, Paper 4 | 2.3 s, 1 |
| Cambridge A Level Mathematics 9709, the whole course for May | A single paper is not the course: researched as a whole course | 44.5 s, 4 |
| IGCSE Mathematics 0580 Paper 4 extended | Not A Level 9709: researched | 36.7 s, 4 |
| I keep failing probability questions, especially conditional probability and Bayes | Not a named syllabus: mapped as before | 16.3 s, 3 |

Evidence: [round 1](evidence/round-1-before-restart.json), [all cases](evidence/round-2-all-cases.json), [reuse](evidence/round-3-reuse.json), [whole request](evidence/round-4-whole-request.json).

**Round 1 is not a valid result.** The dev server still held the Prisma client from before the new column, so every library save failed and requests were researched again. The server was restarted on the same database before rounds 2–4. Two library entries saved during the 60-character bug (a Paper 1 key holding whole-course topics, and an "unspecified paper" key) were deleted from the local database before round 4. Nothing was added to the database by hand.

## Verification

| Check | Result |
| --- | --- |
| `npx vitest run __tests__/planner/kernel/syllabus-search.test.ts` | 11 new tests: paper wording, terms, ranking, multi-paper keys, the match check (variants, papers, codes, boards, whole course), the catalog index, and no variant through the strict matcher |
| `KERNEL_PROPERTY_RUNS=200 npx vitest run __tests__/planner/kernel` | 91 passed |
| `npx vitest run __tests__/planner` | 1,800 passed, 270 skipped (opt-in database suites) |
| `node scripts/test/test-planning-studio-postgres.mjs` | 15 passed. The new migration applies unchanged and matches the schema with no drift. New test: indexed search finds Further Mathematics first, indexes an older entry, reaches nothing without a subject word, and the lookup can use `SyllabusOutline_terms_idx` |
| `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit`; ESLint on changed files | clean |
| `cd native && npm run typecheck && npm run test && npm run check:boundaries` | clean; 658 passed; parity hash unchanged. The boundary check also caught a local variable named `window` in the kernel's paper fitting (from the quality review), now `span` |
| Electron Studio check (`studio-check`, `SYLF_STUDIO_AI=1`) against the local server | every check passed, including the Cambridge Maths Paper 1 plan confirmed from the checked catalog and the library reuse of Chemistry 9701 Paper 2 |

## Limits, and what waits for the owner

- **Apply the migration** `20261114100000_syllabus_search` to the hosted database with the two earlier planner migrations. Existing library rows are indexed by the server on its first search.
- **First-time research quality is unchanged by this work.** In one early run the double-check added a Paper 3 topic to the Papers 1 and 2 outline; the final saved entry is correct. A wrong entry is shared until a student's "Something's off" corrects it.
- **The whole 9709 course is researched rather than assembled from the six checked papers.** That is deliberate: which papers make up the course depends on the route a student takes.
- A model-written topic name can still be shortened to one word at a colon (one run named a topic "Conditional").
- The model's cost per exam or course request is now at least one identify call, even for the catalog: about 1.5–2.5 s.
