# Sylvie assistant

Sylvie's chat runtime is [the authenticated chat route](../../app/api/system-messages/chat/route.ts). Conversation, the quick overlay, and the Timer tutor use the same runtime, persona and provider adapters. Appearance and the existing conversation/session/attachment features retain their current owners.

## Chat UI and delivery

[Shared chat components](../../app/components/system/chat/) own the composer, memoized message/Markdown rendering and container scrolling. `useSylvieChat` owns requests, bounded history loading, cancellation, session adoption and stale-response guards for the workspace, quick popup and Focus assistant. It uses the existing API and conversation tables; it adds no parallel conversation persistence. The active Planner Designer/Copilot also uses the composer and text renderer while retaining its intake, proposal and application owners.

A new session ID is adopted into the current conversation before notifying its parent. It does not trigger a history reload, loading overlay or message-key replacement. Genuine session switches cancel prior work, clear the old draft and load history. Failed sends restore the submitted prompt when the user has not started another draft; late failures cannot overwrite a new conversation. Replies follow the bottom only while the user is near it; reading earlier messages stays in place with an explicit jump to latest. Loading states never blur existing content. The popup retains focus trapping and page scroll locking; account changes remount the workspace/popup, and Focus retains its account-keyed route.

The client requests SSE with `Accept: text/event-stream`. JSON remains the default for existing callers, including the formula tool. Stream events carry status, session adoption, visible text, fallback resets and a final authoritative result. The result follows message persistence and awaited telemetry settlement. One shared transport keeps the 245-second deadline active through body consumption; server cancellation and the 240-second deadline still reach providers.

DeepSeek, Gemini and Groq GPT-OSS stream text-only turns through their existing metered adapters. Private reasoning and tool arguments are not forwarded. Tool-enabled generations, structured Planner replies and other custom Groq models remain buffered; there is no artificial reveal timer. Tool execution and signed confirmations retain their existing boundaries. DeepSeek thinking metadata is kept only within server memory for tool continuation; it is neither rendered nor persisted. No extra model call is added for streaming. Educational image and complex STEM replies have a 32,768-token completion ceiling including reasoning; general/Focus replies allow 8,192. Concise output remains a prompt behavior, rather than a low ceiling. An output-limit finish produces a persistent incomplete-answer notice outside Markdown/math, with no automatic retry. Failed/aborted streams without usage retain unknown spend, and interrupted clients can refresh history rather than automatically resending a potentially completed request.

The controlled composer supports native image inputs and editable browser dictation across the workspace, popup, Focus and active Planner. Planner retains its 600-character input cap; normal chat retains 4,000.

[Phase 2 report and evidence](reports/chat-phase-2/report.md) records root causes, browser fixtures, regression results and live-provider limitations.

## Images and dictation

Images use the existing provider adapters and dispatch meter. Native `deepseek-flash` is the automatic vision primary, with Gemini fallback. Explicit Gemini is tried first and its existing image fallback is disclosed; unsupported Groq image requests ask the user to choose a compatible model. Four images can accompany text, with 5 MiB per file and 12 MiB total upload bounds. Server decoding rejects malformed/oversize inputs, corrects orientation, strips metadata and bounds dimensions without upscaling. GIFs use their first frame.

Chat images live in the private `ai-chat-attachments` Supabase bucket, provisioned with restrictive client isolation by the related Storage migration and accessed through the existing server storage client. The existing message attachment field stores a versioned manifest; no Prisma/schema change is required. Browsers receive authenticated API references, and providers receive five-minute signed URLs. Inline data is loaded only when a Gemini attempt requires it; DeepSeek follow-ups do not download/base64-encode the stored image on the app server. General turns do not download old images. Explicit references and image follow-ups reuse only relevant images. Historical public upload URLs are rewritten through an ownership-checked route. Deleted chats and failed uploads trigger object cleanup.

Planner images stay within its tab-local conversation and existing JSON interpretation/review flow. Image-derived commands are always proposal-only, enforced on the server. Full document/syllabus imports retain the existing scope workflow. Planner image files/previews are released when their turns expire or the interface closes.

Dictation detects standard/prefixed browser recognition, prefers installed on-device language support when available, and otherwise discloses browser-service processing. It appends to the current draft, never sends automatically, and supports stop, cancel and explicit retry. Surface changes, cancellation and interruption release recognition; popup closure cancels before its exit animation. No audio recording, transcription endpoint, paid transcription provider or language-pack download is introduced. Unsupported environments show keyboard dictation as a fallback.

[Phase 3 implementation and verification](reports/multimodal-phase-3/report.md) records browser limitations, operating-cost estimates and hosted/live-provider qualifications.

## Instructions and knowledge

The runtime reads three independent files, cached per server process:

- [persona.md](../../lib/ai/sylvie/persona.md): identity, natural tone, adaptive response length and conversational behavior.
- [knowledge.md](../../lib/ai/sylvie/knowledge.md): general knowledge, public documentation and live-data boundaries.
- [capabilities.md](../../lib/ai/sylvie/capabilities.md): available actions, confirmation, limitations and Planner ownership.

[Runtime README](../../lib/ai/sylvie/README.md) explains maintenance. [prompts.ts](../../lib/ai/prompts.ts) composes the same instructions for all supported models and workloads; Next's route tracing includes the Markdown files. Restart/redeploy after instruction edits.

[knowledge.ts](../../lib/ai/sylvie/knowledge.ts) maps the existing [Archive catalog](../../lib/archive-catalog.ts) to discovery terms and current pages. Retrieval is local, with no model/search/database request. It selects at most two entries, bounded to 2,800 characters each and 6,000 total. The index and unrelated entries are not model context. A broad introduction uses a tiny app overview. Extra language/style instructions remain on the normal model path; the exact plain short-introduction request has a one-sentence, model-free reply.

General conversations receive no account statistics, goals, analytics or memories by default. The runtime adds a local date/timezone and an allowlisted page hint. Timer may provide a bounded subject name; that hint does not establish an active timer, plan or task. Recent history is scoped to the authenticated user/session and bounded to 20 messages/18,000 characters. Long assistant turns retain their opening and stopping point within the per-message bound, with omitted middle text disclosed. Public references, page hints, history, memories and tool results do not override instructions or permissions.

## Tools and confirmation

[turn-context.ts](../../lib/ai/sylvie/turn-context.ts) offers tools for the user's current intent. Explanations of app mechanics do not authorize account reads or edits. Explicit web research can use the existing search tool; unavailable search returns an error rather than synthetic findings. The shop catalog is not the user's owned inventory.

The server rejects tools outside the advertised set and reuses identical read results within a turn. Task/goal edits, completion, scheduling, memories and insights require a preview and explicit confirmation; there are no proactive writes. [action-server.ts](../../lib/ai/sylvie/action-server.ts) signs exact arguments, binding them to the authenticated user, chat session and persisted assistant message. Confirmation claims the proposal atomically before execution, without another model call or chat quota. Expired, modified, cross-user, cross-chat and replayed tokens fail closed. Existing ownership checks, capacity checks, execution transactions, reward ledgers and linked-plan mutation guards remain in the executor.

A failed confirmation is consumed: inspect current state before requesting it again. A multi-action confirmation stops at the first failure and reports earlier results; the batch is not a new cross-operation transaction. Cancel dismisses a preview locally; server expiry/consumption governs validity. Reopened authenticated chats restore valid pending previews and prepared Planner requests from hidden metadata; metadata is stripped from rendered text and model history.

## Planner boundary

[planner-bridge.ts](../../lib/ai/sylvie/planner-bridge.ts) recognizes study planning, exam preparation and replanning, preserving bounded relevant user statements and explicitly requested user-stated study memories. It does not infer requirements from assistant suggestions or generate a separate schedule.

“Review in Planner” authorizes opening the existing draft flow and forwarding the request to Designer/Copilot. New requests use isolated idempotent intake keys, preserving the normal unfinished brief. Transferred edits are proposal-only and require the existing signed proposal review. `SET_GOAL` maps to the existing intake `setGoal` action and is restricted to pre-generation. The Planner still owns generation, revisions and application. This bridge does not depend on unfinished V2 generation/qualification.

Replanning can forward to a restored intake with a bound plan. Advanced saved-plan screens currently have no compatible free-text interface: they retain the prepared request and a copy action while the user selects a saved plan and uses its review controls. Sylvie does not claim a plan was changed. Failed transfers offer explicit retry; pending transfers are aborted on navigation and account context is cleared on identity changes.

## Verification

Chat now shares identical read results across fallback attempts and bounds tool-result context to 8,000 serialized characters per result and 24,000 per engine attempt, disclosing omitted data. Its server deadline is 240 seconds; clients allow 245 seconds and abort stale requests. [AI accounting](../performance/ai-accounting.md) describes per-dispatch receipts, unknown costs and deployment requirements. Persona, selective Archive retrieval and action confirmations retain the behavior described above.

Behavior tests are in `__tests__/ai/sylvie-*`, [conversation E2E](../../__tests__/ai/e2e-conversation.test.ts), [Planner delegation](../../__tests__/planner/sylvie-planner-delegation.test.ts), and the affected UI suites. [Overhaul report](reports/overhaul/report.md) records this run, including build results, baseline failures and mock-browser evidence. Provider mocks verify consistent prompt assembly and execution boundaries, not live model wording or production latency. No live-provider or hosted-database qualification is implied.

[Final cross-phase audit](reports/final-audit/report.md) records subsequent fixes, hosted telemetry qualification with synthetic rollback, current test results and remaining provider/device limits. Daily briefings now use task summaries and workload hints without the broad profile dump or forced gaming language. Deterministic follow-up context belongs to the adopted chat ID and never carries into a new conversation.

[Long-answer truncation fix](reports/long-answer-truncation/report.md) records the production `length` receipt, higher completion/timeout allowances and regression coverage.

## Mathematical formatting

All chat surfaces, Planner text, Focus formulas and Scratchpad previews use [MarkdownRenderer](../../app/components/MarkdownRenderer.tsx). The renderer and stylesheet use one pinned KaTeX installation through the package override; keep them aligned when upgrading. [Math normalization](../../lib/markdown-math.ts) accepts dollar and bracket delimiters while preserving Markdown code. It gives same-line double-dollar equations display layout and preserves multiline equations/list indentation. Recovery of an orphan dollar is deliberately limited to complete vector/accent/symbol atoms; it does not guess missing mathematical arguments or rewrite saved answers. Shared scoped CSS preserves formula spacing and contains wide equations in horizontal scrollers. Unrenderable expressions remain visible with a neutral fallback; HTML/URL trust is disabled and macro expansion/size are bounded.

[Math rendering fix and verification](reports/math-rendering/report.md) documents the mismatched KaTeX versions, malformed-delimiter regression and desktop/mobile evidence.

## Calendar tools

Calendar Phase 4 extends this same runtime with seven bounded read/proposal tools and transient selected-date/view context. The existing signed confirmation, ownership/revision guards, routing, per-dispatch metering, history and Planner review flow remain authoritative. Calendar reads bypass older quest-only cheap summaries; unrelated general chat does not retrieve calendar data. Follow-ups retain the signed proposal's human-readable details in bounded server history, while signatures stay hidden from the model. Confirmed calendar results refresh the existing calendar projection. Gemini schema translation preserves nested nullable recurrence objects and enums across fallback.

The [current calendar contract](../calendar/README.md#sylvie-calendar-assistance-phase-4) defines tool limits, deterministic availability/conflicts, typed-note excerpts, study/Planner boundaries and failure/recovery semantics. [Phase 4 report](../calendar/reports/phase-4/report.md) records the validation, live-provider exercise and future handoff.

Calendar Phase 5 adds bounded `getCalendarConnections` discovery and provider-aware destinations/source filters to the existing tools and confirmation flow. External ETags/occurrence identities, read-only permissions, stale coverage and pending acknowledgements are enforced by the canonical calendar adapters. There is no separate assistant or model backend. See the [connected-calendar contract and qualification limits](../calendar/reports/phase-5/report.md).

Calendar Phase 6 adds owner-only indexed `searchCalendarNotes`, reviewed recognition excerpts, and accepted shared calendars in existing discovery/read/proposal tools. Shared writes preserve signed confirmation, disclose member visibility and recheck permissions through the canonical event service. No private notes, conversations or provider data are shared. See the [Phase 6 report](../calendar/reports/phase-6/report.md).
