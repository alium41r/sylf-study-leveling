# Sylf AI Planner — UX Phase 3.1 Report
## Source-Status Semantics + Confirmed Provenance Closure

**Scope implemented:** exactly two Phase 3 issues — (1) an INSTITUTIONAL-only curriculum comparison could earn `OK`, and (2) confirmed target-scope provenance became unresolvable once the research candidate was cleared.
**Not implemented, deliberately:** Planner Copilot, chat, natural-language actions, generated-Quest release/deletion, post-confirmation Copilot edits, any navigation or Quick Plan redesign, any change to the search providers, the SSRF fetcher, the authority registry, the comparison states, the preparedness matrix, or draft-edit flexibility.

---

## 1. Repository reconciliation

- `npx tsc --noEmit` was **clean** before any edit, and remains clean after.
- Both defects were confirmed by reading the code, not by trusting the Phase 3 report:
  - the status rule was `official + institutional === 0 ? "WEAK" : "OK"` (`lib/planner/research/comparison.ts`), which counted an INSTITUTIONAL source as sufficient for `OK`;
  - `confirmScope` wrote `provenanceRefs: candidate.sources.map(s => s.sourceId)` and then set `scopeCandidate: null`, so the refs named records that existed nowhere afterwards.
- No migration was needed and none was created: both fixes live inside the bounded `PlanBriefV1`/intake JSON contract. `prisma/schema.prisma` was **not modified by this patch** and `npx prisma validate` passes; the planner tables it declares are the ones an earlier phase added.
- `lib/planner/` is untracked in this checkout, so every claim below cites a file and a test rather than a commit.

## 2. Issue 1 — the previous comparison-status rule

```ts
// before
const status = !ranked.length || !asserted
  ? "UNAVAILABLE"
  : official + institutional === 0 ? "WEAK" : "OK";
```

The *presence* of any source rated INSTITUTIONAL or better was enough to earn `OK`, and nothing tied the authority to the unit being asserted. Two consequences followed: a comparison built entirely from a university or ministry page reported itself as authoritative, and an official page that was read but cited by nothing still lifted the whole result.

## 3. The new rule

```ts
// after — lib/planner/research/comparison.ts
const officialIds = new Set(
  ranked.filter((source) => sourceTypeIsOfficial(source.sourceType)).map((s) => s.sourceId)
);
const assertedWithOfficial = units.some(
  (unit) => unit.overlap !== "UNCLEAR" && unit.sourceIds.some((id) => officialIds.has(id))
);
const status = !ranked.length || !asserted
  ? "UNAVAILABLE"
  : assertedWithOfficial ? "OK" : "WEAK";
```

- **`OK`** — something was read, at least one unit was asserted rather than left `UNCLEAR`, **and** at least one asserted unit cites an `OFFICIAL`/`OFFICIAL_PDF` source.
- **`WEAK`** — a usable comparison exists, but its support is only `INSTITUTIONAL`/`SECONDARY`, *or* official evidence was read without backing any asserted unit.
- **`UNAVAILABLE`** — nothing usable: no sources, or no asserted row at all.

Three properties are worth naming:

1. **Source semantics stay centralised.** The new code calls `sourceTypeIsOfficial(...)` — the single helper Phase 2.1 established — and never compares `sourceType === "OFFICIAL"` anywhere. No second definition of "official" exists.
2. **Model confidence is never consulted.** `comparisonConfidence` is not read by the server at all; the test that matters asserts `HIGH` confidence with institutional-only evidence still yields `WEAK`.
3. **Row-level evidence is untouched.** A row supported by an institutional page still says `LIKELY_COVERED_BY_CURRICULUM` / `PARTIAL_OVERLAP` / `LIKELY_NEW_TO_CURRICULUM` with its own citation. What changed is only the overall verdict, plus one sentence that says why (`COMPARISON_WEAK_CAVEAT`, defined beside `COMPARISON_DISCLAIMER`): "None of this could be checked against the examination authority's own material, so treat it as a starting point." An uncited assertion still becomes `UNCLEAR`, and an unknown source id is still dropped.

## 4. Tests proving Institutional cannot earn OK

`__tests__/planner/comparison-contract.test.ts`, describe block "only a verified authority earns OK" (9 tests):

| Case | Result |
| --- | --- |
| Asserted row citing `OFFICIAL_PDF` | `OK` |
| Asserted row citing `OFFICIAL` | `OK` |
| `INSTITUTIONAL` only | `WEAK`, and the row keeps its classification and its citation |
| `SECONDARY` only | `WEAK` |
| `INSTITUTIONAL` + `SECONDARY` | `WEAK` (two non-authoritative sources do not add up to one authority) |
| Model `comparisonConfidence: "HIGH"`, institutional only | `WEAK`, with the row's own confidence still `HIGH` |
| Official page read but no asserted unit cites it | `WEAK` (the §3 "insufficient evidence" case) |
| Uncited assertion | row `UNCLEAR`, overall `UNAVAILABLE` |
| Fixture classifications | asserted against the registry (`OFFICIAL_PDF` / `INSTITUTIONAL` / `SECONDARY`) — no source type was changed to make these pass |

## 5. Issue 2 — the previous dangling-provenance lifecycle

```
researchScope → candidate { nodes, sources }
confirmScope  → scope.provenanceRefs = candidate.sources.map(s => s.sourceId)   ← ids only
              → scopeCandidate = null                                          ← records gone
```

After confirmation, `provenanceRefs` named records that had been deleted with the candidate. The confirmed scope carried identifiers nothing could resolve, and every later reader would have had to re-research to explain where the scope came from — which is the opposite of provenance.

## 6. The durable representation

`PlanBriefV1.scope` gained one field, and the source contract gained one smaller schema:

```ts
// lib/planner/research/contracts.ts
export const ConfirmedScopeSourceSchema = z.strictObject({
  sourceId, url, title, publisherOrDomain, sourceType, retrievedAt, documentDate
});
```

```ts
// lib/planner/intake/brief.ts — inside scope
provenanceSources: z.array(ConfirmedScopeSourceSchema).max(BRIEF_LIMITS.provenanceRefs).default([]),
```

Two deliberate decisions:

- **A dedicated, smaller schema rather than the full `ResearchSource`.** The one field dropped is `nodeIds`, and the reason is measured: a research record carrying up to 200 node ids serialised to **2,387 bytes**, while the confirmed record serialises to **261 bytes** (asserted in `confirmed-provenance.test.ts`). Eight of the former would have approached 19 KB of pure redundancy, because the node→source mapping already lives on the nodes themselves (`ScopeNode.sourceIds`, ≤4 each, and kept by confirmation). `mappingConfidence` is dropped for the same reason.
- **No content.** Identity, address, title, publisher, type and reading date: schema-strict, so a record with a `text` field cannot parse. No HTML, page text, PDF body, snippet, prompt or model output can enter this field; the test asserts the serialised snapshot matches none of those words.

`.default([])` (not `.optional()`) is what makes old data parse *and* keeps the reader simple: the field is always an array. An old scope yields `[]`, which is the truth about that session.

## 7. `confirmScope` changes

`lib/planner/server/intake.ts`, in the branch that consumes a candidate:

```ts
const confirmed = confirmedScopeSources(candidate, nodes);
return {
  ...brief,
  scope: {
    source: candidate.origin === "RESEARCH" ? "RESEARCH_CONFIRMED" : "IMPORT_CONFIRMED",
    confirmedAt: new Date().toISOString(),
    provenanceRefs: confirmed.provenanceRefs,        // ← was: every candidate source id
    provenanceSources: confirmed.provenanceSources,  // ← new: the records those refs name
    nodes, removedLabels,
  },
  scopeCandidate: null,
  authority: claim("scope"),
};
```

Everything else about the action is unchanged and still asserted by the existing suites: `expectedVersion` is required, `actionKey` replay returns the prior state without applying twice, an id that is neither in the candidate nor in the student's own additions is refused (`UNKNOWN_SCOPE_NODE`), a duplicate addition is refused (`DUPLICATE_SCOPE_NODE`), renames and additions remain the student's wording, `removedLabels` still drops re-added units, the timestamp is still written, the candidate is still cleared, and no generation happens during a confirmation.

The manual branch (`confirmScope` with no candidate — scope the student typed) now writes **empty** provenance rather than leaving whatever was there: a typed scope has no source material, so an earlier confirmation's refs are not evidence for this one.

## 8. Referenced-source filtering

`confirmedScopeSources(candidate, keptNodes)` in `lib/planner/research/service.ts` is the single implementation of §8's rule. It keeps a source when either direction of the mapping points at a confirmed unit:

1. **A kept node cites it** (`node.sourceIds`) — how research records the mapping.
2. **It maps to a kept node** (`source.nodeIds ∩ kept node ids`) — how an import records it. Reading only one direction would lose an upload's provenance entirely, since import nodes carry no `sourceIds`.

Then: dedupe, preserve candidate order (so the same candidate always produces the same snapshot), and bound to the existing source ceiling (`CONFIRMED_SOURCE_LIMIT` = `RESEARCH_LIMITS.sources` = 8, the same number `provenanceRefs` already allowed). An id a node cites but the candidate never held is dropped — the record cannot be invented — and the count is visible in the code path rather than silently swallowed.

**The one fallback, stated plainly:** when a candidate references nothing in either direction (no node cites anything, no source maps to a kept node) *every* source it holds becomes the confirmation's provenance, bounded as above. Such a candidate's sources are exactly the material Sylf read for that scope, and the alternative — an empty snapshot with refs — is the defect being closed. Every test that describes the precise case (nodes citing A/B with an irrelevant C present) asserts that C is dropped.

## 9. User-upload behaviour

An upload's source is `USER_UPLOAD` with `publisherOrDomain: null` and the student's own delivery reference as its URL (`https://upload.sylf.local/syllabus`). Confirmation copies that verbatim: the URL is preserved, **no public address is invented**, no author is claimed, and `sourceTypeIsOfficial("USER_UPLOAD")` is false — so an upload can never be presented as an authority anywhere in the planner. A paste has no source at all and therefore an empty snapshot, rather than a synthesised one.

## 10. Edit and reconfirmation behaviour

**Chosen semantics: confirmed provenance belongs to the confirmation state.** `updateScopeUnits` already withdrew the confirmation (`confirmedAt: null`, because the student must confirm what is actually there); it now withdraws the provenance with it (`provenanceRefs: []`, `provenanceSources: []`).

Why clearing rather than retaining: the snapshot is evidence for *a specific confirmation* — the material read when the student confirmed those units. Once the units change, it no longer supports what is on screen, and showing it would present historical evidence as if it justified an edited, unconfirmed scope. The brief keeps no history of previous confirmations (that belongs to sealed Planner revisions, which this patch does not touch), so the smallest coherent rule is that provenance lives and dies with the confirmation. The next confirmation writes a fresh one.

This makes the §16 lifecycle observable end to end: confirm A → snapshot A; edit → confirmation **and** snapshot withdrawn; research again → confirm B → snapshot is exactly B's, with A's records absent and no merging by id or title (asserted on real PostgreSQL).

## 11. Backward compatibility

- A brief stored before this field existed parses: `.default([])` supplies the empty snapshot, and no other field changed shape. Asserted three ways — a schema-level test that deletes the key from an `emptyBrief`, a database test that writes a **legacy brief through the session layer** (which stores the brief as opaque bounded JSON, so the old shape is genuinely represented) and reads it back intact with its two refs and an empty snapshot, and the ordinary `patchIntake` path.
- Nothing fabricates the missing records: an old ref that no record resolves is reported as "no source retained", which is the truth about that session.
- No reader breaks: `provenanceRefs` had exactly two consumers before this patch (the `scope_confirmed` telemetry count and the confirmation writer), and no readiness, distribution, adapter, generation or UI code reads refs at all (checked by grep). The telemetry's `sourceCount` now reports the *referenced* count, which is the more meaningful number.

## 12. Plan Brief size impact

Measured in `phase-3-measurements.test.ts`, all against the unchanged 65,536-byte ceiling:

| Shape | Bytes |
| --- | --- |
| 40 topics, no provenance | 6,140 |
| 40 topics + 8 confirmed sources | **9,002** |
| 158 nodes + comparison | 21,673 |
| 158 nodes + comparison + 8 confirmed sources | **31,004** |
| 8 confirmed records alone | **2,721** (~340 bytes each) |

The worst measured case uses **47%** of the envelope, and the snapshot is 4% of it. The ceiling was **not** raised, and no other bound moved. The `nodeIds` omission is what makes this comfortable rather than marginal: carrying them would have added roughly 19 KB to the worst case.

## 13. Curriculum-comparison interaction

The comparison service now has durable target provenance available — `brief.scope.provenanceSources`, which it already receives as part of the brief — but **it does not use it yet**, and nothing about the comparison's inputs changed: no second target-research call was added, no new provider work exists, and the comparison still researches the *background* curriculum only. The field is contract-level and therefore exposed to the client and every server service without a new endpoint. Phase 4 can read it when it needs to; this patch's obligation was to eliminate the dangling reference, and that is done.

## 14. Security and privacy

- The snapshot is a **projection of records Sylf already held**, taken from the candidate — never from model output. The model's extraction schema has no URL field, so a model-composed address still has nowhere to land (asserted in Phase 3 and unchanged).
- URLs are copied verbatim from the source record: for research, the address the search provider returned or a validated `finalUrl` the fetcher actually reached; for an upload, the student's own delivery reference.
- **No content is stored**: no page text, HTML, PDF body, snippet, prompt or model output. The schema is strict, so such a field cannot be smuggled in.
- **No new data reaches a third party**, no new network call exists, and no credential is involved. The snapshot is bounded to 8 records on a per-user row that already existed.
- Confirmed provenance is per-intake and per-user: the existing ownership checks on every read and write path are untouched, and the foreign-user denial test still passes.

## 15. Tests

| Suite | Change | Result |
| --- | --- | --- |
| `__tests__/planner/comparison-contract.test.ts` | +9 status tests ("only a verified authority earns OK") | passes (31 in file) |
| `__tests__/planner/confirmed-provenance.test.ts` | **new**, 12 tests: referenced-only selection, both mapping directions, impossible reference, fallback, dedupe/bound, exact copy with no content, upload, empty paste, legacy parse, schema bound, size ratio | passes |
| `__tests__/planner/database-phase3.test.ts` | +4 tests: research A/B/C → confirm (C dropped, fields exact, candidate cleared, every ref resolvable), upload → confirm (USER_UPLOAD, no public claim, still generatable), edit → withdraw → reconfirm (A absent, B only), legacy brief written raw → reads intact | passes (16 in file) |
| `__tests__/planner/phase-3-measurements.test.ts` | +1 measurement test for the Phase 3.1 worst case | passes (7 in file) |
| Phase 2/2.1/3 regressions | unchanged | all pass |

One timing-sensitive assertion in `__tests__/planner/quick-plan.test.tsx` ("surfaces a second tab…") exceeded its 5 s wait **once** during a fully parallel 62-file run; it passed in isolation and on every subsequent run, and it was not loosened. It is recorded here rather than hidden.

## 16. Real PostgreSQL results

`node scripts/test-planner-postgres.mjs` — the whole planner suite on a disposable database: **76 files passed, 5 skipped; 981 tests passed, 7 skipped** (the seven skipped are live-provider smoke tests). The four new provenance tests run there, including the §16 reconfirmation lifecycle and the legacy-brief read.

The planner suite is **832 tests across 68 files** without a database and **988 across 81** with it.

## 17. Build, mobile and audit results

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| `npx prisma validate` | valid (no schema change, no migration) |
| `npm run audit:secrets` | no credential patterns found |
| `npm run audit:models` | no active runtime/config/test/script selects a retired model |
| `npm run mobile:build` / `mobile:verify` | built; `PASSED. Zero server-only symbols or secrets found in mobile/dist.` |
| `npm run build` | compiled successfully |
| `npx vitest run` (whole repository) | **188 files passed, 2,119 tests passed, 157 skipped** |

Every command was run after the final code change. The skipped tests are the five `*-provider-smoke` suites (live model keys) and the `database-*` suites when run without `PLANNER_TEST_DATABASE_URL` — the same database suites pass in the disposable-PostgreSQL run of §16.

## 18. Deviations

1. **`provenanceSources` is a dedicated smaller schema, not `ResearchSource`.** §7 permitted the conceptual shape to adapt; dropping `nodeIds`/`mappingConfidence` is justified by measurement (2,387 → 261 bytes per record), by redundancy with `ScopeNode.sourceIds`, and by §13's instruction to reduce redundant data rather than raise a bound.
2. **A no-reference fallback keeps all of a candidate's sources.** Stated in §8: when nothing in the confirmed scope points at a source, the material the candidate read *is* the confirmation's provenance. Dropping it would have produced empty refs for such scopes — the same class of defect, inverted.
3. **Editing a confirmed scope clears its provenance.** §15 offered "clear with the confirmation" or "retain as history"; the brief has no history model for previous confirmations, so the first option was chosen and documented (§10).
4. **No confirmed-provenance UI was added.** No such surface exists today, so §18's "do not build a large new provenance viewer" applies; the snapshot is contract-level.
5. **Comparison does not consume target provenance yet.** §17 explicitly permits this; no second target-research call was created.
6. **One pre-existing, unrelated lint error remains** (`useIntake.ts`, `react-hooks/set-state-in-effect` on the Phase 1 restore effect — reproduced with a minimal component to prove it is the pattern, not this patch).

## 19. Blockers before UX Phase 4

Nothing in Phase 3.1 is blocked. Unchanged pre-public items:

1. **Live research smoke** — still requires a Brave/Serper credential; `DEEPSEEK_API_KEY` is present, the search keys are not. The comparison's status rules are therefore verified against stubs and the authority registry rather than a live provider.
2. **Browser QA** — still not performed (no browser tooling in this environment); jsdom is not a substitute and is not claimed as one.
3. **Public enablement** and the Copilot/generated-Quest work remain out of scope by instruction.

---

## Explicit answers

**Can an INSTITUTIONAL-only comparison receive OK?**
No. It is `WEAK`, with every row and citation preserved. Asserted directly.

**What source types are required for OK?**
`OFFICIAL` or `OFFICIAL_PDF` — decided solely by `sourceTypeIsOfficial(...)` — and at least one *asserted* (non-`UNCLEAR`) unit must cite one.

**Can model confidence upgrade source authority?**
No. The server never reads `comparisonConfidence`; a `HIGH`-confidence institutional-only comparison is `WEAK`, asserted.

**After `confirmScope` clears `scopeCandidate`, can every confirmed `provenanceRef` still be resolved?**
Yes. Each ref is copied, with its record, into `scope.provenanceSources` in the same write; the database test asserts every ref resolves and that the candidate is gone.

**Are irrelevant candidate sources omitted from the confirmed snapshot?**
Yes — a source must be cited by a confirmed unit or map to one. In the A/B/C test, C (secondary, nothing points at it) is absent from the snapshot.

**Can a user-upload source gain a fake URL?**
No. The upload's own reference is preserved verbatim, `publisherOrDomain` stays null, and `sourceTypeIsOfficial("USER_UPLOAD")` is false, so it can never be presented as a public authority.

**Can later research silently rewrite confirmed provenance?**
No. The snapshot is written only by `confirmScope`, from the candidate being confirmed. A later research run creates a new candidate and leaves the confirmed scope untouched; only a new confirmation replaces the snapshot, wholesale.

**What happens to confirmed provenance when the user edits the confirmed scope?**
It is withdrawn with the confirmation (`confirmedAt: null`, refs and snapshot empty), so historical evidence is never presented as supporting an edited, unconfirmed scope.

**Does reconfirmation replace provenance cleanly?**
Yes. After an edit, a fresh research result and confirmation leave exactly the new confirmation's records — the earlier ids are absent and nothing is merged by id or title.

**Do old briefs still parse?**
Yes. `provenanceSources` defaults to `[]`; a legacy brief written through the session layer reads back with its refs intact and an empty snapshot, and no record is invented for it.

**Was the 64 KiB brief bound preserved?**
Yes, unchanged. Worst measured case: **31,004 bytes** (158 nodes + comparison + 8 confirmed sources); the snapshot itself is 2,721 bytes.

**Was a migration required?**
No. Both fixes live in the bounded `PlanBriefV1`/intake JSON contract; this patch did not modify `prisma/schema.prisma`, and it validates as before.

**Did Phase 3 comparison/preparedness/flexible-edit behaviour remain intact?**
Yes. The comparison states, row semantics, corrections, suggestions, staleness rules, the preparedness matrix (including priority/difficulty), and the draft-edit assessment and acknowledgement exchange all pass unchanged; the only behavioural change is the stricter `OK` rule and the stated caveat sentence on `WEAK`.

**Is UX Phase 4 safe to begin?**
Yes, with the pre-public items in §19 carried forward. This patch added no new surface, no new call and no new bound, and it leaves the confirmed target provenance resolvable for Phase 4 to build on.
