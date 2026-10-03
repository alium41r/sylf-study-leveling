# SYLF PLANNER EXPERIENCE — UX PHASE 2.1 REPORT
## DEEPSEEK RESEARCH AGENT + EXTERNAL SEARCH PROVIDER + SOURCE QUALITY CLOSURE

**Scope:** replace Planner research's dependence on Gemini Google Search grounding with a bounded DeepSeek research agent, a real external search provider, and an SSRF-safe source fetcher; make source classification entity-aware; keep Phase 2's candidate → review → confirmation → Plan Brief authority model intact.

**Not in this phase, and not started:** curriculum comparison, overlap mapping, the preparedness matrix, Planner Copilot, conversational Planner actions, editing-relaxation rollout, public Planner redesign, any change to Classic Planner or to the coexistence navigation.

**Method:** every claim was read from the repository or measured by running it. Sizes, counts and timings are actual outputs. Where the outcome differs from the brief, §29 says so.

---

## 1. Repository and provider audit

Run **before** choosing anything (§3):

| Question | Finding |
| --- | --- |
| Existing search APIs / web-search clients? | **None.** A repository-wide search for Brave, Serper, Tavily, Bing, DuckDuckGo, Google Custom Search and `searchapi` found no search provider of any kind. |
| Existing safe fetcher / SSRF protection? | **None** for outbound research. `lib/upload-security.ts` covers inbound uploads; `lib/supabase-storage.ts` covers storage. Neither fetches an arbitrary public URL. |
| Env conventions? | Centralised in `lib/ai/config.ts` (`process.env` read once, per feature), server-side only. |
| Provider abstractions? | `lib/ai/providers/{factory,deepseek,gemini,groq}.ts` with `LLMFactory.getAdapter(provider, model)`; `DEEPSEEK_MODELS` is the sole active model registry. |
| Where did Gemini grounding live? | `lib/planner/research/provider.ts` (`groundedResearch`) and `executeGoogleSearch` in `lib/ai/chat-tool-executor.ts`. |

## 2. The previous Gemini-grounded architecture

Phase 2's provider called Gemini (`GEMINI_MODELS.research`) with `tools: [{ googleSearch: {} }]` and read source URLs from `groundingMetadata.groundingChunks[].web.uri`. It was honest — URLs came from provider metadata, never from prose — but it made routine Planner research depend on paid Gemini grounding, and it could not read a page: only the model's synthesis of search results.

## 3. Chosen search provider

**Brave Search API**, with **Serper** supported behind the same interface (`SEARCH_PROVIDER=brave|serper`; Brave preferred when both keys exist). Both: return real result URLs with titles and snippets, are documented for server-side use, need no AI layer, and handle official PDFs well.

**Rejected:** Tavily (adds an AI synthesis layer we do not need and would have to trust), Bing Web Search (retired for new customers), Google Custom Search JSON API (needs a CSE id, 10 results per query, tighter daily cap, more configuration for less coverage).

## 4. Pricing and quota rationale

Not discoverable from this environment — no provider documentation is cached locally and I did not fetch it, so I am not going to assert a price. What can be said from the code: **the architecture bounds cost structurally rather than relying on a plan tier.** One research run makes at most 2 search calls (8 results each), fetches at most 4 pages, and makes exactly 2 DeepSeek calls, with a cache hit costing nothing at all. The metrics to revisit pricing are recorded (§19). Confirming the current free-tier limits is a deployment decision and is listed as an open item in §30.

## 5. The new research architecture

```
USER: "Find syllabus"
→ DeepSeek plans 1–2 queries           (no URL, no browsing)
→ external search provider returns real URLs + titles + snippets
→ server normalises, classifies and ranks them
→ safe fetcher retrieves the top few
→ bounded excerpts go to DeepSeek
→ DeepSeek returns a strict hierarchy citing sourceIds only
→ server validates, builds the candidate, decides the status
→ USER REVIEWS AND CONFIRMS
→ Plan Brief → existing adapter → existing Planner Modes engine
```

Files: `lib/planner/research/{contracts,agent,deepseek,authority,sources,service,import-scope}.ts` and `lib/planner/research/search/{contracts,provider,fetch}.ts`.

## 6. DeepSeek query planning

`deepseek.ts` implements `ResearchModel` with two calls through `LLMFactory.getAdapter("deepseek", DEEPSEEK_MODELS.planner)` — **the model comes from the central registry; no literal exists in the module**.

The plan prompt receives the target identity (goal, subject, board, level, country), the **verified authority hosts** it may use as `site:` filters, and the units the student already removed. It is told plainly that it does not search the web and must not pretend to, and that it must not include a URL anywhere in its answer. The output is validated by `ResearchQueryPlanSchema` (1–2 queries, each with a closed purpose, max 300 characters). A plan outside the contract is refused rather than repaired — a test drives a 1-character query in and asserts **no search call is made**.

## 7. SearchProvider contract

`SearchProvider.search({ query, limit, signal }) → SearchResult[]`, where each result is `{ url, title, snippet, rank, provider }`. Requirements, all implemented and tested: absolute http(s) URLs only; malformed, relative, `javascript:`, `ftp:`, empty and credential-bearing URLs dropped and **never repaired**; credentials stripped rather than carried; `www.`, fragments and trailing slashes canonicalised so one document cannot appear as two sources; duplicates collapsed; results capped at the contract bound even when a provider returns forty; the contract's timeout honoured; cancellation honoured; and typed failures — `SEARCH_UNAUTHORIZED`, `SEARCH_RATE_LIMITED`, `SEARCH_UNAVAILABLE`, `SEARCH_BAD_RESPONSE`, `SEARCH_ZERO_RESULTS` — with no raw provider payload ever reaching a caller.

`selectSearchProvider()` returns **`null`** when no key is configured. That is deliberately not an error: "no search is configured" must never be confused with "search ran and found nothing". It also ignores `NEXT_PUBLIC_*` keys entirely, because a key that reaches the browser is a leaked key.

## 8. SafeSourceFetcher

`fetchSource(url)` is a squat, not a door. In order: http/https only; URLs carrying credentials refused; `localhost`, `*.localhost`, `*.local`, `*.internal`, `*.home.arpa` and bare hostnames refused before any lookup; DNS resolved and **every** returned address checked against 127/8, 10/8, 172.16/12, 192.168/16, 169.254/16 (including `169.254.169.254`), 100.64/10, 0/8, 192.0.0/24, 198.18/15, 224/4, 240/4, `::1`, `fc00::/7`, `fe80::/10`, multicast, **and the IPv4-mapped spelling `::ffff:127.0.0.1`**; redirects followed manually with a cap of 3 and **every destination re-vetted through the same gate**; the body streamed with a 3 MB ceiling that aborts the read the moment it is exceeded; a MIME allowlist (`text/html`, `text/plain`, `application/xhtml+xml`, `application/pdf`) so no arbitrary binary is downloaded; PDFs routed through Phase 2's extractor; HTML stripped of script/style/nav/header/footer while headings become `#` lines and list items `-` lines, because the syllabus outline lives in exactly that structure; truncation flagged `partial` rather than silent.

**Documented limitation:** DNS rebinding is not fully closed. `assertRoutable` validates the addresses DNS returns *us*, then the request connects by hostname, so a resolver answering differently on a second lookup could in principle redirect the connection. Closing it means pinning the connection to the validated address with a custom undici agent — out of scope here — and the code comment states this rather than implying the check is airtight.

## 9. Source classification changes

Phase 2's rule — `.edu` / `.ac.*` / `.gov.*` ⇒ OFFICIAL — is **gone**. `classifySource` now asks who publishes the document:

| Verdict | Requires |
| --- | --- |
| `OFFICIAL_PDF` | a host verified as the authority for *this* target, and a document-looking path (`.pdf`, `/pdf/`) |
| `OFFICIAL` | a host verified as the authority for *this* target |
| `INSTITUTIONAL` | a credible academic or government host that is **not** that authority |
| `SECONDARY` | everything else, including unknown hosts and anything that merely reads as plausible |
| `USER_UPLOAD` | a file the student supplied |

The path, the title and the prose are never consulted for authority — only the host, and only against a verified list. `sourceTypeIsOfficial` is true solely for `OFFICIAL`/`OFFICIAL_PDF`, so an institutional-only run yields `WEAK` **by construction**, not by a special case.

## 10. Authority registry

`lib/planner/research/authority.ts` answers "which hostnames are verified primary authorities for this target?" from three sources: the repo's own `EXAM_BOARDS`/`ACADEMIC_LEVELS` registry (names the UI already shows), an explicit commented board→hosts table, and a general university-authority model. **Uncertainty downgrades**: an unknown board yields no hosts, an unrecognised institution yields no hosts, and an empty host is never an authority.

A factual correction from Phase 2's own review is applied: `bisep.edu.pk` is BISE **Peshawar**, so BISE Lahore is `biselahore.com` and BISE Karachi is `biek.edu.pk`.

## 11. NUST and university handling

The model is `identity → owned domains → authority`, not string matching on a goal. `inferInstitution` requires the authority's own name as a **whole word**, so "NUSTian Academy prep" is not NUST; and — the part that matters — a name match grants nothing until one of that authority's own hosts is involved, because authority comes from the host list. NUST is one entry (`nust.edu.pk`) in a table that already carries FAST, GIKI, LUMS, UET, NED, AKU, Punjab and QAU, so the next university is a data row, not a code change.

## 12. DeepSeek structured extraction

The extraction prompt receives the bounded excerpts labelled with **server-assigned `sourceId`s** and is instructed that it may cite only those ids, must never output a URL or a domain, must build SECTION → CHAPTER → TOPIC by index, must use the document's own wording, must **not judge the student** (no preparedness, confidence, priority, mastery or difficulty), must report disagreement in `conflicts` rather than choosing a side, and must list what it could not establish in `unresolved`.

`ResearchExtractionSchema` is a strict object with no URL field, and the server validates it further: `parentIndex` must be in range and point backwards, and every cited `sourceId` must be one the server actually issued — an unknown citation is **dropped and counted**, and surfaced to the student as "some citations did not match the pages I read". Malformed output throws `RESEARCH_MODEL_BAD_OUTPUT` rather than being repaired.

## 13. Provenance integrity

A canonical source URL can be born in exactly two places: a search provider's response, or the `finalUrl` the fetcher reached after validating every redirect. The model's output schema has no URL field, so this is structural rather than enforced by review — and a test feeds a completion containing `https://evil.example/fake-syllabus.pdf` in three different fields and asserts **no `ResearchSource` carries it**, with the only provenance being the real search result.

## 14. Agent bounds

| Bound | Value | Enforced by |
| --- | --- | --- |
| Search queries per run | 2 | `plan.queries.slice(0, maxSearchQueries)`, plus the schema |
| Results per query | 8 | the provider adapter, plus the schema |
| Sources fetched | 4 | `ranked.slice(0, maxFetchedSources)` — after ranking, never all results |
| Model passes | 2 | one `planQueries`, one `extract`; no third |
| Tool rounds | 3 | structurally: there is no loop to iterate |
| Query length | 300 | the query-plan schema |
| Excerpt per source / total | 12,000 / 36,000 chars | slicing before the model call |
| Search / fetch / model timeouts | 12s / 12s / 45s | `AbortSignal.timeout` + the caller's signal |

Nothing here is advisory, and the tests drive a hostile model into each ceiling: five queries, fifty results, twenty fetchable pages, a malformed plan. There is no recursion to loop — the pipeline is two passes and a bounded fan-out.

## 15. Caching

Phase 2's caching is preserved: reuse requires the same normalised question (`cacheKey`) **and** the same material brief digest, so an edited goal cannot have the old answer applied. A cache hit costs nothing at all — no search call, no fetch, no model call — and the metrics report zeros for all three, which the tests assert. Displayed candidates always carry their own `retrievedAt`.

## 16. "Use only what I give you"

Unchanged and re-verified: `researchPolicy = OFF` refuses before any provider call, and now also before any DeepSeek call and any fetch. The agent's first act is the disabled check, so no search key is touched. A test asserts `deepseekModel` is never reached when the policy is off; another asserts no model call happens when no search provider is configured at all. Paste, upload and manual entry keep working, and generation is unaffected.

## 17. Gemini web-research decision

**Option A: removed from Planner research entirely.** `lib/planner/research/provider.ts` and its test are deleted.

The first draft of the service comment claimed Gemini was "retained only as an explicitly configured fallback, off unless `PLANNER_RESEARCH_FALLBACK=gemini`" — **that switch did not exist**, and a comment describing a mechanism that isn't there is worse than no comment. Given the choice between building the switch and removing the claim, the brief's own reasoning decides it: a fallback that runs when search is unconfigured would spend Gemini quota silently, which is what this migration exists to stop. So the module went, and the comment now states what is true.

`executeGoogleSearch` in `lib/ai/chat-tool-executor.ts` is untouched — it serves chat and the syllabus compiler, which are different features, and Phase 2's own guard still treats its placeholder snippet as "no research".

## 18. Gemini vision decision

**Unchanged.** Image and scanned-PDF extraction still goes through `GEMINI_MODELS.vision` in `lib/planner/import/vision.ts`. It is optional (only an uploaded image or a PDF with no text layer reaches it), failure-safe (missing credentials return `VISION_UNAVAILABLE` rather than a fabricated list), and rewriting it was explicitly out of scope. `DEEPSEEK_MODELS.vision` exists (`deepseek-v4-flash-vision-exp`), and moving to it is a candidate for a later patch — noted, not done.

## 19. Telemetry and cost accounting

New bounded fields in the existing closed vocabulary: `researchBackend` (`DEEPSEEK_SEARCH`), `searchProvider` (`brave`/`serper`/`none`), `researchStatus` (`OK`/`WEAK`/`UNAVAILABLE`), `searchQueries`, `searchResults`, `sourcesFetched`, `fetchBytesBucket` (`NONE`/`UNDER_64K`/`UNDER_512K`/`UNDER_2M`/`OVER_2M`), `deepseekCalls`, `researchPasses`, `researchLatencyMs`, `institutionalSourceCount`. Each is validated against an allowlist before it is logged.

Cost is measured in the three separate currencies the brief asks for — **search** (calls, results), **fetch** (sources, bytes) and **model** (calls, passes, tokens) — and fetched bytes are bucketed rather than exact, because an exact byte count of a page is a weak fingerprint of which page it was while "cheap or expensive" is the question accounting actually needs.

There is no query text, URL, title, snippet, page text, prompt or topic name in the vocabulary at all — none of those has a representation to leak.

## 20. SSRF and security review

`__tests__/planner/source-fetch-security.test.ts` — **51 tests, all passing**: 25 blocked address forms (every range the brief names, plus the IPv4-mapped bypass) and 6 public addresses that must stay allowed; the hostname gate; and nine hostile URLs — `file:`, `javascript:`, `data:`, `ftp:`, unparseable, credential-bearing, `localhost`, a bare internal name, a private address — each refused with the right code and **no network call made** (`expect(fetchSpy).not.toHaveBeenCalled()`).

Fail-closed throughout: an unknown host is SECONARY, an unknown board grants no authority, an unfetchable source is skipped rather than fatal, and a failed search never becomes a model-memory answer.

## 21. Live smoke results

**Not run — and the reason is now verified rather than assumed.** Checked directly:

| Credential | Where | State |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | `.env` | **present** |
| `BRAVE_SEARCH_API_KEY` | `.env`, `.env.local`, process env | **absent** |
| `SERPER_API_KEY` | `.env`, `.env.local`, process env | **absent** |

§34's precondition is "*`DEEPSEEK_API_KEY` **and** search credentials*". The search half is missing, so the smoke cannot run: with no key, `selectSearchProvider()` returns `null` and a `Find syllabus` press correctly reports "Search is not configured" with no search, fetch or model call — which the agent tests assert. Adding either key is a one-line environment change and the smoke becomes runnable immediately.

The brief's own rule is not to loosen source rules to manufacture a pass, so nothing was relaxed. What stands in for it: the pipeline is covered end-to-end with injected search, model and fetcher, including the four scenarios' *properties* (below). Running the four live scenarios remains the outstanding verification item, and it is blocking UX Phase 3 in §30.

## 22. NUST result

Deterministic coverage, no hardcoded syllabus: a `NUST NET Engineering` brief with `nust.edu.pk` among the results classifies that host **OFFICIAL**, the candidate status is **OK**, the canonical source URL is exactly the search result's URL, and the hierarchy is built from the extraction. `mit.edu` in the same position is **INSTITUTIONAL** and the run is **WEAK** even when the model claims HIGH confidence — with an open question telling the student nothing official backed it. A prep site named like the university is **SECONDARY**.

## 23. CAIE result

`CAIE A-Level Mathematics` resolves `cambridgeinternational.org` and `cie.org.uk` as authorities from the registry; a board PDF classifies `OFFICIAL_PDF` and a board page `OFFICIAL`; ranking places `OFFICIAL_PDF` before `OFFICIAL` before `INSTITUTIONAL` before `USER_UPLOAD` before `SECONDARY`, so a preparation page cannot outrank the verified specification — asserted directly in the ranking tests.

## 24. Unknown-exam result

A fictional exam produces no invented website and no fabricated syllabus: with no results the run is `UNAVAILABLE` with `SEARCH_ZERO_RESULTS`; with pages that will not open, `FETCH_FAILED`; with pages that open but no usable structure, `RESEARCH_MODEL_BAD_OUTPUT`. Each carries different copy pointing at upload, paste or manual entry. The provider's `null` case adds `RESEARCH_UNAVAILABLE` ("Search is not configured…"), and in every one of these the candidate has no nodes and no sources.

## 25. Performance

| Measurement | Value |
| --- | --- |
| Candidate bytes, 200 nodes | **30,384 B** — inside the Phase 1 brief bound of 65,536 B |
| Ranking + dedupe, 8 sources (incl. classification) | **1.07 ms** |
| Search calls per run | 1–2 (max 2) |
| Fetch calls per run | 0–4 (max 4), only the highest-ranked |
| DeepSeek calls per run | exactly 2 (plan + extract) |
| Fetch bytes, worst case | 4 × 3 MB ceiling, bucketed in telemetry |
| Cache hit | 0 search, 0 fetch, 0 model calls |

No Plan Brief or session bound was raised: the only new ceilings are the fetch byte cap, page cap, excerpt limits and query bounds, each with a stated reason.

## 26. Tests, database and build

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | **0 errors** |
| Planner suite | **712 passed / 141 skipped** |
| Disposable PostgreSQL (serial) | **849 passed / 7 skipped** — migrations, RLS, and §43's confirmation regression |
| `npm run audit:secrets` | no credential patterns in tracked files |
| `npm run audit:models` | 0 active retired-model references |
| `npm run mobile:build` / `mobile:verify` | built; **verify PASSED** |
| `npm run build` | compiled |
| Full repository suite | **181 passed / 15 skipped files; 2,003 passed / 141 skipped tests, 0 failures** |

New suites in this phase: `search-provider.test.ts` (19), `source-fetch-security.test.ts` (51), `authority.test.ts` (13), `research-agent.test.ts` (15), `research-measurements.test.ts` (3), plus the Phase 2 suites updated for the new vocabulary (`research-sources`, `research-service`).

The planner total fell from 725 to 712 because the 13 tests covering the deleted Gemini provider went with it. Coverage of deleted code is not coverage, and reporting the lower number is the honest option.

The full repository suite is green: **181 passed / 15 skipped files, 2,003 passed / 141 skipped tests, 0 failures**.

## 27. Coexistence and import regressions

Unchanged and re-verified: Classic remains the default Planner surface, `Planner modes` opens the chooser, each mode opens its Quick Plan, `← Classic Planner` returns, no environment variable is involved, and no removed gate has returned (`classic-modes-coexistence`, `classic-coexistence` pass). Import is untouched — paste, PDF, image, upload validation and partial extraction all still pass, and imports report zero search, zero fetch and zero model cost, which is true.

## 28. Frontend QA status

**No browser QA was performed.** No browser tooling is available here, so there is no claim of manual inspection. Interaction is covered by component tests; the Quick Plan copy currently labels a source "Official" or "Secondary" from `sourceTypeLabel`, and the new `INSTITUTIONAL` verdict has a label ready ("Institutional") but **the copy around it has not been reworded** — §30 records that as a small, deliberate follow-up rather than pretending the UI already explains the new distinction.

## 29. Deviations

1. **Search providers: two, not one.** Brave is preferred, Serper supported, because the deciding factor is which key the deployment holds — not capability. `SEARCH_PROVIDER` selects explicitly; unknown values yield `null` rather than a guess.
2. **`INSTITUTIONAL` added to the source vocabulary**, which is a change to a Phase 2 contract. It is additive, and the alternative — forcing every credible-but-not-authoritative host into either "official" or "blog" — is the mislabelling this patch exists to fix.
3. **Three new research failure codes** (`SEARCH_ZERO_RESULTS`, `FETCH_FAILED`, `RESEARCH_MODEL_BAD_OUTPUT`) so three different situations keep three different next actions instead of collapsing into "something went wrong".
4. **`bypass`: DNS rebinding is documented as closed only for the obvious class** (§8).
5. **`deepseek.ts` uses `LLMFactory` + a `responseFormat: "json_object"` option passed through the adapter's options bag.** The adapter's option surface was not extended for this; it is passed as an option and ignored if unsupported, in which case the prompt's JSON-only instruction still holds and the parser still validates strictly.
6. **The unknown-exam and NUST/CAIE scenarios are covered deterministically, not live** (§21).
7. **Quick Plan copy for INSTITUTIONAL is not yet reworded** (§28).
8. **No `plannerResearch` quota**, deliberately — the measurements are in §25 and the recommendation is in §30.

## 30. Blockers before UX Phase 3

1. **Live smoke has not run** (§21) because no search-provider key exists in this environment; `DEEPSEEK_API_KEY` is present, so only `BRAVE_SEARCH_API_KEY` or `SERPER_API_KEY` is missing. This is the first thing to close. Everything about honesty is verified against injected providers; whether real searches return useful official sources for real exams is not.
2. **Search-provider pricing and free-tier limits are unverified** (§4) — a deployment decision, not a code one.
3. **The INSTITUTIONAL distinction is not yet explained in the UI copy** (§28) — the classifier is right and the label exists, but the student has not been told what it means.
4. **DNS rebinding hardening** (undici agent with a pinned lookup) if this ever faces adversarial input at scale.
5. **`plannerResearch` quota — recommendation: still not warranted.** One run is at most 2 search calls, 4 fetches and 2 model calls, is user-initiated, and caches to zero. That is closer to a single generation than to an agent. Revisit if measured retry rates rise, if research becomes automatic, or if a second generation-time research layer is added — the metrics to judge it are already recorded (§19).
6. **DeepSeek vision** remains unused (§18) — a candidate, not a blocker.

---

## Answers to the 20 explicit questions

1. **Does Planner web research still require Gemini?** No. Gemini grounding is removed from Planner research entirely; `provider.ts` and its test are deleted, and the migration is option A, not a dormant fallback.
2. **What performs the actual web search?** A documented external search API — Brave (preferred) or Serper — behind one `SearchProvider` interface, called only by the application.
3. **What role does DeepSeek play?** The research brain: it plans the queries from the target identity and reads the bounded page excerpts to produce a strict hierarchy. It never searches, never sees a URL it can cite, and never decides authority, readiness or anything about the student.
4. **Can DeepSeek invent a provenance URL?** No. Its extraction schema has no URL field, and canonical sources are built only from search results and validated fetch destinations. A test feeds an invented URL into three model fields and asserts it reaches no source.
5. **Can DeepSeek mark an arbitrary source official?** No. Classification is host-based against a verified authority list; the model's `extractionConfidence` never raises a status, and a HIGH-confidence extraction over an institutional-only source yields WEAK.
6. **Is `.edu`/`.ac`/`.gov` still automatically official?** No. Those hosts are `INSTITUTIONAL` unless the host is the verified authority for the target in hand.
7. **Can NUST-owned sources be identified as official?** Yes — via the general university-authority model (`nust.edu.pk` and subdomains), not a goal-string special case.
8. **Are unrelated academic domains prevented from becoming official?** Yes: `mit.edu`, `ox.ac.uk`, `gov.uk` and similar classify `INSTITUTIONAL`, and the research status drops to `WEAK` accordingly.
9. **How many search queries can one operation make?** Two.
10. **How many sources can it fetch?** Four, and only the highest-ranked — never the whole result list.
11. **How many DeepSeek passes can it use?** Two: plan, then extract.
12. **Can research loop indefinitely?** No. There is no loop: two passes and a bounded fan-out, with every ceiling enforced in code and driven into by tests.
13. **Does a failed search fall back to model memory?** No, and never. A failed search returns `SEARCH_ZERO_RESULTS` or `RESEARCH_UNAVAILABLE` with no nodes and no sources.
14. **Does `researchPolicy` OFF prevent ALL external research?** Yes — the disabled check is the agent's first act, so no search call, no fetch and no DeepSeek call happens. Tests assert the model is never reached.
15. **Does user confirmation remain mandatory?** Yes, unchanged: a candidate cannot generate (`BRIEF_NOT_READY`), and `confirmScope` remains the only path that may write the confirmed scope.
16. **Did import continue working?** Yes — paste, PDF, image, validation and partial extraction all pass, and imports report zero external cost.
17. **Did Classic/Modes coexistence remain unchanged?** Yes; the navigation and gating are untouched and their suites pass.
18. **Is Gemini still used for image extraction?** Yes — deliberately unchanged (`GEMINI_MODELS.vision`), optional, and failure-safe when credentials are absent.
19. **Is a dedicated `plannerResearch` quota warranted?** Not yet (§30.5): bounded, user-initiated, cacheable, two model calls per run. The metrics to change that judgement are already recorded.
20. **Is UX Phase 3 safe to begin?** Not quite. The architecture and its verification are in place, but the live smoke has not run and the INSTITUTIONAL copy is unwritten; both should close first.

---

## Stop gate

| Condition | State |
| --- | --- |
| Research no longer depends on Gemini grounding as its primary path | ✔ removed entirely |
| DeepSeek is the bounded research reasoning/extraction model | ✔ (2 passes, central registry) |
| A real external search provider supplies URLs | ✔ (Brave/Serper; live-verified pending §21) |
| Provenance URLs cannot originate from model prose | ✔ (structural + tested) |
| Source fetching is SSRF-safe and bounded | ✔ (51 security tests; rebinding limitation stated) |
| Official classification is entity-aware | ✔ |
| Generic academic/government domains are no longer automatically official | ✔ (demoted, with Phase 2's assertions updated to the new rule) |
| NUST/university authority handling is supported cleanly | ✔ (data-driven model, tested) |
| Phase 2 candidate/review/confirmation semantics intact | ✔ (disposable-PostgreSQL regression) |
| Import remains intact | ✔ |
| Live smoke run if credentials permit | ✖ **not run — search credentials absent, so permission was not granted** (§21) |
| Measurements, tests and report complete | ✔ measurements and tests; report complete |

**Stopped here.** UX Phase 3 has not begun: no curriculum comparison, overlap mapping, preparedness matrix, Copilot, natural-language actions, editing-relaxation rollout or public redesign. The live smoke remains outstanding and is the first item of §30.
