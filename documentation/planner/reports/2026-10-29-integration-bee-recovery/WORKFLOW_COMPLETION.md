# Planner workflow and expandable live reasoning

Completed 30 October 2026, Asia/Karachi. Local web and compatible worker are running.

The user redirected this task from researching/generating the integration-bee
case to making the student generation workflow work, then requested a compact,
expandable trace matching the supplied reference. Formal educational qualification
remains deferred. No paid model test was run after that redirection.

## Delivered behavior

- Research, strategy, translation/scheduling and independent review hand off
  automatically within the existing compiler job. There is one web process and
  the existing background worker, not an OS process for each logical agent.
- A blocking Research uncertainty gets explicit validation feedback instead of
  silently repeating the same completion proposal. The server does not invent
  facts or reclassify the model's uncertainty. Genuine questions still use the
  exact durable clarification/continuation flow.
- Expired continuation is rejected before creating another doomed Attempt or
  changing accepted facts. The workspace offers a separately authorized new
  request and an explicit close action for expired clarification.
- The compact chronological trace interleaves actual dispatches and source
  actions. Expandable blocks show DeepSeek's documented `reasoning_content`
  output, with no synthesized thinking or extra narration calls. Natural
  strategy text streams separately; structured answers remain buffered and
  validated before advancing the compiler.
- Completed provider reasoning is sealed with a version/source/digest in the
  existing immutable financial response. Expanded reads check session ownership,
  Plan/Attempt/root correspondence and the retained digest. Partial previews
  use the existing fenced Attempt payload and cannot approve or execute work.
  Credential/internal-reference redaction affects display only. Old attempts
  without recorded reasoning are explicitly unavailable, never fabricated.

The [workspace contract](../../STUDENT_WORKSPACE.md#automatic-workflow-and-expandable-provider-reasoning)
records transport, finite display/retention limits and compatibility. DeepSeek's
[official reasoning-stream contract](https://api-docs.deepseek.com/guides/thinking_mode/)
was checked without a paid request. Existing compiler-v1 interpretation, leases,
accounting, cancellation, immutable history, Calendar validation and separate
atomic Apply remain intact. No tables, migrations, scheduler, provider route or
separate agent execution engine were introduced.

## Verification

Final verification passed on Node 24.21.0:

- **647 required PostgreSQL checks**: 422 V2 and 225 retained checks, zero required
  skips. Source pins passed with no source changes during execution.
- **513 unit tests across 50 files**, including provider SSE/JSON streaming,
  complete reasoning expansion and interrupted read recovery.
- Web build, existing worker build, TypeScript, mobile build and mobile bundle
  verification. The mobile bundle contains no server-only symbols or secrets.
- Scoped implementation lint passed without warnings. The shared provider files
  retain pre-existing explicit-any lint findings on untouched lines; their scoped
  check with only that rule disabled passed.
- Desktop (1440×980) and phone (390×844), default dark and custom backgrounds
  with both surface polarities: expanded blocks remain readable with no horizontal
  overflow. Temporary viewport overrides were reset. The actual owned account was
  checked read-only: historical trace, honest expiry and enabled new-request entry.

Receipts: [verification manifest](evidence/workflow-final-checks/verification.json),
[PostgreSQL run](evidence/final-workflow-reasoning/postgres-harness-run.json) and
[source pins](evidence/final-workflow-reasoning/postgres-source-pins.json).
The disposable PostgreSQL suite uses an audited schema bootstrap rather than
claiming replay of the incomplete historical migration chain.

Genuine PostgreSQL checks cover:
three public-HTTP/worker complete journeys (direct, Research recovery and
clarification), expiry without child creation, streaming ownership, cancellation
fencing, all four role reasoning channels, immutable raw reasoning, unchanged
usage and no public streaming of structured JSON. All providers are scripted in
these tests; external dispatch is not used. Browser fixtures are visibly labelled
unpaid and are not evidence of real-model execution.

## Live evidence and limits

The historical integration-bee run stopped in Research when its original
four-hour window expired. No complete real-model plan was produced or applied;
that is not claimed as a successful pipeline qualification. Historical Attempts,
outputs, account actions and financial receipts remain preserved.

Known estimated spending for the earlier authorized live debugging is
**$0.481002696**, with all recorded requests settled. This is the existing pricing
catalog's estimate, not a provider invoice. No new paid request was authorized or
started while implementing the workflow/live-trace changes. The user can start
a new request through the real interface with explicit consent and safeguards.

The MIT 2015 PDF remains unsupported by the existing bounded text indexer; this
is disclosed as unread evidence. The repaired MIT 2011 PDF preserves its original
hash and explicitly marks undecodable symbols as partial. Formal educational
quality, provider availability and every future model response are not certified
by scripted tests.

## Main owners changed

- Existing Research/Attempt/compiler/provider and role-accounting owners: loop
  feedback, expiry, safe recovery, streamed preview and retained provider trace.
- `lib/planner/v2/server/activity.ts`: fenced display snapshots and owned
  chronological/full-trace readers through the existing workspace endpoint.
- `lib/ai/providers/deepseek.ts`, `types.ts`, `text-stream.ts`: explicit opt-in
  reasoning streaming while retaining exact content, usage and fingerprints.
- Student workspace and `PlanningActivity.tsx`: automatic progress, expandable
  reasoning/action trace and honest expired-request recovery.
- Unit/HTTP/PostgreSQL regressions and current workspace/foundation contracts.

Unrelated working-tree work was preserved. Earlier debugging history and
intermediate failures are retained in [the historical log](README.md).
