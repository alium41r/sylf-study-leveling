# Sylvie overhaul verification

Date: 15 October 2026 (Asia/Karachi).

## Change

The former runtime described Sylvie as a fellow Hunter, included progression/profile/today/goals context on every model-backed turn, loaded memories by default, and exposed a broad agent tool suite. The short/full prompt paths also had different personalities. This overhaul replaces those defaults with shared runtime Markdown, bounded public Archive retrieval, validated navigation hints and intent-scoped tools. The exact plain short-introduction regression returns:

> Sylf helps you plan your studies, stay focused, and track your progress.

Individual mutations require a server-signed exact preview. Confirmation is independent of model output and chat quota, consumed atomically and bound to user/session/message. Planner requests bypass the general chat model and enter the existing draft assistant after review. Existing provider adapters, entitlements, quota accounting, chat sessions, attachment analysis and business mutation guards are reused.

No schema migration, dependency, new planning engine or V2 activation was introduced. The narrow Planner `SET_GOAL` command uses its existing intake action, and transferred requests disable direct intake edits until proposal confirmation.

## Verification record

Final command outcomes are recorded in `evidence/checks.json`. Relevant tests cover short/detailed responses, general-topic retrieval bypass, selected Archive chapters, personal-data isolation, model consistency, bounded history, ignored client instruction overrides, read deduplication, tool errors, exact confirmation, expiry/tampering/concurrency/replay, Planner detection and preference continuity, isolated draft resumption, proposal-only edits, retries, responsive state, account boundaries and exhausted-quota deterministic requests.

Visual evidence uses the mobile Vite mock fixture, not production accounts or live provider output. See [UI verification](evidence/ui-verification.json) and adjacent screenshots. It covers 1440×960 and 390×844, light/dark modes and custom colors, greetings, confirmation and Planner review controls. Historical mock conversation text still contains the old Hunter greeting; new empty-state greetings use the new copy.

The initial default Turbopack build stalled without progress and was stopped. The supported Webpack production build was used for a concrete compilation/route-trace check; see the final checks record for its outcome. Mobile output passed the production bundle audit; build artifacts are not used as evidence of live model behavior.

The broader AI suite contains pre-existing legacy failures in Classic Planner mocks, historical byte/hash assertions and planning-capacity expectations. A separate export of HEAD reproduced these categories without the overhaul. The old conversation E2E expectations for proactive writes and unconditional profile/memory injection were updated to the newly requested behavior, retaining authentication, ownership, tool execution/error, bounded history and provider fallback coverage.

## Limits and decisions

- Advanced saved-plan workflows do not accept free-text replanning through the existing interface. The prepared request remains available beside those controls; no saved-plan change is claimed.
- Supported providers receive identical persona/permission components. Live model wording, provider latency and hosted database behavior were not qualified by this offline run.
- Retrieval/detection is a bounded local index and deterministic intent selection. Unsupported or ambiguous questions fall back to ordinary conversation rather than a broad account/Archive scan.
- Dismissing a confirmation is local UI state; expiry and server consumption determine token validity. Failed execution consumes the proposal, preventing retries from duplicating writes. Multi-operation failures report partial results and stop.
