# Sylf Notes Phase 6 — hardening and qualification

**22 October 2026.** Phase 6 improves the existing production modules and qualifies bounded local workloads. **Public rollout remains gated** by live Google/deployment acceptance and physical-device testing. OneDrive and the separate Study Workspace were not started.

The Phase 0–5 reports, current architecture contracts, Phase 3 live checklist and complete [Study Workspace master plan](../../../workspaces/master-plan-october-2026.md) were reviewed. The initial 207-file snapshot matched final Phase 5 exactly. Source, failed diagnostics, qualifications and reproduction steps are indexed in the [evidence](evidence/README.md).

## Resolved issues and decisions

- **Recovery repeatedly rechecked complete ancestry for every revision.** The scan now visits reachable history once, shares verified dependency work within the operation, yields progress and supports cancellation. Corrupt ancestors invalidate descendants; missing journal rows remain explicit repair evidence. Fixed a recovered-frontier error around surviving unindexed ancestors. Cancel/owner closure cannot return a partial all-clear or mutate originals.
- **Closures read shared immutable objects repeatedly.** Each operation now reads a hash once, checks descriptor sizes/identities, update syntax and complete asset hashes, and preserves dependency-before-commit order. Explicit memory/object/revision budgets reject visibly while retaining source work. Causal import and checkpoint-state validation remain mandatory.
- **Cloud discovery downloaded earlier packs repeatedly while following later ancestry.** A bounded pull reuses only proofs established by successful verification and atomic installation earlier in that same pull. Proofs clear on return, expiry or budget rollover; a later pull still establishes provider availability. Fixed stale pagination-loop tracking after cursor expiry. Old local receipts never substitute for current cloud proof.
- **Queue claims scanned retained receipts for each job.** A single transactional, indexed claim now leases a bounded batch. Concurrent workers get distinct leases and stale acknowledgements still fail. Upload/readback/retry rules are unchanged.
- **Rich-text images stayed retained after closing documents.** Image URLs now belong to each mounted editor, deduplicate concurrent resolutions and are revoked on closure. Late reads cannot recreate URLs after owner/view closure. Failed asynchronous editor opens also release their stream. Stored images and native references remain intact.

The pinned stack, envelope/pack v1, database schema, encryption, authentication and ownership boundaries are unchanged. There is no pruning, destructive compaction, second content store, paid service or broader provider permission. Notes continues owning content/resume state; future Workspaces reference the same IDs. Current contracts are updated in [foundation](../../foundation.md) and [workspace/Drive](../../workspace.md).

## Measured before / after

| Controlled fixture | Before | After |
| --- | ---: | ---: |
| 40-revision integrity check | 3,360 object reads; 1,084.5 ms | 81 reads; 27.2 ms |
| Same revision closure | 161 reads | 81 reads |
| 120 revisions across 12 cloud packs | 41 pack reads; 466,220 downloaded bytes | 12 reads; 136,061 bytes |
| 24 rich-text editor cycles, eight 2 MiB images | 8 retained Blob URLs / 16 MiB | 0 URLs / 0 bytes; all 24 revoked |

The integrity fixture retained exactly the same 81 source objects/37,958 ciphertext bytes. Pack restoration preserved all original revisions/native text and downloaded each unique pack once. Final-code repetition confirms those transfer counts. Small closure latency was **28.6→37.4 ms**, so fewer reads do not establish a universal speedup. Main-window heap after image cycles stayed approximately **15.9 MB**; the fix releases Blob retention, not a demonstrated heap decrease or a megapixel decoding bound. These are local observations with synthetic provider latency, not live Drive throughput. Details and noisy/intermediate attempts remain in the evidence.

## Qualification results

| Workload / check | Verified result |
| --- | --- |
| Actual Chromium encrypted storage, 1,000 retained text revisions | Save p95 **12.3 ms**; integrity **941 ms**, 2,001 unique object reads; publication **14.7 s**; fresh native reconstruction **5.54 s**; no pending jobs. |
| Paced handwriting and independent backup | **5.03 elapsed minutes**, 1,200 strokes / 39,600 original samples, 1,201 notebook revisions. Provider interrupted throughout writing. Reload and actual archive-file import into a separate empty profile preserve identical native hash and every revision ID. Successful/cancelled integrity checks pass. |
| Fine-grained ink cloud catch-up | Actual `NotesLibrary` publishes the imported history in **16.4 s** across three foreground passes / nine packs; a fresh profile reconstructs **all 1,200 strokes and 1,201 original notebook revisions in 5.50 s**, with identical native hash. Simulated provider, zero pending jobs. |
| Sustained-session memory | Main-window heap **11.1→31.5 MB** as content and history accumulate; DOM nodes settle at **846**. Final sampled listeners **339**, with temporary peaks. Durable source storage **2.96 MB**, 2,408 objects including catalog/history. After portable import, local objects total **6.14 MB**, including retained readable interchange objects; these derived archive objects are not extra upload closure. This is neither flat-memory behavior nor total process/GPU measurement. |
| 1,000-document library | Cold/warm catalog **1.49 s / 103 ms**, 50 initial cards; sampled saves p95 **19.9 ms**. Empty synthetic notes, not 1,000 dense textbooks. |
| Dense ink / page navigation | 5,000 strokes / 320,000 samples; 14.34 MB native state. Hydration **589 ms**, cold render **166 ms**, sampled encrypted saves p95 **5.2 ms**. Separate 300-empty-page navigation p95 **9.8 ms**. |
| 300-page PDF with repeated six-megapixel image | First page **492 ms**; six navigations max **111 ms**; search **1.86 s**; export **1.64 s**, 4.29 MB. Two quiescent mounted pages, 4.93 million attached canvas pixels. |
| Regression / existing UI | **209 tests in 13 files pass**; optional profiler explicitly skipped. **15 rich-text + 10 handwriting + 14 PDF browser groups pass**, zero page errors. Existing quota/crash/retry, conflicting edits, ownership/logout, encrypted storage and broker tests remain green. |
| PDF fidelity / compatibility | Independent structure, source text/crop/rotation/units and Poppler pixel comparisons pass. Unchanged source pages remain pixel-exact; large export reuses one image object. Actual compiled Next export worker executes under production CSP. |
| Appearance/accessibility/builds | Desktop/tablet/phone, light/dark and custom backgrounds inspected; keyboard scan cancellation and dialog closure during scanning pass in four appearance/viewport combinations, alongside existing target checks. Web/mobile builds, root TypeScript, targeted ESLint and mobile server/secret-boundary audit pass. **63 notices / 202 pinned PDF.js resources** remain exact. |

Two-RAF writing samples and synthetic pen pressure are scheduling/input-contract checks, **not physical pen-to-photon latency or palm rejection**. Retained simulator timeouts were investigated rather than hidden: CPU samples concentrated in fake IndexedDB's growing completed-transaction bookkeeping. The 1,000-revision workload succeeds in Chromium's real database. No simulator implementation was patched to force success. The first independent restore harness correctly failed while first-use discovery remained offline; the corrected run completes normal cloud discovery before restore, preserving the mandatory provisioning gate.

## Remaining release risks

1. **Live Google and deployment are unperformed.** The final presence-only check finds Notes key/dedicated-client variables and general Google variables, but `NOTES_PUBLIC_URL` is absent and no authorized Notes test grant is available. Credential validity, consent and key restore were not verified. No hosted database, migration, consent or deployment was accessed. Complete the [existing staging/live checklist](../phase-3/setup.md), including sustained ink/PDF catch-up, two devices, quota/throttle, revoked consent and key/database restore. Synthetic transfers cannot establish production relay latency, request costs or school-tenant policy.
2. **Physical tablets and other browser engines remain gates.** Only installed Chromium was available. Safari/iPadOS, Firefox, Android WebView, S Pen/Apple Pencil, OS palm rejection, IME, thermal/process memory and screen-reader acceptance remain unqualified. No tools/browsers were installed. Test real textbooks/scans/fonts and dense multi-page annotations before release.
3. **Five minutes and 1,200 revisions are bounded qualification.** Hours, academic-year histories and maximum-size imports/exports remain unproven. Full revision graphs/replay and complete publication closure still have growing costs; integrity caches are bounded but the graph itself occupies memory. Archive/closure limits remain 256 MiB with additional object/revision budgets. Readable archive projections also add local import overhead. No automatic independent backup or retention policy is introduced. Very large histories can require explicit recovery/export design; they are never silently pruned.
4. **Browser/key limits remain fundamental.** Already unlocked tabs work through outages; cold offline opening stays locked. Explicit storage clearing, eviction/device loss and process death before persistence can lose unsynchronized/unacknowledged work. Back up server wrapping keys and wrapped-key database rows, plus independent content copies. Provider-readable cloud/export v1 is **not E2EE**. Open-note large-image decode and total worker/GPU/process memory are not bounded by the closed-editor URL fix.

## Readiness and next decision

The local implementation is ready for **authorized staging and physical-device acceptance**, subject to the limits above. No new product approval is needed for these reversible fixes. Before rollout, confirm the established online-cold-unlock/browser-durability wording, key-backup ownership and provisional provider-readable policy, then authorize staging setup/test accounts. Any retention pruning, offline key recovery, provider/account migration, E2EE or native authentication change needs its own reviewed contract.

Recommended next work is a narrowly scoped release-acceptance stage: live Drive tests, real tablets/native adapters and longer realistic study sessions, followed by a small monitored pilot. Use those results to decide whether native input/storage must precede broader rollout. **Stop after Phase 6; OneDrive and Study Workspace implementation remain separately authorized work.**
