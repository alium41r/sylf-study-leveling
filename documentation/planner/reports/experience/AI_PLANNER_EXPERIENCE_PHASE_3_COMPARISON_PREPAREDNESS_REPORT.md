# Sylf AI Planner — UX Phase 3 Report
## Curriculum Comparison + Fast Preparedness + Flexible Draft Editing

**Scope implemented:** UX Phase 3 only (items A–G of the goal).
**Not implemented, deliberately:** Planner Copilot, natural-language planner actions, general-purpose chat, autonomous research loops, generated-Quest release/deletion, post-confirmation editing relaxation, public enablement, navigation changes, Classic Planner changes.

---

## 1. Repository reconciliation

The tree was reconciled before any Phase 3 code was written.

- `npx tsc --noEmit` was **clean** on the untouched tree (after removing stale generated types at `.next/dev/types`, which a previous dev-server run had left behind). An earlier note in my working log claimed a concurrent edit had removed `scopeCandidate` from `PlanBriefV1`; reading `lib/planner/intake/brief.ts` showed that field present and used at lines 213 and 292, with the `assumptions` / `authority` additions and the `ScopeNodeSchema` re-export also present. **No reconciliation was needed, and nothing was reverted.** The typecheck is the evidence, not my recollection.
- `lib/planner/` is entirely untracked in this checkout (`git status --short lib/planner` → `?? lib/planner/`), so Phase 0–3 planner work has no git history to diff against. Every claim in this report therefore cites a file and a test rather than a commit.
- The Phase 2.1 planner suites passed before Phase 3 began (710 tests across 56 files), and the Phase 0–6 engine suites passed unchanged throughout.

## 2. Phase 2.1 baseline

Preserved exactly, and consumed rather than reimplemented:

| Phase 2.1 component | How Phase 3 uses it |
| --- | --- |
| `SearchProvider` (Brave/Serper, `selectSearchProvider()`) | Reused verbatim; one instance is passed into the comparison service |
| SafeSourceFetcher (`fetchSource`, SSRF checks, redirect validation) | Reused; the comparison's only source of URLs |
| DeepSeek research model (`deepseek.ts`, `DEEPSEEK_MODELS.planner`) | Extended with a *second* method (`compare`) on the same factory; `planQueries` is shared |
| Authority registry (`authority.ts`, `resolveAuthorities`) | Reused for the background target, so official domains classify identically |
| Source classification (`sources.ts`, `buildSource`, `rankSources`) | Reused, including the INSTITUTIONAL class |
| Provenance rule (URL from search results or a validated `finalUrl` only) | Reused, and strengthened by a new rule (below) |
| `researchPolicy ALLOW/OFF` | Honoured *before* any provider is touched |
| Candidate quarantine (`scopeCandidate`) | Untouched; a comparison is not a candidate and cannot reach the engine |

One deliberate extension of the provenance rule: a comparison assertion that is not `UNCLEAR` and cites no issued source id is **downgraded to `UNCLEAR`** server-side (`comparisonFromExtraction`). "The pages I read support this" and "I believe this" must not look the same in the student's list.

## 3. Institutional-copy fix (§4, §47)

`lib/planner/research/sources.ts` now exports `sourceTypeMeaning()` alongside `sourceTypeLabel()`:

- **Official** — "Verified as an authority for this exam or curriculum — the board, ministry or exam body's own material."
- **Official PDF** — the same, "published as a PDF document".
- **Institutional** — "A credible academic or government institution, but **not verified as the authority for this specific exam or curriculum**."
- **Secondary** — "Someone else's material. It may be accurate and useful to read, but it is not an authority and Sylf does not treat it as one."
- **Your upload** — "A file you provided. Sylf reads it for you, and nobody else has verified it."

The panel renders these as a legend **once per panel, for the types actually present** (`SourcePanel`), rather than repeating a disclaimer on every row. The backend classification is unchanged: `sourceTypeIsOfficial()` is still true only for `OFFICIAL`/`OFFICIAL_PDF`, so Institutional is never treated as official anywhere in the planner.

Two pre-existing tests asserted the old, ambiguous rendering and were updated to assert the new contract (row label via the link's accessible name; the legend's sentence; upload as text with no link) — recorded here because editing a test is a change to the phase's evidence, not a detail.

## 4. Background curriculum contract

`PlanBriefV1.backgroundCurriculum` (`lib/planner/intake/brief.ts`):

```
{ label: string(1..200), level: string(≤60)|null, board: string(≤60)|null, subjects?: string[] (≤20 × 120) }
```

- **Optional at every level**, and absent means "not stated". `subjects` is optional so every brief stored before Phase 3 parses unchanged (asserted by the `default`-free schema and by the existing brief tests continuing to pass).
- Free text for `label` and `subjects` on purpose: a student whose system is not in Sylf's registry must not be forced into an enum. `board`/`level` offer the registry (`lib/study-systems.ts`) **with an "other" escape**.
- Written by `setBackgroundCurriculum` (whole shape, `label: null` clears) and by the existing `setBackground` (partial: a board change preserves subjects — `withBackground()` in `lib/planner/server/intake.ts`).
- Captured by `BackgroundCurriculumControl`, inside a closed disclosure, with the copy stating it is optional and that comparison changes nothing about generating.

## 5. Comparison architecture

- **Contract:** `lib/planner/comparison/contracts.ts` — `CurriculumComparison { version: 1, status, failureCode, targetScopeDigest, backgroundDigest, providerVersion, searchProvider, createdAt, units[], sources[], unresolved[], summary }`, `units[] = { unitRef, overlap, confidence, sourceIds[], explanationCode, corrected?, originalOverlap? }`.
- **Service:** `lib/planner/research/comparison.ts` (`runCurriculumComparison`, `comparisonTargets`, digests, staleness, `comparisonFromExtraction`, `comparisonAvailability`).
- **Shared unit vocabulary:** `lib/planner/comparison/units.ts` (`unitRows`) is used by *both* the server (to build the comparison) and the browser (to label rows and group them by chapter), so a student cannot correct one row and see another.
- **Where it lives:** `brief.comparison` (the bounded result) and `brief.overlapCorrections` (the student's own answers). The comparison is **display-only**: it is not a `scopeCandidate` because it can never reach the engine, and the engine input is asserted in a database test to contain no overlap vocabulary at all.
- **Granularity:** the compared units are exactly the units `flattenScope` will give the engine. Measured: a 158-node hierarchy (150 topics, 8 chapters) flattens at `CHAPTER_UNITS` into **8** units, and the comparison has exactly 8 rows — not 150.

## 6. Comparison research path

One bounded run (`runCurriculumComparison`), in this order:

1. `researchPolicy === "OFF"` → `UNAVAILABLE`, no provider, no model, no fetch.
2. No background curriculum, or no confirmed scope → `NOT_APPLICABLE`.
3. No search provider configured → `COMPARISON_SEARCH_UNAVAILABLE`, **no model call** (asserted).
4. Cached and applicable result → returned with `cacheHit: true`, **no search, no fetch, no model call**.
5. Otherwise: **one** search plan (reusing the Phase 2.1 planner prompt), **one** search round (≤2 queries, ≤8 results each), **one** fetch round (≤4 pages, ranked before fetching), **one** comparison model pass over a bounded payload, then server-side validation.

No per-topic browsing loop exists. Limits live in `COMPARISON_LIMITS` and are enforced, not documented: `units 50`, `searchQueries 2`, `resultsPerQuery 8`, `fetchedSources 4`, `modelPasses 1` (+1 for the search plan), `targetChars 6000`, `sourceChars 6000`, `inputChars 30000`, `outputChars 8000`, `sourcesPerUnit 4`, `unresolved 8`, `modelTimeoutMs 45000`.

## 7. Overlap vocabulary

Exactly four states (`OVERLAP_STATES`), independent of preparedness and of priority:

`LIKELY_COVERED_BY_CURRICULUM` · `PARTIAL_OVERLAP` · `LIKELY_NEW_TO_CURRICULUM` · `UNCLEAR`

- Student-facing words are about curricula, never about the person: "In your curriculum", "Partly in your curriculum", "Not in your curriculum", "Not sure".
- `explanationCode` is a closed code, never model prose. The sentence a student reads is assembled by the server from **their own** unit label and **their own** curriculum name plus one code — so no free-text model output can become an authority.
- The comparison result has **no preparedness field at all**, and the schema is strict: a row carrying `covered` fails to parse (asserted). This is the structural half of "comparison never implies mastery".

## 8. Provenance and authority

- `sources[]` is built by `buildSource` from search-result URLs and validated `finalUrl`s only. The model's output schema has **no URL field**, so a model-composed URL has nowhere to land (asserted).
- A citation naming a source id the server never issued is **dropped**, and the count is reported (`droppedCitations`).
- An assertion other than `UNCLEAR` with no surviving citation is downgraded to `UNCLEAR` (`downgraded`), because otherwise an uncited claim would look as strong as a cited one.
- `OK` requires a source that carries authority (`OFFICIAL`/`OFFICIAL_PDF`/`INSTITUTIONAL`) **and** at least one asserted unit; otherwise `WEAK`; nothing readable is `UNAVAILABLE` with a named reason.
- Phase 2.1's classification is untouched: comparison output can never change a source's type.

## 9. Caching and staleness

`comparisonIsStale(comparison, brief)` is true when any of these changed:

- the **target scope digest** — units, their wording, and their ancestor paths (`targetScopeDigest`);
- the **background digest** — label, level, board, subjects, normalised (`backgroundDigest`);
- the **pipeline version** (`COMPARISON_PROVIDER_VERSION`, bumped when the prompt, schema or rules change).

A stale result is **never applied**: the view returns `state: "STALE"`, no rows, no suggestion refs, and one sentence telling the student the comparison no longer applies with the option to run it again. Verified in the database suite by changing the background and observing the withheld rows.

**Why corrections are not part of the digest** (a deliberate reading of §16): a correction is the student's answer *about* a unit, not a change to the curricula being compared. Re-running research because a person corrected one row would spend a search budget to re-derive the same curriculum facts. Corrections are therefore stored *beside* the comparison, layered on every read (`applyOverlapCorrections`), and carry the target digest they were made against — so a scope change retires them rather than misapplying them, and re-running the comparison cannot erase them. §16's reuse condition ("relevant user corrections have not changed") is satisfied in a stronger form: corrections are never part of the cached result, so they cannot be stale.

## 10. The NUST/A-Level reference flow

Synthetic scenario, no hardcoded topic results anywhere:

- Target: "NUST NET Engineering", confirmed scope (Mathematics → Matrices, Sequences and series, Rotational dynamics).
- Background: CAIE A-Level, subjects Mathematics/Physics/Computer Science.
- Result (`database-phase3.test.ts`, real PostgreSQL): `status: OK`, counts `{covered: 1, partial: 1, isNew: 1, unclear: 0}`, one `OFFICIAL_PDF` source (cambridgeinternational.org), rows in uncertainty-first order, `suggestionRefs: ["n1"]`, and `brief.preparedness` still `[]` — the comparison wrote **nothing** about the student.
- The student then corrects Matrices to "not in my curriculum": recorded, Sylf's own classification preserved in the stored result, and the re-run keeps the correction.
- Measured cost: **1 search plan + 1 comparison pass** (2 model calls), 1 search call, ≤4 fetches — for a 40-topic target.

## 11. No-search-provider fallback (§11, §42)

With no Brave/Serper credential:

- the background curriculum is still enterable and saved;
- comparison reports `UNAVAILABLE` with `COMPARISON_SEARCH_UNAVAILABLE` and the sentence "Curriculum comparison needs a web search, which is not configured in this deployment. You can still rate your own topics, and the plan will generate either way.";
- **no model call happens** — asserted directly (`planCalls === 0`, `compareCalls === 0`), so DeepSeek is never asked to reason about imagined web context;
- the preparedness matrix, bulk actions, and generation all work unchanged.

Live research smoke remains **pre-public**, as in Phase 2.1: `DEEPSEEK_API_KEY` is present in `.env`; `BRAVE_SEARCH_API_KEY` / `SERPER_API_KEY` are absent. No live comparison success is claimed.

## 12. Comparison UI

`OverlapReview.tsx`: the summary sentence ("Based on the curricula: 17 likely familiar, 8 partly overlapping, 7 likely new, 4 unclear."), **one** explanation ("This compares curriculum content, not how well you personally know it." — asserted to appear exactly once), grouped rows, per-row correction, per-row and bulk "mark as studied" suggestions, the comparison's own sources through the same `SourcePanel` (with the corrected legend), and honest states for `NOT_RUN` / `UNAVAILABLE` / `STALE`.

## 13. Uncertainty-first review

Group order is fixed (`OVERLAP_REVIEW_ORDER`): `UNCLEAR` → `LIKELY_NEW_TO_CURRICULUM` → `PARTIAL_OVERLAP` → `LIKELY_COVERED_BY_CURRICULUM`. The first three are rendered open; **likely-covered is collapsed**, because agreeing with rows Sylf is already confident about costs a click each and changes nothing. DOM order and the collapsed group are asserted.

## 14. Preparedness matrix

`PreparednessMatrix.tsx` + `lib/planner/preparedness-matrix.ts`. One row per unit — label, six one-click states, a difficult flag, a **priority** control, a selection checkbox — grouped by top-level chapter, groups collapsed beyond eight rows, with a bulk toolbar always reachable. Skipping it entirely is a first-class action: the whole control is a closed `<details>`, and the copy states in words that nothing is required and that skipping changes nothing about generating.

Both of the goal's optional extras (§20: "Plus optional: Difficult, Priority") are present and independent: `difficult` has its own checkbox, and priority has its own labelled select ("No priority" / "Low priority" / "High priority") per unit, a chapter-level action, and three toolbar actions (`SET_PRIORITY_HIGH`, `SET_PRIORITY_LOW`, `CLEAR_PRIORITY`). Priority is written through the **existing** `setPriority` action with `prioritySource: USER_EXPLICIT` — the only honest provenance, since the student clicked it — and no preparedness action ever writes it. Asserted both ways: choosing a state leaves priority untouched, and clearing everything leaves a stated priority standing (UI test, matrix unit test, and a real-PostgreSQL test).

## 15. Desktop matrix

A grid with a sticky header row (Unit · Not rated · Not studied · Studied, not rated · Weak · Okay · Strong · Difficult · Priority), `display: contents` so the radio labels land in their own columns, real inputs sized for touch, text labels beside every control (never colour-only meaning), and `:has(input:checked)` for the selected state.

## 16. Mobile preparedness

The same DOM restyles below 52rem: each row becomes `[checkbox] [label]` with the states, the difficult flag and the priority select wrapping beneath, `min-height: 44px` on every state, on the flag and on the select, labels wrapping, and no horizontal scrolling. There is no separate mobile matrix to drift out of sync — which is the point of restyling rather than re-rendering.

## 17. Bulk actions

`MATRIX_BULK_ACTIONS`: `SET_UNKNOWN`, `SET_NOT_STUDIED`, `SET_STUDIED_UNRATED`, `SET_WEAK`, `SET_OKAY`, `SET_STRONG`, `MARK_DIFFICULT`, `CLEAR_DIFFICULT`, `SET_PRIORITY_HIGH`, `SET_PRIORITY_LOW`, `CLEAR_PRIORITY`, `CLEAR_PREPAREDNESS`. Each maps onto the same patch a single click writes; the actions that carry them are `bulkSetPreparedness`, `setDifficulty`, `setPriority` and `clearPreparedness` — all pre-existing except the bulk preparedness one — so the server has **no second preparedness or priority vocabulary**. Targets are the current selection when there is one, otherwise the whole scope.

§24's "set whole chapter to X" is served by two controls rather than one button per state per chapter: a chapter header offers select-all / deselect-all (so the toolbar's any-state action reaches exactly that chapter — asserted for `NOT_STUDIED` over `["t1","t2"]`), plus direct chapter actions for the two most common answers (reset to not rated, mark studied) and high priority. Reversibility is the ordinary action model: every bulk write is a separate typed action, and `CLEAR_PREPAREDNESS` resets the three matrix fields while keeping priority.

## 18. Preparedness mapping

| Matrix state | `covered` | `confidence` | Policy consequence |
| --- | --- | --- | --- |
| UNKNOWN | `null` | `null` | not weak, not secure, learning still owed, provision weight 2 |
| NOT_STUDIED | `false` | `null` | learning owed, provision weight 4, **not** weak |
| STUDIED_UNRATED | `true` | `null` | learning not owed, not secure, no forced mistake review |
| WEAK | `true` | `2` | weak → priority/catch-up and a mistake review |
| OKAY | `true` | `3` | neither weak nor secure |
| STRONG | `true` | `5` | secure → less re-teaching |

Priority and difficulty sit beside these six and are never derived from them; the fifth column of the mapping table would be empty on purpose, which is why there is no fifth column.

`4` remains reachable through Advanced setup and renders as STRONG here. A *stated confidence with unstated coverage* (also reachable through Advanced) is reported as `matrixStateOf(...) === null` and the row says so in words rather than snapping to the nearest button. Every mapping is asserted against the existing policy predicates (`isWeak`, `isSecure`, `needsLearning`, `needsMistakeReview`, `provisionWeight`), not against a new copy of them.

## 19. Optionality and readiness

Nothing in Phase 3 gates generation. `planBriefReadiness` is unchanged: goal + confirmed scope + target date + capacity remain the only requirements. Asserted end-to-end: a brief with `preparedness: []` and no comparison generates, and its engine input carries `null` for every unit's coverage and confidence.

## 20. Plan Brief integration

Added to `PlanBriefV1` in the smallest way that carries no documents:

- `backgroundCurriculum.subjects?: string[]` (≤20);
- `comparison: CurriculumComparison | null` (≤50 units, ≤8 sources, bounded strings);
- `overlapCorrections: OverlapCorrection[]` (≤50).

Measured sizes: **6,117 bytes** for a 40-topic brief; **21,650 bytes** for a 158-node brief with a comparison attached (8 rows + 1 source) — both inside the 64 KiB envelope, which was **not** raised. Raw research documents are never stored: only the bounded result and its source records.

## 21. Typed actions

All through the existing intake action system (`IntakeActionSchema`), each with strict schemas, owner scope, `expectedVersion`, `actionKey` idempotency, bounded refs and content-free telemetry:

`setBackgroundCurriculum`, `compareCurricula` (with `force`), `setOverlapCorrection` (with `clear`), `bulkSetPreparedness`, `setDifficulty`, `clearPreparedness`, `applyCoverageSuggestion`. `compareCurricula` is no longer `NOT_AVAILABLE`.

Notable server-side guards: `setOverlapCorrection` refuses a unit ref outside the confirmed scope; `applyCoverageSuggestion` re-derives the eligible set from the stored comparison and refuses anything else (so acceptance can never become a blanket rating); `clearPreparedness` keeps priority; `setBackgroundCurriculum` marks the stored comparison stale by digest, not by editing it.

## 22. Smart Setup interaction

`intakeQuestions` and the 0–3 question cap are untouched, and no question was added. What was verified about the interaction (measured, not assumed):

- **No question reason is about preparedness.** The four are `PRIORITY_UNCLEAR`, `AVAILABILITY_PATTERN_UNCLEAR`, `CONSTRAINT_STRENGTH_UNCLEAR`, `SCOPE_SIZE_UNCLEAR`; a brief whose matrix was skipped entirely asks nothing new because of that silence (asserted).
- **A distinctly answered matrix removes the one question that asks about it.** `PRIORITY_UNCLEAR` is constructed only when two units share a confidence and differ only in coverage or difficulty — its own prompt is "your confidence ratings do not separate these topics". Once the matrix has separated them, the premise is false at the source and the question cannot be built (asserted, including under a tight horizon where that question is most worth asking).
- Whether that question is offered in the first place still depends on the pre-existing capacity gate (`requiredMinutes > 0.5 × usableMinutes`), unchanged from Phase 1. The matrix therefore *resolves* an A1 uncertainty and never *creates* one, which is what §32 asks for.

## 23. Draft editing flexibility

Implemented in three parts:

1. **The audit** — `lib/planner/draft-rules.ts` classifies each code as `BLOCKER` or `RECOMMENDATION` with a written reason, and `intake/findings.ts` now derives severity from that table (`isRecommendation`), so a code cannot be a warning in one place and a blocker in another (asserted for every code).
2. **The assessment** — `lib/planner/server/flexibility.ts` (`assessDraftEdit`) runs the *ordinary* `validateDraft`, observes the refusal code, records a recommendation as a warning, and re-runs the same validator with only that code suppressed. A blocker ends the assessment and its acknowledgement is refused outright. Capacity classification (§36/§37) and soft-preference breaches are added as findings, and a warning names the units the edit changed when that is derivable from the base draft.
3. **The exchange** — `EditSchema.acknowledgements` (optional; its *presence* switches the request into assessing mode). Without it, the endpoint behaves exactly as before → every existing edit test still passes unchanged. With it, a refusal is a `409 DRAFT_WARNINGS_REQUIRE_ACCEPTANCE` carrying the findings; accepting re-sends the same body plus `ACK:<CODE>` values, and the accepted codes become part of the operation hash, so what was accepted is recorded in the sealed revision's immutable identity.

UI: `DraftEditWarnings` renders warn → explain → accept → undo ([Keep my change] / [Undo]) and is wired into all three mode editors (Exam, Roadmap, Mastery) through one shared client (`lib/planner/edit-client.ts`), posted through each mode's own transport.

**Bound to the current draft:** an acknowledgement names the warning the *current* draft actually raises; a code that is not raised is `UNKNOWN_ACKNOWLEDGEMENT`, an acknowledgement for a blocker is `BLOCKER_NOT_ACKNOWLEDGEABLE`, and a stale base is `STALE_REVISION` as before. Nothing is stored as a preference: acceptance lives in one operation.

## 24. The blocker/warning audit (§34)

Every code the draft path can surface is audited individually with a reason. The line drawn:

- **BLOCKER** — malformed structure (duplicate key, unknown reference, duplicate dependency, graph depth, invalid stage/intent pairing), impossible dates, confirmed-scope mismatch, a confirmed unit dropped silently, absolute duration bounds, a HARD session limit, a HARD unavailable weekday, a HARD weekly maximum, capacity that no acknowledgement can make feasible, a mode's own architecture (Mastery's stage *presence*, the final check, a Roadmap's period grid), and anything not audited at all.
- **RECOMMENDATION** — educational depth, spacing, order, review, mock, mixed practice, priority ordering, and the two capacity readings that depend on whether the student declared a maximum.

The complete table is `DRAFT_RULE_AUDIT` (viewable, one line per code with its reason). Selected decisions worth stating:

| Code | Class | Why |
| --- | --- | --- |
| `MISSING_COVERAGE` | RECOMMENDATION | deleting the teaching session is a tradeoff; the copy points at the honest alternative (say you know it) |
| `MISSING_CONSOLIDATION_OR_PRACTICE` | RECOMMENDATION | reading through without retrieval is a legitimate choice |
| `MISSING_SPACED_RECALL`, `MISSING_LATER_RETRIEVAL` | RECOMMENDATION | retention advice, not structure |
| `MISSING_FINAL_REVIEW`, `MISSING_MOCK_EXAM`, `MISSING_MIXED_PRACTICE` | RECOMMENDATION | the student may drop them |
| `INSUFFICIENT_TOPIC_WORK`, `INSUFFICIENT_PRACTICE_ALLOCATION`, `PRIORITY_ORDER` | RECOMMENDATION | depth and order follow stated preferences |
| `MISSING_SCOPE_TOPIC`, `CONFIRMED_SCOPE_MISMATCH` | BLOCKER | the plan would drop confirmed scope |
| `MISSING_UNDERSTAND/LEARN/ACTIVE_RECALL/PRACTICE/MASTERY_CHECK` | BLOCKER | Mastery's stage *presence* is the mode, per §40 |
| `RECALL_BEFORE_LEARNING`, `PRACTICE_BEFORE_LEARNING`, `MISTAKE_REVIEW_BEFORE_PRACTICE` | RECOMMENDATION | the *order* of stages is advice; their presence is not |
| `HARD_SESSION_LIMIT_EXCEEDED`, `HARD_WEEKLY_LIMIT_EXCEEDED`, `HARD_UNAVAILABLE_DAY_USED` | BLOCKER | explicit HARD limits the student themselves set |
| `INVALID_ITEM_CAPACITY` (15–240 min) | BLOCKER | an absolute engine bound, enforced at the request boundary |
| `ROADMAP_PERIOD_UNPLANNED`, `INSUFFICIENT_PERIOD_CAPACITY` | RECOMMENDATION | a deliberately free period, and a period above its *derived* target |

`lib/planner/expansion-policy.ts` codes are **audited but not yet overrideable**: period-expansion commits run through a different route, and Phase 3's slice is the draft-edit path. That is a stated boundary, not an omission.

## 25. Duration and capacity override behaviour

- **Softer than preferred (§36):** a SOFT `SESSION_LENGTH_PREFERENCE` breach raises `SESSION_LONGER_THAN_PREFERRED` with the student's own preferred length in the sentence; accepting it saves. A HARD `MAX_SESSION_MINUTES` breach raises `HARD_SESSION_LIMIT_EXCEEDED` and cannot be accepted (`BLOCKER_NOT_ACKNOWLEDGEABLE`, asserted). A duration outside 15–240 cannot even become a draft (`EditSchema`), and `validateHardConstraints` refuses it independently.
- **Above the weekly target (§37):** when no explicit HARD weekly maximum exists, the overrun is `WEEKLY_TARGET_OVERRUN` — "This plan is about 1 hour 15 minutes above your 10 hours weekly target. That target is yours to exceed — it is not a hard limit." — and it is acceptable. With an explicit HARD `MAX_WEEKLY_MINUTES`, the same draft raises `HARD_WEEKLY_LIMIT_EXCEEDED`, which is a blocker and cannot be accepted. One finding per reason (not one per over-full day), measured by a rolling seven-day window anchored on every date that holds work — the same measurement the Roadmap expansion path uses.
- **A rest date** the student keeps free is a warning (`SCHEDULED_ON_REST_DAY`), acknowledging that a rest day is a fact about their week rather than a prohibition on their own edit. A **closed weekday** (a HARD `UNAVAILABLE_WEEKDAY` or a zero-minute grid day) remains a blocker.

## 26. Telemetry

`PlannerEvent` gained `comparison_started`, `comparison_completed`, `comparison_failed`, `comparison_cached`, `comparison_skipped`, `overlap_corrected`, `coverage_suggestion_applied`, `preparedness_opened`, `preparedness_bulk_applied`, `preparedness_skipped`, `draft_warning_presented`, `draft_warning_accepted`.

Every declared event has a real emission point, which matters more than the list: `comparison_started/completed/failed/cached` in the comparison action, `preparedness_opened` when the matrix is disclosed, `draft_warning_presented/accepted` in the flexible-edit assessment, and — the two that answer the phase's actual product question — `comparison_skipped` and `preparedness_skipped` at the moment the student generates without them, which is the only honest moment at which "skipped" is a fact rather than an assumption.

Metadata gained `overlapCoveredCount`, `overlapPartialCount`, `overlapNewCount`, `overlapUnclearCount`, `overlapCorrectedCount`, `preparednessBulkEdits`, `preparednessSuggested`, `backgroundSourceCount`, `backgroundUnitCount`, `comparisonCacheHit`, `comparisonBytesIn`, `comparisonBytesOut`, `comparisonUnits`, `modelPasses`, `blockers`. All are counts or closed enums; the existing `plannerTelemetry` filter drops anything else, which is asserted (`searchProvider: "google"` never reaches the record, and no free-form key can be attached). No topic text, curriculum name, URL, source title or warning sentence crosses the boundary.

## 27. Accessibility

- The matrix uses real `<input type="radio">` inside a `role="radiogroup"` per unit labelled by that unit, plus real checkboxes and buttons; each state's accessible name says which unit it belongs to ("Weak for Matrices"). Arrow keys work because the control is native (asserted with focus).
- Every state has a visible text label; no meaning is carried by colour alone (the selected state adds a border and weight, but the text and the checked input carry it).
- Chapter groups are `<details>` with real summaries; the bulk toolbar is a labelled `role="group"`.
- The overlap map's corrections are labelled `<select>` elements ("Overlap for Matrices") and its buttons name their row ("Mark Matrices as studied", "Undo my correction for Matrices").
- `axe` passes on the matrix and on the overlap map (jsdom, `region` and `color-contrast` disabled as jsdom cannot evaluate them — stated plainly).

## 28. Performance and size (measured)

From `phase-3-measurements.test.ts`, `database-phase3.test.ts` and the existing surface tests:

| Measurement | Value |
| --- | --- |
| Brief at 40 confirmed topics | **6,117 bytes** (ceiling 65,536) |
| Brief at 158 nodes + a comparison | **21,650 bytes** |
| Comparison rows at that size | 8 (matches the engine's flattened units; `CHAPTER_UNITS`) |
| 50 comparison rows serialized | **8,022 bytes** |
| Comparison input characters (40 units, 2 sources-ish payload) | **28,491** (ceiling 30,000) |
| Comparison output characters | **7,402** (ceiling 8,000) |
| Search calls per comparison | ≤ 2 (planned queries), 1 in the reference run |
| Pages fetched per comparison | ≤ 4 |
| Model passes per comparison | **2** (1 plan + 1 compare), independent of unit count |
| Cache-hit path | **1.78 ms**, 0 searches, 0 fetches, 0 model calls |
| 40-unit Quick Plan render | ~52 ms (existing surface test, unchanged by the matrix) |
| Matrix render at 40 units | 40 radio groups, one collapsed chapter group, no horizontal overflow by construction |

Comparison latency against a *live* provider was not measurable (no search credentials) and is not claimed.

## 29. Tests, database and build

New suites (all passing):

| File | Tests | What it proves |
| --- | --- | --- |
| `__tests__/planner/comparison-contract.test.ts` | 21 | four states exactly, strict schema, no preparedness field, no URL field, unknown sourceId dropped, uncited assertion → UNCLEAR, omitted unit → UNCLEAR, invented unitRef dropped, OK/WEAK/UNAVAILABLE, both digest stalenesses, pipeline-version staleness, cache correctness, corrections preserve Sylf's record and retire on a scope change, suggestion scope, counts and sentence |
| `__tests__/planner/comparison-service.test.ts` | 10 | the reference A-Level→NET flow, bounded cost (calls/passes/fetches), no mastery language anywhere in the payload, cache reuse and forced re-run, and the three refusals that must never reach a provider |
| `__tests__/planner/flexible-draft-edit.test.ts` | 22 | audit consistency and completeness, hard codes stay hard, finding severity agrees with the audit, accept/refuse/stale/invented/blocker behaviours, §36 and §37 both ways, absolute bounds, no preparedness in any finding envelope |
| `__tests__/planner/preparedness-matrix.test.ts` | 9 | every state maps to the existing policy semantics, round-trip rendering, bulk patches, optionality, telemetry vocabulary is closed |
| `__tests__/planner/phase-3-ui.test.tsx` | 20 | matrix one-click/selection/chapter/40-unit/keyboard/axe, overlap summary once, uncertainty-first order, correction and suggestion controls, stale and unavailable states, background control never researching on a keystroke |
| `__tests__/planner/database-phase3.test.ts` | 12 | the whole arc on real PostgreSQL: compare → correct → bulk → suggestion → generate, correction persistence across a re-run, staleness withholding, unstated stays unstated, overlap never reaching the engine, foreign user denied, stale version refused, action-key replay — plus the **endpoint** exchange: an edit refused with findings, sealed once acknowledged (and that revision provably fails plain `validateDraft`), an invented code refused, a structural blocker reported and un-acknowledgeable, and a stale base refused |
| `__tests__/planner/phase-3-measurements.test.ts` | 6 | the numbers above |

The planner suite is **809 tests across 67 files** without a database, and **961 across 80** with the disposable-PostgreSQL harness (7 skipped are the live-provider smoke tests).

Verification commands and results are in §33.

## 30. Research and coexistence regressions

Unchanged and passing: search-provider, source-fetch-security, authority, research-agent, research-sources, research-service, research-measurements, import (outline/pdf/service/validate), scope-review, scope-confirmation, intake (brief/readiness/distribution/adapter/scope-sync/telemetry/findings), Quick Plan, Classic/Modes coexistence, Exam, Roadmap (+expansion), Mastery, replanning/rebalance, A1–A3, quality, security and accessibility suites. One Phase 2 assertion (`compareCurricula` → `NOT_AVAILABLE`) was updated to `IMPLEMENTED_ACTIONS`, and two source-panel assertions were updated for the new legend — both are contract changes this phase deliberately made.

## 31. Browser QA status

**Not performed.** No browser automation tooling is available in this environment, and jsdom renders are not browser QA — they cannot show layout, the 44px targets in practice, sticky headers, dark/light/custom appearance, or real mobile stacking. What *is* verified is the DOM contract and behaviour (names, order, states, absence of horizontal-only interaction by construction) and `axe`. This is stated plainly rather than dressed up.

## 32. Deviations

1. **`STUDIED_UNRATED` is a sixth one-click state.** §20 lists five; §26 requires `covered: true, confidence: null` to remain valid and useful. Rendering five buttons and hiding a reachable sixth state would have made the matrix lie about the brief, so the sixth is offered. Documented in `preparedness-matrix.ts`.
2. **Corrections are deliberately not part of the comparison digest** (§16). Reasoning in §9; the reuse guarantee is stronger, not weaker.
3. **Expansion-policy codes are audited but not yet overrideable.** Phase 3's slice is the draft-edit path; period-expansion commits arrive through their own route.
4. **Per-warning unit naming is bounded.** A warning names the units an edit *changed* (derivable, truthful) or the units a draft-only predicate identifies. Where the validator's reason depends on the student's preparedness, the sentence stays general rather than guessing a unit — an earlier version named the wrong unit and was corrected.
5. **The comparison's own pass count is 2 model calls, not 1.** One plans the search, one compares; `COMPARISON_LIMITS.modelPasses = 1` bounds the *comparison* pass. Both are reported separately.
6. **Two pre-existing UI assertions were updated** (source-panel legend, Quick Plan's now-ambiguous "Subject" label). Both are consequences of intended changes and both are recorded in §3/§29.
7. **Target provenance is not re-read during comparison.** After `confirmScope` the candidate — and with it the target's source records — is cleared by design (Phase 2), so the comparison uses the confirmed *structure* and researches the background. `brief.scope.provenanceRefs` holds ids whose records no longer exist to show. This is a real limitation of the phase and is listed as future work, not hidden.

## 33. Blockers before UX Phase 4

Nothing in Phase 3 is blocked. Outstanding **pre-public** items, unchanged in kind from Phase 2.1:

1. **Live research smoke** — a real Brave/Serper key and a real comparison run against a live target (recorded again because the credentials are still absent). Without it, the comparison's *status* rules are verified only against stubs.
2. **Browser QA** — the §31 list, on desktop and mobile, in dark/light/custom appearance.
3. **Public enablement** — deliberately out of scope for this phase.
4. **Generated-Quest release/deletion** — still deferred to the later editing/Copilot phase, as §38 requires.
5. **Post-confirmation editing relaxation** — deliberately partial: this phase makes *draft* edits accept-able; editing a confirmed plan still runs the full validator unless the student answers the assessment (which the endpoint supports), and no rollout decision has been made about which surfaces expose it.

---

## Explicit answers

**Can target and background curricula be compared?**
Yes. `compareCurricula` runs one bounded research operation against the background curriculum and classifies every confirmed unit against what it read, capped at 50 units and 2 model calls.

**Does comparison ever claim personal mastery or confidence?**
No. The result type has no preparedness field, so a row cannot carry `covered`, `confidence`, `difficult` or mastery; the row copy is about the curriculum; and no row claims the student remembers, knows well, or finds anything easy. Asserted by schema rejection and by a test that scans the serialized payload for preparedness vocabulary.

**Are overlap and preparedness separate data?**
Yes — separate fields, separate stores (`brief.comparison` vs `brief.preparedness`), separate actions, and no code path from one to the other except an explicit user action. Asserted end-to-end: after a comparison, `brief.preparedness` is still `[]`.

**Can comparison set confidence automatically?**
No. Nothing in the planner writes `confidence` except `setPreparedness`, `bulkSetPreparedness`, `setDifficulty`, `clearPreparedness` and `applyCoverageSuggestion` — and the last writes `confidence: null` by construction.

**Can comparison set difficult automatically?**
No. `difficult` is written only by an explicit action — the matrix's own checkbox (`setDifficulty`) or a `setPreparedness` that carries it — never by research or comparison.

**Can comparison set priority automatically?**
No. Research and comparison write no priority at all; the matrix's priority control is an explicit click sent as `setPriority` with `prioritySource: "USER_EXPLICIT"`, and `bulkSetPreparedness`, `setDifficulty`, `clearPreparedness` and `applyCoverageSuggestion` all preserve whatever priority is already there (asserted on real PostgreSQL).

**Can the student correct an overlap suggestion?**
Yes. Every row has a labelled correction control, and the correction is recorded with the target digest it was made against, preserving what Sylf originally said (`originalOverlap`).

**Do user preparedness corrections survive a re-run?**
Yes. Corrections live beside the comparison and are re-applied on every read, so `force: true` re-runs cannot erase them (asserted in the database suite). Correcting a unit also removes it from the coverage suggestion set.

One clarification §17 asks for explicitly: a correction is an answer about the *curriculum* ("that is not in what I studied"), not about preparedness ("I do not know it"), so it changes the overlap map and the suggestions without silently rewriting what the plan assumes. If the student also wants the plan to treat the unit as unstudied they say so in the matrix — one extra click, and the only path by which a curriculum statement can reach the engine.

**Can preparedness remain completely UNKNOWN?**
Yes. `null` throughout, no entry stored, and generation works: asserted that a brief with `preparedness: []` produces engine input with `coverage/confidence = null` for every unit.

**Can the student mark studied but confidence unknown?**
Yes — `covered: true, confidence: null`, as a first-class matrix state ("Studied, not rated") and as what `applyCoverageSuggestion` writes.

**Can a 40-topic scope be reviewed quickly?**
Yes, by construction and by measurement: the comparison flattens to the same units the engine will plan, rows are one line each, groups are chapter-level with bulk buttons, the likely-covered group is collapsed, and the matrix is one row per unit with chapter-level and selection bulk actions. A 40-topic brief is 6,117 bytes and renders in ~52 ms.

**Can the matrix be skipped entirely?**
Yes. It is a closed disclosure with no completion state, and the copy says skipping changes nothing.

**Does generation remain valid when the matrix is skipped?**
Yes. Readiness is unchanged (goal, scope, target, capacity), and a skipped matrix yields unstated preparedness, which the policy treats as "plan it as work to learn" — never as weakness.

**Does `researchPolicy = OFF` still prevent all external research?**
Yes, including comparison: the policy is checked first, and the test asserts zero search calls and zero model calls.

**Does comparison fail gracefully without a search-provider key?**
Yes — `UNAVAILABLE` with a named reason, no model call, background still enterable, matrix and generation unaffected. No dead end.

**Is Institutional clearly explained to the user?**
Yes. The panel now states that an Institutional source is a credible academic or government institution but **not verified as the authority for this specific target**, and the backend still never treats it as official.

**Can the student exceed a soft/recommended session duration?**
Yes, with a warning that names their preferred length and an explicit acceptance.

**Can the student exceed a weekly target with acknowledgement?**
Yes, when no explicit HARD weekly maximum exists: a warning stating how far above the target the plan is, acceptable in one click.

**Do HARD limits still block?**
Yes: HARD session limit, HARD weekly maximum, HARD unavailable weekday, the 15–240 absolute bounds, authentication, ownership, version/staleness, structure, references, lineage and reconciliation. None of them consults the audit table, and attempting to acknowledge one is refused with `BLOCKER_NOT_ACKNOWLEDGEABLE`.

**Were educational completeness codes audited individually rather than blindly converted?**
Yes. `DRAFT_RULE_AUDIT` classifies every code with a written reason; §24 tabulates the notable ones. Nothing was converted in a batch, and the codes the goal listed as "candidates" were not all converted — `MISSING_SCOPE_TOPIC`, `MISSING_UNDERSTAND`, `MISSING_LEARN`, `MISSING_ACTIVE_RECALL`, `MISSING_PRACTICE`, `MISSING_MASTERY_CHECK`, `CHECK_SCOPE_TOO_NARROW`'s structural cousins and `MISSING_PERIOD_TOPIC` all stayed hard, each with a reason.

**Is generated-Quest deletion still deferred?**
Yes. `releaseGeneratedItem` does not exist in the tree; nothing in Phase 3 touches Quests, links or execution.

**Is Classic/Modes coexistence unchanged?**
Yes. No change to `PlannerTab`, `PlannerModesChooser`, `PlannerWorkspace` or the Classic planner; the coexistence suites pass unchanged, Classic still opens by default, Planner Modes remain permanently available with no flag, and navigation is untouched.

**Is UX Phase 4 safe to begin?**
Yes, with the three pre-public items in §33 carried forward. Phase 3 left the engine, the intake foundation, research and Classic untouched, added no environment flag, raised no bound, and every new behaviour is behind an explicit user action.

---

## Verification (commands and results)

Every command below was run after the last code change, in this order.

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | **clean** — whole repository including all test files |
| `npx eslint` on every file Phase 3 changed | one **pre-existing** error, no new ones (below) |
| `npx prisma validate` | `The schema at prisma/schema.prisma is valid` |
| `node scripts/test-planner-postgres.mjs` (whole planner suite on a disposable PostgreSQL) | **75 files passed, 954 tests passed, 7 skipped** |
| `npx vitest run` (whole repository) | **187 files passed, 2 096 tests passed, 153 skipped** |
| `npm run build` | `✓ Compiled successfully in 15.0s`, route table emitted, exit 0 |
| `npm run audit:secrets` | `no credential patterns found in tracked files` |
| `npm run audit:models` | `0 active, 2 documentation-only, 22 historical reference(s)`; no active runtime, config, test or script selects a retired model |
| `npm run mobile:build` | `✓ built in 9.87s` |
| `npm run mobile:verify` | `PASSED. Zero server-only symbols or secrets found in mobile/dist.` (mock mode FAIL-CLOSED) |

Skipped tests are the ones that require credentials or configuration this environment does not have: the five `*-provider-smoke` suites (live model keys) and the `database-*` suites when run through plain `vitest` without `PLANNER_TEST_DATABASE_URL` — those same database suites are what the disposable-PostgreSQL run above executes, and they pass there.

**The one lint error is pre-existing and unrelated to Phase 3.** `app/components/planner/quick-plan/useIntake.ts:238` trips `react-hooks/set-state-in-effect` on the Phase 1 restore pattern (`useEffect(() => { void restore(); })` where `restore` sets `restoring` synchronously). I verified this is the *pattern*, not my change, by linting a minimal equivalent component that reproduces it; Phase 3 did not touch `restore` or that effect. Rewriting the restore flow is out of this phase's scope and would risk a well-tested surface, so it is reported rather than quietly "fixed".

