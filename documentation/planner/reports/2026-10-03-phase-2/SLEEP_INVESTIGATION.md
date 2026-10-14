# Step 6 sleep/suspension investigation — 8 October 2026

Status: **INVESTIGATION COMPLETE; NO IMPLEMENTATION OR PROVIDER CONFIGURATION CHANGE**. Sleep contaminated the interrupted owned-research run and two full PostgreSQL runs. Four selected regression tests pass on both awake runtimes. The owned case now completes real research, independent compiler review, candidate sealing and canonical apply. Output truncation remains reproducible; Phase 2 remains incomplete.

## Observed chronology

macOS `pmset -g log` records the following actual Idle Sleep/Wake transitions. Times below are local Asia/Karachi (UTC+05:00), on 8 October. [Extracted events](evidence/step6-sleep-audit-2026-10-08/sleep-wake-before.txt) contain only the relevant power events; unrelated assertion logs are excluded.

| Interval | Duration | Overlapping evidence |
| --- | --- | --- |
|22:21:50–22:25:41|231 seconds|[Owned research](evidence/step6-live-2026-10-08T17-16-24-282Z/live-corpus.json) dispatched at22:21:47.788, then returned a network failure at wake; its case ended22:25:41.387.|
|22:31:03–22:31:36|33 seconds|[Second Docker regression](evidence/step6-boundary-2026-10-08/reservation-regression-second-run/postgres-harness-run.json) ran22:28:30.969–22:31:44.650 and failed lease recovery, parallel reservation and root deadline assertions.|
|22:35:55–22:36:07|12 seconds|[Native full regression](evidence/step6-postgres/postgres-harness-run.json) ran22:34:05.243–22:36:36.524 and failed the linked lost-repair retry case with STACK_TRACE_ERROR.|

The interrupted owned call's233.368-second host latency is dominated by the231-second sleep and finishes immediately after wake. Its historical durable metadata nevertheless records completion at17:21:52.805UTC, while the host case ends17:25:41.387UTC. Suspension-related Docker VM clock lag is a plausible explanation for that difference; no synchronized host/DB sample from that historical instant exists, so the exact offset/cancellation mechanism is not proven. The original UNKNOWN_SPEND reservation stays unknown; a successful rerun cannot settle or refund it.

The research sub-window is120seconds, the worker lease45seconds with10-second renewals, and the unchanged PostgreSQL test timeout10seconds. Suspension interrupts progress and renewals and can consume deadline/test windows. The native sleep exceeds that timeout. These are mechanisms consistent with the failures, not proof of which assertion was executing: prior summarized regression evidence lacks per-test timestamps and actionable timeout diagnostics. No deadline, lease, retry, timeout or reservation is reset or widened for this investigation.

The following failures have independent evidence outside sleep:

- Tiny with extra capacity finishes22:20:32.971, before sleep. Both mandatory reviews settle4096 output tokens with MAX_TOKENS and no final content.
- Triage finishes22:21:47.565, before sleep. Both generation attempts settle8192 output tokens with MAX_TOKENS. These results remain valid and were not rerun.
- Parallel reservation also fails in the [first Docker run](evidence/step6-boundary-2026-10-08/reservation-regression-first-run/postgres-harness-run.json),22:06:19.143–22:09:47.462, with no recorded sleep overlap. Sleep cannot explain that earlier failure; it remains an intermittent observation even though both new selective reruns pass.

## Selective awake reruns

The audit reused the existing disposable PostgreSQL bootstrap, migrations, identity checks, cleanup and exact test source. A [temporary derived harness](evidence/step6-sleep-audit-2026-10-08/selective-harness.mjs) selected only four named failures and the one interrupted registered live case; it omitted the unrelated full407-test prerequisites. Test assertions, configured10-second timeouts, compiler/provider options and every budget/cap/deadline/holdback remain unchanged. This wrapper is investigation evidence, not a product or original harness edit.

`caffeinate -dimsu` was bound to the audit process. [Start assertions](evidence/step6-sleep-audit-2026-10-08/assertions-during-start.txt), [end assertions](evidence/step6-sleep-audit-2026-10-08/assertions-during-end.txt) and [subsequent power events](evidence/step6-sleep-audit-2026-10-08/sleep-wake-after.txt) confirm no sleep during22:51:44.467–22:54:26.663. [Release evidence](evidence/step6-sleep-audit-2026-10-08/assertions-after-release.txt) confirms the temporary caffeinate process released its assertions. No persistent power setting changed. [Source comparison](evidence/step6-sleep-audit-2026-10-08/awake-runs.json) finds zero differences across3,530 non-documentation files.

| Exact selected regression | Docker | Native PostgreSQL18.4 |
| --- | --- | --- |
|Expired lease recovery preserves budget/checkpoint and rejects old fence|PASS|PASS|
|Parallel reservations retain mandatory review capacity and refund undispatched calls|PASS|PASS|
|Database root deadline aborts an adapter ignoring cancellation|PASS|PASS|
|Explicit linked new root retries a lost repair; ordinary takeover cannot|PASS|PASS|

[Docker results](evidence/step6-sleep-audit-2026-10-08/docker-regressions/postgres-sleep-affected-results.json) and [native results](evidence/step6-sleep-audit-2026-10-08/native-regressions/postgres-sleep-affected-results.json) each record4passed/0failed. Each runner intentionally leaves47 other tests unselected; raw reports retain that distinction. These eight selected executions are **not a replacement full407-test gate**. All historical failed manifests remain intact. Fresh clock samples show DB-minus-host midpoint approximately−2.18ms for Docker and+0.55ms for native; neither has a material clock discrepancy during the rerun.

## Owned-document live result

[Raw live output](evidence/step6-sleep-audit-2026-10-08/owned-research-live/live-corpus.json) uses the same production-primary Flash options and previously authorized temporary existing DeepSeek fallback as the interrupted run. There is no new reasoning/sampling/model override or persistent routing change. The production route still leaves thinking unspecified. The registered corpus SHA-256 remains`e63997ebbe7702938d8564a5eb63cfc7687ee39622346e19a7dbd026af52df9a`.

The case **SUCCEEDS and canonically APPLIES** two Quests/one Goal in132.453seconds. Owned extraction/verification finishes in28.024seconds, with actual419-character uploaded content/hash, five exact quoted claims, honest UNKNOWN issuer authority and durable adoption. Existing aliases are annotated; the changed-data requirement uses ADD_SCOPE with no invented parent, and the server assigns its new scope identity. No network error, research/root deadline failure or unknown-spend call occurs.

There are6actual external calls, all SETTLED:32,907input/26,931output tokens. All6pricing receipts remain UNKNOWN; cost is not reported as zero. Primary blueprint output reaches8192tokens and primary review reaches4096tokens; each needs its existing fallback. Those are genuine awake truncations despite eventual success. Upstream latencies are14.432/13.453/38.707/24.205/21.148/19.485seconds, distinct from whole-case latency.

[Separate educational inspection](evidence/step6-sleep-audit-2026-10-08/owned-research-live/independent-evaluation.json) accepts this single case's registered expectation with limitations, after checking original text, provenance, full scope, actual instructions/criteria, allocation and execution. The plan asks for learner-created CSV data, correct hand-checked totals, explicit malformed-row reasons and a changed-data demonstration. It books two35-minute dependent activities on distinct days under60-minute ceilings; its error fix remains contingent and uncommitted. Model self-approval or successful apply is not the basis for that separate assessment. Starting skill and estimate accuracy remain unknown.

The review reports no findings; there is **no compiler repair or exact verification**, and no adaptation. This success does not satisfy the required natural repair→verification→canonical apply witness. It also does not establish reliable output: two primaries still truncate.

## Classification and remaining acceptance

The research network/deadline failure is strongly associated with sleep and does not reproduce while awake. Exact SDK cancellation cause and historical clock offset remain uncertain. The sleep-overlapped lease/deadline/linked-repair regressions likewise do not reproduce on either awake runtime. Parallel reservation remains intermittent because it previously failed without sleep. Tiny and triage truncation failures remain valid, and truncation reproduces in the fresh owned run even though fallback recovers.

No implementation/provider changes are justified solely by the contaminated failures. The original failed subset and aggregate are preserved as historical runs; this audit is separate evidence, not a silent pass or rewritten full corpus. No additional cases, full17-case comparison, full regression refresh, defect injection or later-phase work was performed. Phase2acceptance and the natural repair witness remain open. [Machine-readable audit summary](evidence/step6-sleep-audit-2026-10-08/SUMMARY.json) records the exact results and limits.
