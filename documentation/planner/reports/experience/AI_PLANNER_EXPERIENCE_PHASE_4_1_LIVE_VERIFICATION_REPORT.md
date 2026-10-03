# AI PLANNER EXPERIENCE — UX PHASE 4.1
## LIVE RESEARCH + COPILOT VERIFICATION CLOSURE — REPORT

**Phase:** UX Phase 4.1 (verification only)
**Status:** complete — live gap closed, two defects found and fixed, two findings recorded unfixed
**Repository:** `/Users/aliumair/Desktop/sylf` (authoritative)
**Date of runs:** 2026-09-26
**Method:** a real, opt-in live suite that drives the production pipeline end to end with a real
DeepSeek key and a real Serper key, against the disposable PostgreSQL harness the repository
already uses.

---

## 1. Purpose and scope

Phase 4 was implementation-complete but carried one open item: the report stated that
`DEEPSEEK_API_KEY`, `SERPER_API_KEY` and `SEARCH_PROVIDER=serper` were present, and that **no
live bounded research request had ever been run**. This phase closes that gap.

What was done:

- Ran the real production research pipeline — Copilot interpretation → typed capability command
  → proposal confirmation → routing → `researchScope` / `compareCurricula` → `SearchProvider`
  (Serper) → `SafeSourceFetcher` → DeepSeek extraction → candidate/provenance → the
  confirmation boundary — across five scenarios.
- Inspected the actual results, not the status codes: domains, classifications, node labels,
  provenance closure, authority verdicts.
- Found **two genuine defects** and fixed both, each with a deterministic regression test proven
  to fail on the old behaviour:
  1. a research request on a `researchPolicy = OFF` plan was answered with
     `NOTHING_TO_DO` ("I could not find a change to make in that") instead of `RESEARCH_DISABLED`;
  2. the research cache **never hit** on real runs, because the candidate was stamped with the
     brief digest while the lookup compared against the question key.
- Recorded **two findings that were deliberately not fixed**, with evidence and a recommendation.
- Verified the migration timestamp question and the mixed-confirmation-boundary error copy.

What was *not* done, by design: no new Copilot commands, no Planner UI, no new providers or
classifiers, no research/comparison/provenance/release/replan behaviour changes, no release
re-offer UX, no browser-QA programme, no public enablement, no final integration phase. No
research bound was loosened. **No migration was created.**

---

## 2. Credential / configuration verification

Verified server-side before any smoke, and reported as configured/missing only — no key, key
prefix, length, header or `JWT_SECRET` appears in this report or in any run output.

| Variable | State |
|---|---|
| `DEEPSEEK_API_KEY` | configured (`.env`) |
| `SERPER_API_KEY` | configured (`.env`) |
| `SEARCH_PROVIDER` | `serper` |
| `DEEPSEEK_BASE_URL` | absent — default `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | absent — registry default |
| `.env.local` | present, supplies no research key |

Provider selection was confirmed through the production selector rather than by reading the file:
`selectSearchProvider().id === "serper"`. The active planner model is the registry value
`DEEPSEEK_MODELS.planner` → `deepseek-flash` (env-pinnable via `DEEPSEEK_FLASH_MODEL`); no model
string literal exists anywhere in the Planner research or Copilot code.

Outbound connectivity was confirmed independently: an unauthenticated request to
`https://google.serper.dev/search` returned HTTP 403 (i.e. reachable, rejected for want of a key),
so a network failure could not be mistaken for a credential failure later.

No credential was missing, so no `.env` / `.env.local` / process-environment diagnosis was
required and the live portion did not have to be stopped.

---

## 3. Exact production pipeline exercised

No alternate smoke-only implementation exists. The path is the application's own:

```
runCopilotTurn                          (lib/planner/copilot/run.ts)
  └─ deepseekCopilotModel().interpret   (lib/planner/copilot/model.ts → LLMFactory → DeepSeek)
  └─ mapCommands / mintProposal         (lib/planner/copilot/{map,proposal}.ts)
applyCopilotProposal                    (readProposal: signature, session, expiry, version)
  └─ returns the routed capability request body
applyIntakeAction                       (lib/planner/server/intake.ts)
  ├─ researchScope   → runResearchAgent (lib/planner/research/agent.ts)
  │     ├─ selectSearchProvider()       (lib/planner/research/search/provider.ts → Serper)
  │     ├─ deepseekModel().planQueries  (lib/planner/research/deepseek.ts)
  │     ├─ fetchSource()                (lib/planner/research/search/fetch.ts, SafeSourceFetcher)
  │     ├─ buildSource/rankSources      (lib/planner/research/sources.ts)
  │     └─ deepseekModel().extract
  └─ compareCurricula → runCurriculumComparison (lib/planner/research/comparison.ts)
        └─ same provider, same fetcher, comparison model
```

The harness (`__tests__/planner/live-research-smoke.test.ts`) **observes** rather than
intercepts: `globalThis.fetch` is wrapped in a pass-through counter that records host, workload
(identified from the request's system prompt) and provider-reported token usage, and clones —
never consumes — response bodies so a rejected shape can be reported as a schema path. No request
or response is rewritten, and no Planner module is replaced.

Run command (opt-in; skipped by default so ordinary suites never spend quota):

```
PLANNER_LIVE_RESEARCH_SMOKE=true node scripts/test-planner-postgres.mjs \
  __tests__/planner/live-research-smoke.test.ts
```

**Evidence run:** `8/8 tests passed in 267 239 ms`, on the exact frozen artifact — a final run was
made after the last instrumentation edit, so the committed file rather than a near-identical
predecessor is the thing verified. Seven live process runs were made in total (six full suite runs
and one focused probe), and §3.1 records what varied between them, because a single live run
presented as though it were deterministic would be the opposite of what this phase is for.

### 3.1 What varied between live runs

Live runs are not reproducible, and the variation is itself evidence. Across the runs:

| What | Variation observed |
|---|---|
| The query plan the model writes | Different queries each run, so different result sets — e.g. the NUST run returned 3 NUST hosts in one run and a different mix in another |
| NUST outcome | One run: 4 fetches, all refused → `UNAVAILABLE`/`FETCH_FAILED`. Another: one official PDF read successfully, but it was the wrong document → `UNAVAILABLE`/`RESEARCH_WEAK` |
| CAIE candidate size | 8 units in one run, 7 in another — same three official specification PDFs, slightly different structure read from them |
| Fictional-exam sources | Three `INSTITUTIONAL` sources in one run, two `SECONDARY` in another; zero official sources and zero units in every run |
| Comparison | All six target units `UNCLEAR` in every run and every attempt; the extraction schema-valid in 3 of 4 attempts, rejected in 1 |
| Interpreter | Contract-valid in most calls, rejected in 3 of roughly 75 |

What did **not** vary, in any run: provenance orphans (always zero), model-invented URLs reaching
provenance (never), confirmed-scope mutation by research (never), preparedness inferred from a
syllabus or a comparison (never), official classification of a non-authority host (never), and
external research calls under `researchPolicy = OFF` (never — zero, every time).

---

## 4. NUST NET live smoke (Scenario A)

**Request:** *"Find the official syllabus for NUST NET Engineering."*
Clean intake: mode `EXAM`, goal `NUST NET Engineering`, subject `Mathematics`, target +90 days,
600 min/week, empty scope, `researchPolicy = ALLOW`.

| Measurement | Value |
|---|---|
| Copilot interpretation | `PROPOSED` / intent `RESEARCH_REQUEST` / 1 model pass |
| Capability route | `RESEARCH` → request `{ action: "researchScope" }` |
| Brief before routing | unchanged (0 scope nodes, `confirmedAt` null) |
| Search calls | 1 (one query; the agent stops early once authority is in hand) |
| Search results returned | 8 |
| Result domains | `nust.edu.pk`, `ugadmissions.nust.edu.pk`, `connected.nust.edu.pk` |
| Fetches attempted | 4, on `nust.edu.pk` / `connected.nust.edu.pk` |
| Model calls | 2 (`RESEARCH_PLAN`, `RESEARCH_EXTRACT`); 5 600 in / 2 431 out tokens |
| Final status | `UNAVAILABLE`, confidence `LOW`, failureCode `RESEARCH_WEAK` |
| Candidate size | **0 nodes**, 1 source (`nust.edu.pk`, `OFFICIAL_PDF`, cited by nobody) |
| Latency | 18 733 ms |
| Provenance orphans | **0** |
| Hallucinated URLs | **0** |
| Confirmed scope | untouched (still 0 nodes, `confirmedAt` null) |
| Preparedness inferred | **none** |

**What actually happened, and why.** The search *worked*: Serper returned NUST's own hosts, the
ranking put them first (correct — they are the verified authority for this target), and the agent
tried to read the top four. One page came back — an official PDF on `nust.edu.pk` — and the
extraction pass read it and returned **nothing**, with its own note: *"The provided pages describe
the BS-HND 2026 Student Handbook and do not contain a syllabus or unit structure for NUST NET
Engineering."* The candidate therefore kept one official source and zero units, and the status rule
(`!nodes.length → UNAVAILABLE`) produced an honest empty rather than a plausible-looking syllabus
assembled from a handbook.

**This scenario has two different live outcomes, and both are honest.** An earlier run's plan chose
different NUST pages and every fetch was refused, giving `UNAVAILABLE`/`FETCH_FAILED` with zero
sources. A separate probe through the same production fetcher returned `FETCH_FAILED` for all six
URLs it tried, and a raw HTTP probe established why:

- `https://nust.edu.pk/` and subdomains → **HTTP 403** to a non-browser user agent (WAF/CDN bot
  control) on most paths;
- `https://connected.nust.edu.pk/` → TLS failure
  (`ERR_SSL_UNSAFE_LEGACY_RENEGOTIATION_DISABLED`).

So NUST's host is not uniformly unreachable, but it is unreliable for a non-browser client, and the
pipeline reports whichever honest outcome the run actually earned.

**Classification (§17):** upstream site access control, not a Sylf bug. The ranking was right, the
fetcher was right, and the bounded outcome is honest: *"I found pages but could not read any of
them. You can upload a syllabus, paste an outline, or enter the scope yourself."* Sylf
deliberately identifies itself as a non-browser client and this phase did **not** weaken any
fetcher control to get around a 403 — see §18.

**Cache, on a run that answered nothing.** The same request was repeated against the same brief.
The lookup was *not* reused — it searched (1 call) and ran two model calls again — because a
candidate with no units is a record that the lookup failed, not an answer. That is the new guard
described in §20, verified live.

---

## 5. NUST source-quality review

Answering the questions §6 asks, from the real results rather than from the pipeline's own claims:

- **Did Serper return NUST-owned material?** Yes. Every result the plan produced was on
  `nust.edu.pk` or a subdomain (`ugadmissions.`, `connected.`). Searched-but-unused results in the
  wider result set included the expected secondary material (`facebook.com`, `scribd.com`,
  `youtube.com`, prep sites) — none of which was promoted.
- **Was the official NUST host correctly recognised?** Yes. `resolveAuthorities({goal:"NUST NET
  Engineering"})` returns `nust.edu.pk` via the university registry, and `classifyHost` returns
  `OFFICIAL` for it and for its subdomains — checked both live and offline in the same run.
- **Did the official source actually concern NET/admissions/scope?** This is where the live runs
  differ, and the difference is instructive. One run's top result — "SUBJECTS INCLUDED IN NET WITH
  WEIGHTINGS" on `nust.edu.pk` — is precisely the right document, found first and ranked first; it
  could not be read. Another run did read an official `nust.edu.pk` PDF, but it was the **BS-HND
  2026 Student Handbook**, not a NET syllabus.
- **Did any secondary coaching/prep result outrank official material?** No. Official hosts held
  the top ranks in every observed result set.
- **Did DeepSeek extract claims not grounded in the fetched sources?** In the run that read the
  handbook, the extraction pass saw an official NUST document and returned **an empty scope** with
  a note naming the document for what it was. That is exactly the behaviour required: a document
  that is official but off-topic produced nothing, rather than a handbook being mined for
  plausible-looking units.
- **Did the hierarchy contain obvious unrelated topics?** Not applicable: no hierarchy was
  produced in any run.
- **Were source mappings plausible?** Not applicable: no unit cited a source in any run.
- **Was any source obviously irrelevant?** In the *wider* result set, yes — YouTube, Facebook,
  Reddit and Scribd results for a syllabus query are noise. None reached provenance: they were
  ranked below the official material and never fetched or cited.

**Operational finding (recorded, not fixed).** Because ranking puts verified authority first and
the agent fetches only the top `maxFetchedSources = 4`, a target whose own host refuses to serve us
can consume the entire fetch budget and produce nothing — a total `FETCH_FAILED` rather than a
`WEAK` candidate built from the secondary pages that *were* readable (in the probe, `maqsad.io`
returned 11 938 characters of text and would have made a usable preview). The module comment
already says an unfetchable source is "skipped, not fatal"; the behaviour is faithful to that
within the chosen four, but not beyond them. Whether `maxFetchedSources` bounds *attempts* or
*successful reads* is a Phase 2 architectural question, and changing it would alter research
outcomes for every target — so it is a recommendation for the final quality phase, not a Phase 4.1
change. No hardcoded NUST content was added anywhere, and the final run's outcome shows the system
does not need one: it read an official NUST document and correctly declined to make a syllabus out
of it.

---

## 6. CAIE A-Level Mathematics live smoke (Scenario B)

**Request:** *"Find the official syllabus for CAIE A-Level Mathematics."*
Intake: goal `CAIE A-Level Mathematics`, subject `Mathematics`, board `CAIE` / level `A-Level` set
through the structured background control (the control that populates
`backgroundCurriculum.{board,level}`, which is what authority resolution reads).

| Measurement | Value |
|---|---|
| Copilot interpretation | `PROPOSED` / `RESEARCH_REQUEST` |
| Capability route | `RESEARCH` → `{ action: "researchScope" }` |
| Authority hosts resolved | `cambridgeinternational.org`, `cie.org.uk` |
| Search calls | 1 |
| Results returned | 8 |
| Result domains | `cambridgeinternational.org` |
| Fetches attempted | 8 |
| Model calls | 2 (`RESEARCH_PLAN`, `RESEARCH_EXTRACT`); 7 632 in / 5 088 out tokens |
| **Final status** | **`OK`, confidence `HIGH`** |
| Candidate size | 7 nodes, 3 sources |
| Latency | 54 791 ms |
| Provenance orphans | **0** |
| Confirmed scope | untouched |
| Preparedness inferred | **none** (`preparedness.length === 0` after the run) |

**Sources, as stored:**

| Domain | Stored type | Recomputed live | Title |
|---|---|---|---|
| cambridgeinternational.org | `OFFICIAL_PDF` | `OFFICIAL` | `415060-2020-2022-syllabus.pdf` |
| cambridgeinternational.org | `OFFICIAL_PDF` | `OFFICIAL` | `597421-2023-2025-syllabus.pdf` |
| cambridgeinternational.org | `OFFICIAL_PDF` | `OFFICIAL` | `723728-2026-2027-syllabus-update.pdf` |

**Candidate hierarchy as read from the documents' own wording:** `Subject content`, `Pure
Mathematics 1 (for Paper 1)`, `Pure Mathematics 2 (for Paper 2)`, `Pure Mathematics 3 (for Paper
3)`, `Mechanics (for Paper 4)`, `Probability & Statistics 1 (for Paper 5)`, `Probability &
Statistics 2 (for Paper 6)` — a real CAIE Mathematics structure, labelled with the specification's
own headings rather than invented ones. Summary: *"I found 7 units from 3 official sources."*
(A different run produced 8 units from the same three PDFs, adding `Prior knowledge` as a
top-level unit; the documents are the same, the reading of them differs slightly.)

This is the one scenario where the whole chain completed: Copilot → capability → Serper → real
Cambridge hosts → `SafeSourceFetcher` → PDF text extraction → DeepSeek hierarchy → candidate.
Confirmation was still required and still had not happened when the run ended.

**Cache on a successful run:** the identical request against the same brief produced
`0` search calls, `0` fetches, `0` model calls, identical `retrievedAt`, node count and source
count — **54 ms** against 54 791 ms. This is the §20 cache verification, and it is only true
because of the fix in §20 below.

---

## 7. Fictional-exam live smoke (Scenario C)

**Request:** *"Find the official syllabus for International Quantum Aptitude Board QX-900
Engineering Entrance Examination."*

| Measurement | Value |
|---|---|
| Copilot interpretation | `PROPOSED` / `RESEARCH_REQUEST` |
| Capability route | `RESEARCH` → `{ action: "researchScope" }` |
| Search calls | 1 |
| Results returned | 7 |
| Result domains | `admission.aglasem.com`, `aglasem.com`, `jeetphysics.in`, `mykollege.in`, `scribd.com`, `shiksha.com` |
| Fetches attempted | 5 |
| Model calls | 2; 3 705 in / 3 600 out tokens |
| **Final status** | **`UNAVAILABLE`, failureCode `RESEARCH_WEAK`** |
| Candidate size | **0 nodes**, 2 sources, both `SECONDARY` |
| Official sources | **0** |
| Latency | 27 211 ms |
| Provenance orphans | **0** |
| Hallucinated authority | **none** |

The deliberate fiction produced exactly the intended behaviour: Serper returned noise — exam-portal
aggregators, a coaching site, Scribd, a study-abroad portal, and (in another run) quantum
programmes at real universities — and **none of it was upgraded**. The two readable pages were
classified `SECONDARY` (in an earlier run, three genuine university pages were classified
`INSTITUTIONAL`): credible or not, none of them is *the* authority for a body that does not exist.
The candidate was refused a hierarchy and the summary is *"I could not read a usable scope from the
pages I found."*

Critically, **no model-memory fallback occurred**: there is no path in `runResearchAgent` that
substitutes recall for evidence, and the DeepSeek model was never asked to answer from memory. No
invented domain, no invented syllabus, no fake official source, no fabricated hierarchy presented
as fact. The candidate is safe to show — it is an honest empty.

---

## 8. researchPolicy OFF live-config test (Scenario D)

Against the **real** deployment, with a real Serper key now present, on an intake whose stored
`researchPolicy` is `OFF`:

**Request:** *"Find the official syllabus."*

| Measurement | Value |
|---|---|
| Copilot interpretation | attempt 1 was a model-layer failure (`COPILOT_BAD_OUTPUT`, retried per policy); attempt 2 returned intent `RESEARCH_REQUEST` correctly, **with no command** |
| Closed response | `REFUSED` / `RESEARCH_REQUEST` / **`RESEARCH_DISABLED`** |
| Model calls across both attempts | 2 (interpretation only) |
| Message | *"Web research is off for this plan. I can work only from what you have given me — turn research back on in the scope controls and I will look."* |
| Serper requests | **0** |
| `SafeSourceFetcher` requests | **0** |
| Research/plan/extract model calls | **0** |
| Comparison model calls | **0** |
| Candidate produced | none |
| Brief | unchanged (version 2, `researchPolicy` still `OFF`, no candidate) |

This is the strongest form of the §27 assertion: policy is absolute **with credentials present**,
so the refusal is a decision and not a side effect of missing configuration. The check exists
twice in `runCopilotTurn` — once on the intent (new, see §20) and once on the commands (the
original security boundary) — so neither a compliant model nor a disobedient one can search.

---

## 9. NUST vs A-Level comparison smoke (Scenario E)

**Request:** *"Compare this with my A-Level background."*
Target: 6 confirmed `NUST NET Engineering` units. Background: `CAIE A-Level` (board `CAIE`),
subjects Mathematics, Physics, Computer Science.

| Measurement | Value |
|---|---|
| Copilot interpretation | `PROPOSED` / `COMPARISON_REQUEST` |
| Capability route | `COMPARISON` → `{ action: "compareCurricula" }` |
| Search calls | 2 |
| Results returned | 12 (16 by the end of the run) |
| Fetches attempted | 10, all `cambridgeinternational.org` |
| Model calls | 2 (`RESEARCH_PLAN` + `COMPARISON_EXTRACT`); 2 997 in / 3 200 out tokens |
| Status | `UNAVAILABLE` |
| Target units | 6 |
| Result counts by overlap state | `UNCLEAR: 6` — no unit asserted |
| Sources | 3, all `cambridgeinternational.org` (1 `OFFICIAL_PDF`, 2 `OFFICIAL`), none cited |
| Provenance orphans | **0** |
| Preparedness before / after | 0 / **0** |
| Overlap corrections written | 0 |
| Latency | 43 644 ms (forced retry: 73 861 ms) |

**Invariants checked, all holding:** exactly the four documented overlap states appear and nothing
else; overlap did not become preparedness (the brief's `preparedness` array is byte-for-byte
unchanged and no correction was written); no confidence, difficulty or priority was inferred; no
URL the model produced entered provenance; unknown source ids would have been dropped (the
extraction's citations all resolved to issued ids); and because no unit was asserted, the overall
status could not become `OK`.

**Two live attempts in this run, both schema-valid, both inconclusive.** The extraction passed
`ComparisonExtractionSchema` on **both** attempts (`schemaPassed: true`, keys `backgroundUnits`,
`units`, `unresolved`, `comparisonConfidence`) and every one of the six target units came back
`UNCLEAR`, each attempt with its own note:

> *"The pages do not contain the syllabus content for CAIE A-Level Mathematics, so topic coverage
> cannot be determined."*

> *"The provided pages list only top-level A-Level Mathematics component headings and do not
> enumerate the specific subtopics needed to settle any target unit."*

Across the phase's runs that pattern held in every attempt but one, where the extraction shape
itself was rejected and the run reported the model-layer failure instead. Either way the
comparison could not be settled live, and it said so.

**Quality assessment:** the pipeline behaved correctly and conservatively — it declined to assert
an overlap it could not evidence, rather than guessing. The limiting factor is source selection
for a *background* curriculum: searching for "CAIE A-Level Mathematics" returns genuine Cambridge
pages (grade thresholds, notices, a subject list) that are official but do not enumerate topic
content, so there is nothing unit-level to compare against. That is a search/source-selection
quality finding, not a contract violation — and it is what §17 calls a provider/quality limitation
rather than a Sylf bug.

**Finding: the closed failure code is mislabelled.** When rows come back but none can be asserted,
`comparisonFromExtraction` sets `failureCode = "COMPARISON_MODEL_BAD_OUTPUT"` on the branch
`ranked.length ? "COMPARISON_MODEL_BAD_OUTPUT" : "COMPARISON_FETCH_FAILED"`. In runs 3 and 5 the
model's output was schema-valid and correctly cited real official sources; calling that "model bad
output" is false. Recorded, **not fixed** — see §19.

---

## 10. Live Copilot interpretation sanity set

Six real messages, real DeepSeek, on a seeded brief with a confirmed 3-unit scope and a
`CAIE A-Level` background. Five passed on their first attempt; the sixth's first attempt was a
model-layer failure and passed on the single permitted retry.

| # | Message | Model intent | Commands produced | Server outcome | Verdict |
|---|---|---|---|---|---|
| 1 | "Find the official syllabus for NUST NET Engineering." | `RESEARCH_REQUEST` | `REQUEST_SCOPE_RESEARCH` | `PROPOSED` → capability `RESEARCH` | PASS |
| 2 | "Compare this with my A-Level background." | `COMPARISON_REQUEST` | `REQUEST_CURRICULUM_COMPARISON` | `PROPOSED` → capability `COMPARISON` | PASS |
| 3 | "I cannot study Fridays." | `AVAILABILITY_UPDATE` | `SET_CONSTRAINT{kind:UNAVAILABLE_WEEKDAY, strength:HARD, value:5}` | `PROPOSED` | PASS |
| 4 | "Try not to schedule Fridays." | `AVAILABILITY_UPDATE` | `SET_CONSTRAINT{kind:UNAVAILABLE_WEEKDAY, strength:SOFT, value:5}` | `PROPOSED` | PASS |
| 5 | "I studied matrices but I don't know how good I am." | `PREPAREDNESS_UPDATE` | `SET_PREPAREDNESS` | **`ROUTED`** (direct execution) | PASS |
| 6 | "I hate vectors." | `PREFERENCE_UPDATE` | **none** | `REFUSED` / `NOTHING_TO_DO` | PASS (2nd attempt; 1st was a rejected answer) |

Case 3 versus case 4 is the §49 hard/soft distinction working on real language: "I cannot study
Fridays" produced a **HARD** `UNAVAILABLE_WEEKDAY` for weekday 5 (Friday), and "Try not to
schedule Fridays" produced the same constraint at **SOFT** strength. The model never silently
promoted a preference into a rule. Neither case was applied — the sanity set inspects
interpretation only and the proposals were abandoned.

Case 5 shows §21's direct-execution policy working: a single, high-confidence, reversible
preparedness change in the allowlist applied directly (`outcome: ROUTED`). The check reads the
*brief* rather than the response, and `Matrices` was left `covered: true, confidence: null` —
exactly `STUDIED_UNRATED`, exactly what the structured preparedness matrix writes.

Case 6 is the "do not over-interpret emotion" rule holding under real language: the model
classified dislike as a preference, emitted **no command**, and the server refused
(`NOTHING_TO_DO`) rather than inventing a weakness. No `SET_PREPAREDNESS{WEAK}`, no
`SET_DIFFICULTY`, no priority. Both the command channel and the brief were checked.

**Interpretation reliability, observed.** The contract-valid output rate was not 100 % across the
phase: of roughly seventy-five live interpretation calls (six full suite runs plus a focused probe of
six), **three** turns came back as a model-layer failure rather than an interpretation. Two were
confirmed as `COPILOT_BAD_OUTPUT` — the model's answer was rejected by
`PlannerCopilotInterpretationV1Schema` — and one, earlier in the phase before the harness recorded
codes, was a model-layer failure of unrecorded type. In both confirmed instances the exact failing
path was captured, and it was the same one both times: **`clarification`, code `invalid_union`**,
i.e. a `clarification` object matching neither branch of the union (both of which are
`z.strictObject`s). In the same turn the model had produced the correct intent **and** the correct
command, and the whole turn was thrown away over a field that carries no authority. That is a ~5 %
false-failure rate on messages the model had otherwise understood.

The retry policy is deliberately narrow — retry only `MODEL_UNAVAILABLE` / `COPILOT_BAD_OUTPUT`,
once, and record every attempt — and the sanity set treats a model failure as `MODEL_FAILED`, never
as a pass, because every case in the set is about a brief that did not change and a refusal would
otherwise satisfy each check vacuously.

The failure is bounded and honest (`COPILOT_BAD_OUTPUT` → *"I could not read that request. Try
rephrasing it as one clear change."*), changes nothing, and makes no external call — but it is
recorded as a finding in §19, and the harness now captures per-branch contract issues
(`contractIssues`), so the next occurrence will name the field rather than the union.

---

## 11. Provenance inspection

**Rule under test:** every canonical source URL must originate in a `SearchProvider` result or in
a validated `SafeSourceFetcher` redirect hop — never in Copilot prose, a query plan, an extraction,
or an explanation.

The harness reconstructs the admissible set from the wire: every URL Serper returned (read from
the response body, normalised exactly as `provider.ts` normalises) union every URL the fetcher
actually requested (each redirect hop is its own request), and diffs the candidate's source URLs
against it.

| Scenario | Candidate sources | Provenance orphans |
|---|---|---|
| A — NUST NET | 0 | **0** |
| B — CAIE A-Level Mathematics | 3 | **0** |
| C — fictional exam | 3 | **0** |
| E — comparison | 4 | **0** |
| E — comparison retry | 0 | **0** |

One complete candidate was inspected in full (Scenario B): three sources, all
`cambridgeinternational.org`, all `OFFICIAL_PDF`, titles being the actual specification filenames,
each reachable from the fetched set, `nodeIds` and `sourceIds` resolving to issued ids only.

The harness also scans every model response body for URL-shaped strings, as evidence about model
behaviour rather than as a control: URLs did appear in model output (the extraction prompt shows
the model the real URL of each excerpt, so echoing one is expected), and **not one of them was
outside the admissible set** — `modelOnlyUrls` was empty in every scenario. A URL a model composed
would have nowhere to land in any case: `ResearchExtractionSchema` and `ComparisonExtractionSchema`
have no URL field, and `nodesFromExtraction` drops any `sourceId` the server did not issue.

---

## 12. Authority / source classification observations

Live, on the real result sets:

- **NUST:** `nust.edu.pk` and its subdomains classified `OFFICIAL`; the official hosts held the
  top ranks; secondary material in the wider result set stayed `SECONDARY`.
- **CAIE:** with board `CAIE` recorded, `cambridgeinternational.org` (and `cie.org.uk`) classified
  `OFFICIAL`, and Cambridge specification PDFs became `OFFICIAL_PDF` by path shape. All three
  stored classifications were independently recomputed live and matched.
- **Fictional exam:** no host earned `OFFICIAL`; three genuine university hosts earned
  `INSTITUTIONAL` and no more.
- **The distinction holds in both directions** (checked offline in the same run, using the
  production classifier):

| Host | Target | Verdict |
|---|---|---|
| `nust.edu.pk` | NUST NET Engineering | `OFFICIAL` |
| `nust.edu.pk` | CAIE A-Level Mathematics | `INSTITUTIONAL` |
| `cambridgeinternational.org` | CAIE A-Level Mathematics | `OFFICIAL` |
| `cambridgeinternational.org` | NUST NET Engineering | `SECONDARY` |
| `ox.ac.uk` | CAIE A-Level Mathematics | `INSTITUTIONAL` |
| `mit.edu` | NUST NET Engineering | `INSTITUTIONAL` |
| `prep-academy-online.com` | NUST NET Engineering | `SECONDARY` |
| `nustian-academy.com` | NUST NET Engineering | `SECONDARY` |

An unrelated `.ac.uk` / `.edu` page earns `INSTITUTIONAL` and never `OFFICIAL`; a preparation site
with a plausible name earns nothing, including one named after the university itself. No
classification rule was touched to make any live run green.

---

## 13. Search-provider quality observations

Serper works and returns real, relevant URLs. Bound behaviour was exactly as designed: the agent
sent **one query** per research run in four of five scenarios (it stops early once two official
results are in hand), and two only when the first query did not supply authority. `maxSearchQueries
= 2` and `maxResultsPerQuery = 8` were never approached, let alone exceeded.

Quality, honestly:

- **Official-document discovery is strong when the authority publishes a PDF.** The CAIE run
  returned three real Cambridge specification PDFs on the first query.
- **Official-document discovery is strong even when the document is unreachable.** The NUST run
  returned the correct NUST page at rank 1 — the failure was downstream.
- **Background-curriculum queries are weaker.** For "CAIE A-Level Mathematics" as a *background*,
  the results were official but generic (grade thresholds, notices, a subject list), which is what
  made the comparison inconclusive.
- **Noise is present but harmless.** YouTube, Facebook, Reddit and Scribd results appeared for
  syllabus queries; ranking never let them past the official material, and none reached provenance.

No workaround was applied for any of this: no query was hardcoded, no exam content was embedded,
and no ranking rule was bent to improve a live result.

---

## 14. DeepSeek extraction-quality observations

- **`RESEARCH_PLAN` (query planning)** produced well-formed, bounded plans every time: 1–2 queries,
  correct closed `purpose` values, no URLs, no invented domains, and it used the verified authority
  hosts when given them.
- **`RESEARCH_EXTRACT` (syllabus reading)** produced a genuine hierarchy when it had readable
  material: seven real CAIE component headings under `Subject content` (eight in another run, which
  also read `Prior knowledge`), using the specification's own
  labels, and all three citations resolving to issued source ids. Nothing unrelated appeared.
- **`RESEARCH_EXTRACT` refused to invent when it had nothing**: with no readable pages it was never
  called at all, and the run failed honestly rather than producing a plausible syllabus.
- **`COMPARISON_EXTRACT`** was conservative in the right direction: given official pages that did
  not enumerate topics, it left every unit `UNCLEAR` and wrote down why, instead of asserting
  overlaps. It also produced one shape the `ComparisonExtractionSchema` rejected on a forced retry,
  which was reported as an honest failure rather than retried into a guess.
- **No preparedness, confidence, difficulty, priority or mastery value was ever inferred** from a
  syllabus or a comparison in any scenario: `preparedness` was empty in Scenarios A, B, C and
  unchanged in Scenario E.

---

## 15. Cache verification

Two live cache checks, one per direction:

**Successful lookup is reused (§20's requirement).** Scenario B, CAIE A-Level Mathematics:

| | First run | Repeat |
|---|---|---|
| Search calls | 1 | **0** |
| Fetch calls | 8 | **0** |
| Model calls | 2 | **0** |
| `retrievedAt` | — | identical |
| Nodes / sources | 7 / 3 | identical |
| Latency | 54 791 ms | **54 ms** |
| Status | `OK` | `OK` |

**Failed lookup is not reused.** Scenario A, where nothing usable was read: the repeat searched
(1 call) and ran two model calls again and produced the same honest `UNAVAILABLE`, because a
candidate with no units is not an answer. Without this guard, fixing the key alone would have
pinned a transient outage — or here, an upstream site refusing to serve us — to the session for as
long as the brief stood, and would have silently refused the retry the failure message invites.

**Refresh bypasses the cache only when asked.** `compareCurricula` takes `force`; the harness used
it explicitly for the second comparison attempt and got a fresh search (2 calls across the run),
which is the intended behaviour. No other path force-refreshes, and nothing turns the cache off.

The cache test deliberately ran against a *successful* scenario, as the goal specifies, because
before the fix in §20 there was no successful cache hit to observe at all.

---

## 16. Cost / call counts

Measured from the wire (provider-reported usage; every model response carried a usage block —
`unreportedUsage: 0` throughout).

| Operation | Serper calls | Results returned | Fetches | DeepSeek calls | Input tokens | Output tokens | Wall clock |
|---|---|---|---|---|---|---|---|
| Copilot turn — ordinary | 0 | 0 | 0 | 1 (`COPILOT_INTERPRET`) | not recorded per turn | not recorded per turn | not recorded per turn; the 6-case sanity set plus 2 boundary turns ran in 26.9 s, i.e. ≈ 3 s per turn |
| Copilot turn — research/comparison routing | 0 | 0 | 0 | 1 | — | — | included in the scenario totals below |
| Research — NUST NET (no usable scope) | 1 | 8 | 4 | 2 (plan + extract) | 5 600 | 2 431 | 18.7 s |
| Research — CAIE A-Level Maths (`OK`) | 1 | 8 | 8 | 2 (plan + extract) | 7 632 | 5 088 | 54.8 s |
| Research — fictional exam | 1 | 7 | 5 | 2 | 3 705 | 3 600 | 27.2 s |
| Research — cached repeat | **0** | 0 | **0** | **0** | 0 | 0 | 0.054 s |
| Comparison — NUST vs CAIE A-Level | 2 | 12 | 10 | 2 (plan + compare) | 2 997 | 3 200 | 43.6 s |
| Comparison — forced retry | 2 | 16 | 8 | 2 | — | — | 73.9 s |
| `researchPolicy = OFF` refusal | **0** | 0 | **0** | 2 (two interpretations) | — | — | 5.6 s |

Two operations in the Phase 4 cost model were **not** exercised live and their costs are therefore
not claimed from measurement: an `EXPLAIN` turn (which adds one wording pass, giving two Copilot
model calls) and a `RELEASE` confirmation (which runs no model at all). Both are covered by the
deterministic suites; the live set verified the four operations §19 asks about — research,
comparison, routing and the policy refusal.

**Model passes per operation never exceeded `COPILOT_LIMITS.maxModelPassesPerTurn = 2`** and never
exceeded `RESEARCH_BOUNDS.maxModelPasses = 2`. A Copilot turn that routes research costs **one**
Copilot call and then the research pipeline's own two — three across the whole operation, and never
stacked in a single turn, because routing returns a request body rather than executing the
capability. Research and comparison each ran exactly one search plan and one extraction pass.

**No telemetry content was added.** Queries and result URLs appear here because this is a manually
written verification report; production telemetry remains counts, closed enums and buckets only.

---

## 17. Latency

| Step | Observed |
|---|---|
| Copilot interpretation turn (ordinary) | ≈ 3 s (8 sanity/boundary turns in 26.9 s) |
| Copilot routing turn (research / comparison) | not isolated — measured only as part of the scenario totals below |
| `researchPolicy = OFF` refusal | 5.6 s (two attempts; a clean single attempt in an earlier run: 2.7 s) |
| Research, no usable scope | 18.7 s |
| Research, full (`OK`) | 54.8 s |
| Research, cached | **0.054 s** |
| Comparison, full | 43.6 s |
| Comparison, forced retry | 73.9 s |
| Whole live suite (8 tests, 5 scenarios, 2 forced retries) | 267.2 s |

Every latency is dominated by provider round-trips, not by Planner code: the cached research
repeat at 54 ms is the floor for any operation that does no network work, three orders of magnitude
below the run it replaced. The forced comparison retry at 73.9 s is the slowest single operation
observed and is bounded by `COMPARISON_LIMITS.modelTimeoutMs = 45_000` per model pass plus the
search and fetch timeouts. Run-to-run latency varies with provider response time — the same CAIE
scenario took 31.6 s in one run and 54.8 s in another — so these are observations, not benchmarks.

---

## 18. Security / fetcher observations

**Nothing was weakened.** Every control was inspected and left exactly as it was:

- private-range, loopback, link-local and metadata blocking (`isBlockedAddress`), including the
  IPv4-mapped IPv6 form;
- bare-hostname and `.local` / `.internal` / `.home.arpa` blocking (`isBlockedHostname`);
- per-redirect revalidation, with each hop going through the same vetting as the original;
- the MIME allowlist (`text/html`, `text/plain`, `application/xhtml+xml`, `application/pdf`);
- the byte ceiling (`maxFetchBytes = 3 MiB`) enforced while reading, not after;
- the fetch timeout, the redirect ceiling (`maxRedirects = 3`), and the refusal of credentials in
  a URL.

**The one case where a control was "in the way" was left alone.** NUST's own host answers 403 to
a non-browser user agent, which is precisely the situation in which a tempted implementer would add
browser impersonation or a fallback proxy. Neither was added. The fetcher identifies itself
honestly (`SylfPlanner/1.0 (+https://sylf.app; syllabus research)`) and the honest failure was
reported to the student with a usable next action.

**Fetcher observations from live traffic:** the connector handled HTML and PDF correctly
(CAIE specification PDFs were fetched and text-extracted, producing the run's 7 units); it
followed redirects without incident on `cambridgeinternational.org`; and it mapped upstream
conditions correctly — HTTP 403 → `FETCH_FAILED`, TLS legacy-renegotiation refusal → `FETCH_FAILED`
— never confusing "could not open the page" with "opened it and found nothing".

**Ownership and identity:** every scenario derived its user from the disposable database, passes
`userId` from server state, and no model output can carry a user, session or owner id — the
interpretation and extraction schemas have no field for one. No credential appeared in any run
output.

---

## 19. Defects found

Two defects were found and fixed (§20). Two further findings were recorded deliberately unfixed.

### D1 — research request on a switched-off plan answered as "nothing to do" *(fixed)*

- **Scenario:** intake with `researchPolicy = OFF`, message *"Find the official syllabus."*
- **Observed:** `REFUSED` with code **`NOTHING_TO_DO`** and copy *"I could not find a change to
  make in that. Tell me what you would like different about the plan."*
- **Layer:** Copilot routing (`lib/planner/copilot/run.ts`), branch ordering.
- **Cause:** the model *obeys* its instruction not to request research on an OFF plan, so it
  returns intent `RESEARCH_REQUEST` with **no command**. The empty-commands branch ("nothing to
  do") runs before the research-policy branch, so the policy message never fired. The security
  property held — zero search, fetch or research-model calls — but the answer was useless as a
  response to a question about research, and Phase 4 §27 explicitly promises the explanation.
- **Severity:** user-visible, on a natural request.

### D2 — the research cache never hit on real runs *(fixed)*

- **Scenario:** any real research run followed by an identical repeat.
- **Observed:** the repeat searched (1 call), fetched (4 calls) and re-planned (1 model call);
  `cacheHit` was never true; the CAIE repeat cost a full 54.8 s instead of 0.054 s.
- **Layer:** research agent / service cache key (`lib/planner/research/agent.ts` vs
  `lib/planner/research/service.ts`).
- **Cause:** `runResearchAgent` stamped the candidate with `researchBriefDigest(brief)` while
  `researchScope` looked it up with `researchCacheKey({goal, subject, board, level, mode})`. Two
  different facts — "which brief was this computed against" versus "which question does this
  answer" — were being written into the same field. The deterministic suite never caught it because
  its fixtures build candidates by hand with the correct key; the seam between the two modules was
  untested.
- **Severity:** cost and latency on every repeated research request, plus a misleading `cacheHit: 0`
  in telemetry.

### F1 — comparison failure code mislabels an evidence limitation *(recorded, not fixed)*

When the model returns rows but none can be asserted, `comparisonFromExtraction` sets
`failureCode = "COMPARISON_MODEL_BAD_OUTPUT"`. In **three of the four live comparison attempts**
the extraction was schema-valid (`schemaPassed: true`), cited real official Cambridge sources, and
left every unit `UNCLEAR` with an accurate note explaining that the fetched pages did not enumerate
topics. The code says "the model misbehaved", which is false in exactly those attempts — and the
one attempt where it *was* true is indistinguishable from them in the stored record. Telemetry
`conflictCode` will carry that false claim into any future quality review.

**Not fixed, deliberately.** The user-visible copy is unaffected — `OverlapReview` renders the
generic `COMPARISON_UNAVAILABLE` copy plus the comparison's own `unresolved` notes, so the student
already reads the honest reason. Fixing it means extending or repurposing a closed vocabulary used
by the UI map, telemetry and two deterministic tests, during a phase whose stated purpose is
verification. **Recommendation for the final quality phase:** distinguish "nothing could be
asserted" from "the model's output was rejected" — either a new `COMPARISON_NOT_ASSERTED` code, or
reuse of `COMPARISON_UNAVAILABLE` for the asserted-zero case.

### F2 — the interpreter intermittently returns a rejected `clarification` shape *(recorded, not fixed)*

Three of roughly seventy-five live interpretation calls across the phase ended as a model-layer failure
instead of an interpretation. Two were confirmed `COPILOT_BAD_OUTPUT`, and in **both** the captured
failing path was the same: `clarification`, code `invalid_union` — a `clarification` object
matching neither branch of the union, whose branches are `z.strictObject`s. In both turns the model
had also produced the correct intent and the correct command, and the entire turn was discarded
over a field that carries no authority. The student is told to rephrase a message Sylf had
understood.

**Not fixed, deliberately, and this is the more important judgement in this report.** The phase
rule is that a fix follows a *reproduction*; the *payload* was never reproduced — six consecutive
attempts to reproduce it in the same context all succeeded — so any change would be speculative.
Knowing the path (`clarification`, `invalid_union`) is not enough to know which repair is right:
if the model omitted a required field on a `required: true` clarification, the obvious candidate
fix — tolerating unknown keys on the clarification branches — would not help at all, because a
missing required field is not an unknown key. What was done instead is to make the next occurrence
diagnosable: the harness records `contractIssues` (per-branch paths and codes) for every rejected
interpretation, so the next one names the field and the reason rather than the union.

**Recommendation for the final quality phase:** first reproduce with the new instrumentation, then
choose between (a) ignoring unknown keys on the clarification branches only — safe, because a
clarification carries no authority, unlike the command objects and the interpretation object
itself, whose `strictObject` shape is load-bearing — and (b) a single bounded repair pass, which
§57 already contemplates and which would consume the second of the two permitted model passes.

### Not defects, recorded as quality limits

- **NUST's own host serves non-browser clients unreliably.** `nust.edu.pk` → HTTP 403 on most
  paths tried; `connected.nust.edu.pk` → TLS legacy-renegotiation refusal; one official PDF on
  `nust.edu.pk` *did* download in the final run, and was correctly rejected as off-topic content.
  Upstream, not Sylf. See §4/§5.
- **Official-but-generic pages defeat a background-curriculum comparison.** See §9.

---

## 20. Fixes made

Both fixes are behaviour changes in existing modules; no new file, command, table or migration.

### Fix 1 — the research policy is checked against the intent as well as the commands

`lib/planner/copilot/run.ts`. An explicit `RESEARCH_REQUEST` / `COMPARISON_REQUEST` on a plan whose
stored `researchPolicy` is `OFF` is now refused as `RESEARCH_DISABLED`, with the promised message,
before anything else can claim the turn — including a clarification, because asking *which* exam
the student means would imply Sylf is about to look. The original command-level check remains
immediately below it, unchanged, as the security boundary: no proposal can search, fetch or call
the research model on an OFF plan, and none can turn the policy back on.

### Fix 2 — one definition of the research cache key

- `lib/planner/research/service.ts`: added `researchCacheKeyFor(brief)`, and `researchScope` now
  uses it instead of computing the key inline — so the module that stamps and the module that looks
  up cannot drift apart again.
- `lib/planner/research/agent.ts`: stamps `cacheKey: researchCacheKeyFor(input.brief)` instead of
  the brief digest, with a comment stating why the two are different facts.
- `lib/planner/research/service.ts`, `reusableCandidate`: a candidate with no units is not an
  answer and is not reused, so a failed lookup is retried rather than pinned (§15).

### Regression tests, each proven to fail without its fix

| Test | File | Without the fix |
|---|---|---|
| "answers a switched-off research request honestly even with no command to map" | `__tests__/planner/database-copilot.test.ts` | fails: `NOTHING_TO_DO` instead of `RESEARCH_DISABLED` |
| "is reusable for the same question about the same brief" | `__tests__/planner/research-agent.test.ts` | fails: stamped key ≠ lookup key |
| "is not reused when the lookup answered nothing, so a retry really retries" | `__tests__/planner/research-agent.test.ts` | fails: an empty candidate was reusable |

Both were confirmed by temporarily reverting each fix and re-running: `1 failed | 14 passed` for the
Copilot test, `2 failed | 15 passed` for the research-agent tests, then green again after restore.

### Live re-verification after the fixes

- Scenario D: `RESEARCH_DISABLED`, zero Serper requests, zero fetches, zero research-model calls.
- Cache: repeat of a successful research run at **0 search / 0 fetch / 0 model**, 54 ms, identical
  candidate; repeat of a failed run correctly retries.
- The full live suite then ran **8/8 green** on the fixed tree.

### One instrumentation change worth keeping

The live suite now records, for any rejected interpretation, the contract issue paths and codes
(`contractIssues`) — enough to name the failing field without reproducing the model's words. This
is what makes F2 fixable next time rather than speculative now.

---

## 21. Migration timestamp inspection

**Inspected:** `prisma/migrations/20260927090000_planner_user_released_disposition`.

**Situation.** The local project date is 2026-09-26; the migration's timestamp is 2026-09-27 09:00,
roughly twelve hours in the future. It is the *only* pending migration and it is **not applied to
the hosted development database**:

```
57 migrations found in prisma/migrations
Following migration have not yet been applied:
20260927090000_planner_user_released_disposition
```

**Is it a real ordering problem?** No. `prisma migrate deploy` orders by directory name, and this
name sorts after every other migration (`20260926030000_subject_archived_at` is the previous one),
so it applies last in any environment regardless of the wall-clock date. There is precedent in this
repository for planner migrations whose timestamp does not match their creation time in either
direction — `20260924010000_planner_foundation` was created at 16:29 on its own date, while
`20260926010000_planner_preference_friction` was created at 22:28 the previous evening.

**The one genuine hazard, stated plainly.** A future-dated name leaves a window: if another
migration is generated with a timestamp between the last applied migration and this one (for
example `20260926140000_...`) *before* this one is applied anywhere, then a fresh environment would
order the new migration first while an environment that already has `20260927090000` applied would
order it second — divergent histories from identical commits. The window closes the moment this
migration is applied to every environment.

**Safest resolution, as required by §25:** the migration has not been applied to any persistent
environment, so it is still safe to rename to a non-future timestamp (e.g. `20260926210000`, its
actual creation time) if that is preferred — but it is **not** necessary, and it must not be renamed
casually once applied. **This phase modified nothing**: no rename, no edit, no `migrate deploy`.

**Operational note for the reviewer.** Because the migration is unapplied, the `USER_RELEASED`
disposition and the extended ownership guard are not yet in place on the development database, so
`releaseGeneratedItem` cannot succeed there until `prisma migrate deploy` runs. This is a
deployment-sequencing fact, not a code defect: the migration is installed and exercised by the
disposable harness in every run, and it is the only schema change Phase 4 made.

---

## 22. Mixed-confirmation-boundary error note

Recorded as §26 asks — inspected, not redesigned, no new error vocabulary added. Both cases below
were refused (correctly, and with the brief provably unchanged); the question is only whether the
copy tells the student what to do.

The copy, verbatim:

> *"That is several separate changes at once. Send them one at a time — for example the hours
> first, then the topics — and I will make each one exactly as you mean it."*
> — closed code `TOO_MANY_COMMANDS`

**Case 1 — an explicitly mixed request.** *"Set my weekly hours to 8 and research the syllabus."*
The model proposed `SET_WEEKLY_HOURS` + `REQUEST_SCOPE_RESEARCH`; the turn was refused as
`TOO_MANY_COMMANDS`. **Assessment: the instruction is accurate** — "send them one at a time" is
exactly right — but both worked examples are brief edits ("the hours first, then the topics"), so
they do not illustrate the capability case the student actually hit.

**Case 2 — a natural single request that happens to need two steps.** *"Compare this with my
A-Level background."* on a plan with no background curriculum recorded. Two live observations, and
they are worth separating:

- In one run the model proposed `SET_BACKGROUND_CURRICULUM` + `REQUEST_CURRICULUM_COMPARISON`, and
  the turn was refused as `TOO_MANY_COMMANDS`. **Assessment: confusing.** The student asked for one
  thing; the code says "too many commands"; the copy says "several separate changes at once" and
  offers two examples that have nothing to do with comparing a curriculum.
- In another run the same message failed earlier (`COPILOT_BAD_OUTPUT` on the `clarification`
  shape, §19 F2) and the student got *"I could not read that request."* instead.

Either way the student is left without the useful answer — *"record your A-Level background first,
then I can compare"* — which is the underlying truth of Case 2. (In the same run, with the
background already recorded, the identical message routed cleanly to the comparison, so Case 2 is
about the missing prerequisite, not about the comparison itself.)

**Verdict:** in Case 1 the instruction is correct and actionable; in Case 2 the instruction is
correct but unhelpful, because the real answer is that a prerequisite is missing. Neither blocks
anything. Both are recorded as a **final-quality polish item**: the copy could name the capability
case ("…and a request Sylf has to look something up for") and, for Case 2, say what is missing
rather than counting commands. No error code or message was changed in this phase, per §26.

---

## 23. Regression results

All results are from the fixed tree, after the two fixes and the new tests.

| Check | Result |
|---|---|
| `npx tsc --noEmit` | **clean, 0 errors** |
| `npx prisma validate` | **valid** |
| `node scripts/test-planner-postgres.mjs` | **78 files passed, 6 skipped — 1 024 tests passed, 15 skipped** |
| `npx vitest run` (full repository) | **189 files passed, 18 skipped — 2 147 tests passed, 180 skipped, exit 0** |
| `npm run audit:secrets` | clean — no credential patterns in tracked files |
| `npm run audit:models` | 0 active retired-model references; active registry is the DeepSeek one |
| `npm run mobile:build` | passed |
| `npm run mobile:verify` | PASSED — zero server-only symbols or secrets in the mobile bundle |
| `npm run build` | compiled successfully (18.5 s) |
| Live suite (opt-in) | **8/8 passed** in 267 239 ms |

Notes on the deltas: the Planner suite is +3 tests over Phase 4's 1 021 (the three new regression
tests) and +1 skipped file (the live suite, which skips unless `PLANNER_LIVE_RESEARCH_SMOKE=true`,
so ordinary runs never spend provider quota). The full-repository run is +2 passing tests (the two
new deterministic research-agent tests) and +9 skipped (the live suite's 8 plus the new
database-Copilot test, which needs the disposable database). No existing test was modified to
accommodate a fix, and no test was weakened.

`prisma migrate status` was run read-only against the hosted development database to answer §25; no
migration was applied and no hosted data was written by this phase.

### Files changed in this phase

**New**

- `__tests__/planner/live-research-smoke.test.ts` — the live verification suite (opt-in).

**Modified**

- `lib/planner/copilot/run.ts` — intent-level research-policy check (Fix 1).
- `lib/planner/research/service.ts` — `researchCacheKeyFor`, no-answer guard in `reusableCandidate`
  (Fix 2).
- `lib/planner/research/agent.ts` — stamp the question key (Fix 2).
- `__tests__/planner/research-agent.test.ts` — two cache regression tests.
- `__tests__/planner/database-copilot.test.ts` — one policy regression test.

**Report**

- [AI_PLANNER_EXPERIENCE_PHASE_4_1_LIVE_VERIFICATION_REPORT.md](AI_PLANNER_EXPERIENCE_PHASE_4_1_LIVE_VERIFICATION_REPORT.md) (this file).

No migration was created, no historical migration was modified, and no Planner bound, limit,
schema, closed vocabulary or UI surface was changed.

---

## 24. Remaining pre-public items

1. **Real browser QA — still outstanding.** No browser tooling is available in this environment, so
   the desktop/mobile flows and the dark / light / custom-accent appearances remain unverified in a
   real browser. jsdom is not browser QA and is not claimed as such. This phase added no browser
   coverage; the live suite runs in Node against a disposable database and is not a substitute.
2. **`prisma migrate deploy` on the development environment** — required before
   `releaseGeneratedItem` can succeed there (§21).
3. **Public enablement decision** — still deferred, untouched by this phase.
4. **Search credentials are present and verified working** — the Phase 2.1/Phase 4 carry-forward
   item "real Brave/Serper-backed research smoke" is now **closed** by this phase. There is no
   live-research item left on the pre-public list.
5. **Release re-offer UX** — still deferred from Phase 4 (§38 "acceptable" wording); the durable
   record it needs exists, the surface does not.

---

## 25. Readiness for the final integration / quality phase

**Ready, with two named items to carry in.**

The verification gap that Phase 4 left open is closed: a real Copilot research request reached
Serper, Serper returned real URLs, every canonical source URL came from the search/fetch pipeline,
DeepSeek invented no provenance, NUST and CAIE authority classification worked on real results,
secondary and institutional material stayed below official material, the fictional exam produced
no fabricated authority or scope, `researchPolicy = OFF` made zero external calls with a real key
configured, the comparison stayed separate from preparedness, an institutional-only comparison
could not earn `OK`, the cache eliminated external calls on a repeat, and no Planner research path
called Gemini. Two real defects were found and fixed with regression tests that fail without them,
and the whole suite is green.

Carry into the final phase: **F2** (reproduce the rejected `clarification` shape with the new
instrumentation, then pick the narrow fix) and **F1** (stop calling an evidence limitation a model
failure in the comparison's closed code), plus the two quality limits in §5 and §9 and the polish
item in §22.

Nothing in this phase began the final integration/quality phase, public enablement, the release
re-offer UX, a broad Planner redesign, or a full browser-QA programme.

---

## Appendix — explicit answers

**Did a real Copilot research request reach Serper?**
Yes. Across seven live process runs, a real Copilot interpretation produced a `RESEARCH_REQUEST` or
`COMPARISON_REQUEST` every time, the proposal was confirmed, the capability was routed, and the
production provider issued real searches — 1–2 per run.

**Did Serper return real URLs?**
Yes — 7–8 per query in every run (12–16 in total on a comparison). Real, resolvable hosts:
`nust.edu.pk` and subdomains, `cambridgeinternational.org`, and for the fictional exam a spread of
exam-portal aggregators, a coaching site, and — in another run — genuine university pages.

**Did all canonical source URLs originate from the search/fetch pipeline?**
Yes. In every scenario of every live run, `provenanceOrphans` was empty: every source URL in every
candidate and in the comparison was present in the union of provider-returned URLs and
fetcher-reached URLs.

**Did DeepSeek invent any canonical provenance URL?**
No. Model output did contain URLs (the extraction prompt shows each excerpt's real URL), and not one
was outside the admissible set. Structurally it could not have landed anyway: neither extraction
schema has a URL field, and server-issued source ids are the only citations accepted.

**Did NUST authority classification work on real results?**
Yes. `nust.edu.pk` and its subdomains were classified `OFFICIAL`, they held the top ranks, and a
preparation site named after the university remained `SECONDARY`.

**Did CAIE authority classification work on real results?**
Yes. With board `CAIE` recorded, `cambridgeinternational.org` was `OFFICIAL` and three real
Cambridge specification PDFs became `OFFICIAL_PDF`, all three recomputed identically offline.

**Did secondary/institutional material remain below official material?**
Yes. Official hosts ranked first everywhere; genuine university hosts earned `INSTITUTIONAL` and
never more; prep sites, YouTube, Facebook, Reddit and Scribd stayed `SECONDARY` and never entered
provenance.

**Did the fictional exam produce fabricated authority or scope?**
No. Zero official sources, zero candidate units, `UNAVAILABLE`/`RESEARCH_WEAK`, and a summary that
says it could not read a usable scope. No model-memory substitution occurred.

**Did researchPolicy OFF make zero external research calls?**
Yes, verified with a real Serper key configured: zero Serper requests, zero fetches, zero
research-model calls — one interpretation call only.

**Did curriculum comparison remain separate from preparedness?**
Yes. All six target units came back `UNCLEAR`; the brief's `preparedness` array was unchanged and no
overlap correction was written. Overlap never became preparedness.

**Could INSTITUTIONAL-only evidence earn comparison OK?**
No. `OK` requires an asserted unit citing a source for which `sourceTypeIsOfficial` is true;
institutional-only evidence is `WEAK` and carries the caveat sentence. Asserted by the live
comparison and by the suite.

**Did an OFFICIAL-backed asserted unit earn OK where appropriate?**
Yes — in the research path, where it was achievable: the CAIE run's candidate earned `OK`/
confidence `HIGH` on the strength of three official Cambridge specification PDFs (7 units in the
final run, 8 in another). The live *comparison* could
not assert any unit at all, so no comparison `OK` was observable; the rule was checked directly
against the run's own rows instead (no unit with `LIKELY_COVERED_BY_CURRICULUM` lacking an official
citation).

**Did the cache eliminate external calls on repeat?**
Yes, after Fix 2: repeat of a successful research run = 0 search, 0 fetch, 0 model calls, 54 ms,
identical candidate. Before the fix it made a full second run every time.

**Did Planner research call Gemini?**
No — verified two ways. Statically: no Planner module imports or calls Gemini (`LLMFactory.getAdapter`
returns a `DeepSeekAdapter` for the `"deepseek"` provider with no fallback branch, and the only
mention of Gemini anywhere in `lib/planner/` is a comment recording its removal from research).
Empirically: every HTTP request in every live run went to `google.serper.dev`, to
`api.deepseek.com`, or to a target site being fetched — nothing was ever sent to a Google model
endpoint, and the workload classifier attributed every model call to interpret, phrase, plan,
extract or compare.

**How many Serper queries did each operation use?**
Copilot turns: 0. Research: 1 (the bound is 2). Comparison: 1, or 2 when the first query lacked
authority. The cached repeat: 0.

**How many DeepSeek calls did each operation use?**
Ordinary Copilot turn: 1. Research/comparison routing turn: 1. Research: 2 (plan, then extract —
the extract runs only once pages are readable). Comparison: 2 (plan + compare). Cached repeat: 0. An
`EXPLAIN` turn adds a wording pass, giving 2; a `RELEASE` confirmation runs no model at all (both
from the deterministic suites, not measured live).

**Were the configured bounds respected?**
Yes, and none was raised. ≤5 Copilot commands per message, ≤2 Copilot model passes, ≤2 research
queries, ≤8 results per query, ≤4 fetched sources, ≤2 research model passes, ≤8 sources and ≤200
nodes per candidate, ≤4 sources per node, comparison ≤2 queries / ≤4 fetches / 1 model pass /
30 000 input characters. Observed maxima: 2 queries (comparison, within its own bound of 2), 8
results per query, ≤4 kept sources with 8–11 HTTP fetch attempts in total once redirect hops are
counted individually, 2 model passes.

**Did any real source expose a parsing/extraction weakness?**
Not in the fetcher — HTML and PDF both extracted correctly, redirects were followed, and upstream
403/TLS conditions mapped to honest closed codes. One weakness was exposed one layer up: on a forced
comparison retry the model produced `ComparisonExtraction` output the schema rejected, which was
reported rather than retried into a guess.

**Did any smoke reveal a product bug?**
Yes, two: D1 (a switched-off research request answered as "nothing to do") and D2 (the research cache
never hit). Both fixed, with regression tests proven to fail without their fix.

**Were any production code changes required?**
Three files: `lib/planner/copilot/run.ts`, `lib/planner/research/agent.ts`,
`lib/planner/research/service.ts`. No migration, no schema, no bound, no new command, no UI change.
Two further findings (F1, F2) were deliberately left unfixed rather than changed without a
reproduction.

**Is the USER_RELEASED migration timestamp safe as-is?**
Yes, safe to leave. It sorts after every other migration so it always applies last, and precedent in
this repository shows planner migration timestamps routinely differ from their creation time. It is
**unapplied** on the hosted development database, so it could still be renamed without harm if
desired — but nothing was changed, and the only real hazard is the divergence window if a new
migration is generated with a timestamp between the last applied migration and this one before this
one is deployed.

**Is Phase 4 now fully verification-closed?**
Yes. The live-research gap that Phase 4 named as its one open item is closed: the real production
path was exercised end to end with real credentials across five scenarios and seven process runs,
inspected at the source level, and both defects it revealed are fixed and covered. Two further
findings (F1, F2) are recorded with evidence and a recommendation rather than fixed without a
reproduction — that is a deliberate limit of this phase, not an open gap in it. Phase 4's contract claims that this phase
could test — authority classification, provenance closure, policy absoluteness, honest degradation,
comparison/preparedness separation, cache behaviour, no-Gemini — all held live.

**Is the final integration/quality phase safe to begin?**
Yes. The tree is green on types, Prisma, the Planner suite, the full repository suite, the audits,
the mobile build and the web build, and the live suite passes 8/8. The phase should start from this
tree with F1, F2, the §5/§9 quality limits and the §22 polish item on its list; none of them
invalidates the Phase 0–4 architecture, and none of them is a blocker for beginning.
