# Planner reliability, recovery and simpler UI

Updated 3 November 2026, Asia/Karachi. Continues the [session handoff](../../SESSION_HANDOFF_2026-11-01.md) and [Research efficiency work](../2026-10-30-research-efficiency/README.md). The user authorized frontend simplification, then autonomous end-to-end debugging while unavailable. Backend research, provenance, strategy, translation, allocation, independent review and separate confirmation remain intact.

## Actual model results

The reproduction is LUMS plan `873e178a-3c60-46f9-b1ff-7a90878c58e8`. Accepted goal, deadline, baseline and availability were preserved. These are development runs, not formal educational qualification.

| Attempt | Actual result | Settled estimated cost |
| --- | --- | --- |
| `40036537-a6cb-4ad0-9284-237c8cde839c` | One returned Research response; SQL `55P03` while closing the saved result. | $0.002929500 |
| `83d1a945-1bcf-4828-97ba-5c3b96b12f4a` | Three LOW Research calls saved and accepted; complete Research. Capacity then correctly stopped for an overdue unstarted 30-minute manual task. | $0.011369940 |
| `14713bf6-26a0-415f-9307-63f6df06b773` | Eight LOW model calls and one search. A schema correction succeeded. A later response contained JSON followed by DSML closing tags; mismatched strict admission/tolerant recovery prevented its repair. Stopped at Research after 7m08s. | $0.043087596 |
| `4880077a-acac-4cd1-8819-ac4f3441892c` | New run under Research protocol 2, $1.12 root ceiling; in progress at this snapshot. | Not final |

No prior stopped run is described as a successful study plan. Every returned response in the third run was durably retained with a SETTLED receipt, exact text and digest, including rejected output. The failure was acceptance/recovery, not loss of the model's bytes. Private full responses are retained outside tracked documentation; bounded evidence records hashes and validation outcomes.

## Corrections

**Preview persistence.** Separate trailing content/reasoning writers could overlap after awaiting the same slow write and compete with authoritative closure. Both channels now share one coalescing writer. It drains before settlement/closure, retains final text, and cannot queue overlapping transactions. No extra narration/model call or reduced output allowance.

**Strict JSON recovery.** Provider admission and immutable interpretation require the complete response to be JSON. Research recovery used the shared tolerant extractor, which discarded the trailing DSML tags and classified the rejected response as valid. The exact saved response reproduces that mismatch: strict parsing fails, while the former extractor returns a valid CLARIFY action. Research action, verification and synthesis parsing now consistently use `JSON.parse`. The existing one separately metered correction receives the original rejected bytes and actual validation feedback. It does not strip, salvage, silently rewrite or accept invalid output. Original and corrected receipts remain separate.

**Historical feedback.** The third run's verifier treated an earlier consequential flag as permanent authority even after the next proposal justified nonblocking uncertainty within the accepted GENERAL goal. New captures pin `researchProtocolVersion:2`: historical objections must be checked against the current proposal and accepted facts; they are not new student requirements. Genuine unresolved scope, feasibility, priorities and permission still block. Version 1 and absent-version prompt bytes remain unchanged. LOW/HIGH roles, generation allowances, root budgets and independent verification are unchanged.

**Capacity and recovery.** Terminal FAILED legacy quests and withdrawn work no longer reserve future capacity or generate unresolved-duration blockers. Failed V2 tasks whose remaining work is explicitly OPEN remain protected. Actual study seconds and raw history are retained. Overdue warnings name the task, date and remaining duration. The owned workspace projects current blockers; only unstarted manual tasks offer a date input, using the existing authenticated Quest API and its rest-day/mutation guards. Started or linked work stays in its existing review flow. Resolved dates stop displaying the obsolete overdue warning.

The real unstarted manual task `2605` was moved through the normal UI/API from 30 October to **3 November 2026**, the next accepted study day at the time. Its PENDING status and 30-minute duration were preserved; it was not deleted, completed or ignored. New planning requests explicitly close a waiting request through the existing cancellation endpoint before opening fresh authorization. Expired requests no longer require a separate unexplained close step. There is no automatic paid dispatch or automatic Apply.

**Quieter frontend and truthful progress.** Shorter copy; completed activity/reasoning folds away while active received text remains visible; dollar limit stays visible outside optional AI settings; changing it still clears consent. Translation is labelled Activities; stopped drafts use the actual stage. Reserved calls remain working rather than appearing stopped and causing the client to discard their following preview. Only actual source reads count as reads. Phone action buttons can wrap within the existing dock. The redesigned layout/tokens and native-app work are preserved.

## Spending authority

The existing explicit $1.75 development approval was reconciled against whole financial roots before further paid calls. At `2026-11-03T01:26:20Z`, conservative settled total including the earlier advice receipt was **$0.620733536**, with no queued/running requests or unknown costs. Adding the next $1.12 maximum gives **$1.740733536**, below $1.75. This is a catalog estimate, not an invoice or fresh allowance. The later user explicitly authorized autonomous final submission; it succeeded through the ordinary browser UI. Earlier user-performed submissions and earlier automatic-review handoffs remain historical facts, not current blockers. No API or database bypass was used to submit paid work.

## Verification

- Missing pre-fix full gate completed first: **424 V2 + 225 legacy = 649 PostgreSQL passes**, zero required skips and unchanged pins. [Receipt](../2026-10-30-research-efficiency/evidence/2026-11-01-resumed-full-postgres-2/postgres-harness-run.json).
- Preview fix: **26 role-resource/streaming + 225 legacy = 251 passes**. [Receipt](../2026-10-30-research-efficiency/evidence/2026-11-02-preview-coalescing/focused/postgres-harness-run.json).
- Latest unit bank: **521 tests / 48 files passed**. Includes parser/prompt boundaries, activity, recovery, shared streaming and preserved generation/confirmation behavior.
- Broad scripted workflow rerun: **246 V2 + 225 legacy passes**, with one new fixture failure because its direct task update omitted the required owner coordination. This was a test setup failure, not a bypassed check. Its [failed receipt](evidence/2026-11-03-recovery-2/focused/postgres-harness-run.json) is preserved. An earlier attempt stopped before tests on a TypeScript narrowing error; corrected before subsequent worker builds.
- Corrected/current targeted Research: **30 + 225 passes**. [Receipt](evidence/2026-11-03-understanding/focused/postgres-harness-run.json). The two extra-suffix cases retain original rejected bytes, perform exactly one correction, then complete independent synthesis.
- Corrected/current targeted capacity: [receipt](evidence/2026-11-03-capacity/focused/postgres-harness-run.json). This checks terminal legacy work, genuine overdue work, owned projection, coordinated rescheduling and clearing the obsolete warning.
- Worker build, latest unit/type/lint and shared mobile checks are recorded in the [verification receipt](evidence/verification.json). A final production web build remains pending after the current live run; an earlier in-progress build was stopped to consolidate final changes. No native build, hosted migration, deployment or commit was performed.
- Browser QA distinguishes actual account observations from the explicitly labelled unpaid fixture. Phone recovery was inspected at 390×844 with a light custom background/purple accent, plus desktop dark; prior checks cover light desktop, phone authorization/streaming and a dark custom background/pink accent. Full text remains inspectable. A purported 320px capture actually observed a 1200px viewport and is not claimed as phone evidence.
- Real browser samples of pending calls and received character counts are retained separately from scripted SSE tests. Complete real-model strategy → translation → allocation → review → ready remains unverified at this snapshot. Atomic application is covered by scripted service/HTTP journeys and still requires a separate real student confirmation.

See [bounded receipts](evidence/verification.json), [live observations](evidence/night-real-run-observations.json) and adjacent screenshots. Formal educational qualification and production rollout remain deferred.
