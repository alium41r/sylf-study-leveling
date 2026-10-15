# Sylvie assistant

Sylvie's chat runtime is [the authenticated chat route](../../app/api/system-messages/chat/route.ts). Conversation, the quick overlay, and the Timer tutor use the same runtime, persona and provider adapters. Appearance and the existing conversation/session/attachment features retain their current owners.

## Instructions and knowledge

The runtime reads three independent files, cached per server process:

- [persona.md](../../lib/ai/sylvie/persona.md): identity, natural tone, adaptive response length and conversational behavior.
- [knowledge.md](../../lib/ai/sylvie/knowledge.md): general knowledge, public documentation and live-data boundaries.
- [capabilities.md](../../lib/ai/sylvie/capabilities.md): available actions, confirmation, limitations and Planner ownership.

[Runtime README](../../lib/ai/sylvie/README.md) explains maintenance. [prompts.ts](../../lib/ai/prompts.ts) composes the same instructions for all supported models and workloads; Next's route tracing includes the Markdown files. Restart/redeploy after instruction edits.

[knowledge.ts](../../lib/ai/sylvie/knowledge.ts) maps the existing [Archive catalog](../../lib/archive-catalog.ts) to discovery terms and current pages. Retrieval is local, with no model/search/database request. It selects at most two entries, bounded to 2,800 characters each and 6,000 total. The index and unrelated entries are not model context. A broad introduction uses a tiny app overview. Extra language/style instructions remain on the normal model path; the exact plain short-introduction request has a one-sentence, model-free reply.

General conversations receive no account statistics, goals, analytics or memories by default. The runtime adds a local date/timezone and an allowlisted page hint. Timer may provide a bounded subject name; that hint does not establish an active timer, plan or task. Recent history is scoped to the authenticated user/session and bounded to 20 messages/18,000 characters. Public references, page hints, history, memories and tool results do not override instructions or permissions.

## Tools and confirmation

[turn-context.ts](../../lib/ai/sylvie/turn-context.ts) offers tools for the user's current intent. Explanations of app mechanics do not authorize account reads or edits. Explicit web research can use the existing search tool; unavailable search returns an error rather than synthetic findings. The shop catalog is not the user's owned inventory.

The server rejects tools outside the advertised set and reuses identical read results within a turn. Task/goal edits, completion, scheduling, memories and insights require a preview and explicit confirmation; there are no proactive writes. [action-server.ts](../../lib/ai/sylvie/action-server.ts) signs exact arguments, binding them to the authenticated user, chat session and persisted assistant message. Confirmation claims the proposal atomically before execution, without another model call or chat quota. Expired, modified, cross-user, cross-chat and replayed tokens fail closed. Existing ownership checks, capacity checks, execution transactions, reward ledgers and linked-plan mutation guards remain in the executor.

A failed confirmation is consumed: inspect current state before requesting it again. A multi-action confirmation stops at the first failure and reports earlier results; the batch is not a new cross-operation transaction. Cancel dismisses a preview locally; server expiry/consumption governs validity. Reopened authenticated chats restore valid pending previews and prepared Planner requests from hidden metadata; metadata is stripped from rendered text and model history.

## Planner boundary

[planner-bridge.ts](../../lib/ai/sylvie/planner-bridge.ts) recognizes study planning, exam preparation and replanning, preserving bounded relevant user statements and explicitly requested user-stated study memories. It does not infer requirements from assistant suggestions or generate a separate schedule.

“Review in Planner” authorizes opening the existing draft flow and forwarding the request to Designer/Copilot. New requests use isolated idempotent intake keys, preserving the normal unfinished brief. Transferred edits are proposal-only and require the existing signed proposal review. `SET_GOAL` maps to the existing intake `setGoal` action and is restricted to pre-generation. The Planner still owns generation, revisions and application. This bridge does not depend on unfinished V2 generation/qualification.

Replanning can forward to a restored intake with a bound plan. Advanced saved-plan screens currently have no compatible free-text interface: they retain the prepared request and a copy action while the user selects a saved plan and uses its review controls. Sylvie does not claim a plan was changed. Failed transfers offer explicit retry; pending transfers are aborted on navigation and account context is cleared on identity changes.

## Verification

Behavior tests are in `__tests__/ai/sylvie-*`, [conversation E2E](../../__tests__/ai/e2e-conversation.test.ts), [Planner delegation](../../__tests__/planner/sylvie-planner-delegation.test.ts), and the affected UI suites. [Overhaul report](reports/overhaul/report.md) records this run, including build results, baseline failures and mock-browser evidence. Provider mocks verify consistent prompt assembly and execution boundaries, not live model wording or production latency. No live-provider or hosted-database qualification is implied.
