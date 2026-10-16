# Phase 2 — unified AI chat architecture and UI

Implemented October 15, 2026. The Sylvie workspace, quick popup and Focus assistant now share conversation behavior, message rendering and a composer. The active Planner Designer/Copilot reuses the visual primitives while retaining its specialized requests and review controls. No database operation, application deployment, paid AI call or Planner V2 activation was performed.

## Root causes and fixes

The first successful workspace reply could create a new session and notify its parent before finishing local message reconciliation. Changing `sessionId` then triggered another history load, enabled an absolute backdrop-blur loading overlay and could replace the fresh reply with cached history. The blur overlay sat inside the scrolled conversation, explaining why the upper section could look blurred or reloaded. Optimistic messages also changed keys on settlement, remounting message animations.

The shared hook now marks a returned session as the current conversation **before** notifying the parent. Adoption skips the history effect entirely. Optimistic and streamed turns keep stable client keys after receiving persisted IDs. Loading is a separate inline state during genuine history switches; there is no transcript blur/filter or per-message transform animation. Regression tests and browser checks confirm no extra history load, no loading overlay and identical message DOM nodes before and after first-session completion.

Each surface also had its own request/stop/history logic and forced scrolling on message updates. Some used delayed `scrollIntoView`, which could move enclosing page scrollers, while popup/Focus retained obsolete full-response reveal machinery. These are replaced by one request owner and container-local scrolling. New text follows only when the user is near the bottom; an explicit “Latest reply” control appears while reading earlier content. Resize observations handle content reflow without pulling an unpinned reader downward.

## Architecture and interface inventory

| Surface | Shared pieces and preserved behavior |
| --- | --- |
| Main Sylvie workspace | Shared hook, transcript, Markdown/math and composer. Preserves persistent sessions, developer model choice/metadata, file uploads/previews, signed confirmations, Planner handoff and quota refresh. |
| Quick assistant popup | Same conversation owner and rendering in a fixed compact layout. Loads selected history, preserves page hints, suggestions, Planner/workspace links, focus trapping, Escape behavior and page scroll locking. Closing/stopping cancels work. |
| Focus Timer assistant | Same hook/transcript/composer with subject context, conversation history/deletion, new/reset chat, existing skill-gated prompts and save-to-notes. Starting/switching a conversation aborts old delivery. |
| Active Planner Designer/Copilot | Shared composer and memoized Markdown/math presentation; aligned theme tokens and proposal controls. Retains its 600-character contract, tab-local transcript, existing endpoints, prerequisite/research cards, signed proposal review and application flow. It stays buffered and cannot stop an already authorized plan mutation. |
| Other AI feature inputs | Formula queries and Classic Planner generation are specialized feature forms rather than free-chat transcripts. Their owners remain; JSON compatibility and the timeout helper are covered by regressions. Human Social chat and unfinished Planner V2 are outside this change. |

The new owners are `app/components/system/chat/` and the small client/SSE protocol helpers under `lib/ai/sylvie/`. There is no new dependency, conversation store, planning engine or provider. Completed rows and Markdown skip reparsing on draft changes; streamed updates are batched to animation frames. Sending uses a synchronous in-flight guard, with stale request/history results rejected after switching or unmounting. Account changes preserve the existing cache/logout boundaries and reset active surfaces.

Visual changes use existing background, text, border and accent-foreground tokens: quiet assistant text, subtle user bubbles, consistent spacing, accessible controls, expanding textareas, readable math/code/tables and inline errors. The popup retains its compact shape; workspace and Timer keep their own dimensions. Legacy Planner page form styles required scoped overrides so embedded composers and proposal buttons use the intended colors, including dark text on bright custom accents.

## Genuine streaming and reliability

The existing chat route accepts optional SSE; callers without the header still receive JSON. It sends a session event early, visible deltas while a supported text-only model runs, a reset when a fallback replaces provisional text, and an authoritative result after persistence and telemetry settlement. The heartbeat contains no personal data.

DeepSeek HTTP SSE, Gemini SDK streaming and Groq GPT-OSS streaming use the existing per-dispatch observation boundary. Usage is taken from final provider metadata, including Gemini thoughts and Groq `x_groq` usage. Reasoning remains a completion subset; cache remains an input subset. Private reasoning is never a text event. Incomplete wire streams fail rather than certify partial output/zero cost. SDK attempts, model selection, output/thinking budgets, fallback deduplication and V2's separate meter retain their previous policies.

Streaming is limited to calls with tools disabled. Tool-enabled rounds and Planner structured proposals remain buffered to avoid exposing provisional tool arguments or altering execution decisions. A forced final text-only summary can stream. Other custom Groq models use their buffered path. This adds no generation, summary or research call. [DeepSeek's stream/usage contract](https://api-docs.deepseek.com/api/create-chat-completion/), [Groq streaming](https://console.groq.com/docs/text-chat) and the installed provider SDK contracts informed the transport implementation.

Client stop/disconnect cancels the reader and upstream request. The shared transport covers connection **and body consumption** with the existing 125-second client deadline; the server's 120-second deadline remains. Partial replies stay visible with an interruption notice and a refresh action. The client never automatically retries an uncertain request. A response can have been saved before the connection failed, so refreshing history is the reliable reconciliation path; exactly-once model execution across lost acknowledgements is not claimed.

The composer retains existing uploads and has optional capture-control and controlled-draft boundaries for the next image/voice phase. No inactive microphone or capture control is exposed, and no new device permission is requested.

## Verification

The focused suite passed **144 tests in 13 files** with two workers. The [checks](evidence/checks.json) record commands, baseline comparisons and a transient timeout from an earlier concurrent run. Focused tests cover provider deltas/usage, split UTF-8/SSE frames, terminal-result enforcement, stream timeouts/cancellation, tool/proposal buffering, first-session adoption, stable DOM, composition/newlines, duplicate submission, stale history/results, fallback reset, reading-position preservation, existing confirmations/Planner delegation and V2 meter compatibility.

The broader selected suite passed 592 tests, skipped two explicitly opt-in hosted tests, and retained **14 failures in three files**. Every failure title also occurred in the original baseline: existing Planner API/capacity/quota mocks. No new failure title was observed. These unrelated tests were not relaxed. Updated UI assertions account for genuine history loading, plain error messages and the ability to start a new conversation while cancelling an old request.

Strict TypeScript, production webpack build, mobile build and mobile server-boundary/secret verification passed. Shared UI/new files pass targeted ESLint; touched older provider/route/Planner files have separately recorded baseline lint debt. Generated mobile artifacts were restored after verification.

Browser verification used actual components with synthetic auth/API/provider responses, not user conversations. Twenty-four desktop/mobile cases cover four surfaces at 1440×1000 and 390×844 in dark, light and custom light-background colors. Four additional 320×740 custom-dark cases cover narrow layouts. All had a visible composer and no horizontal overflow; transcript filters/backdrop filters were `none`. Additional browser interactions verified first-session stable nodes/no loading overlay, live deltas before completion, Focus switching during delivery, popup stop with retained partial text, network feedback and reduced-motion dialog display. Existing theme generators were used. The Planner fixture includes its enclosing page's form styles.

These are component/route fixtures and provider-mocked checks. Live provider first-token latency, billing effects, hosted proxy buffering, real-device microphone/image capture and a deployed end-to-end release are **not** certified. No paid diagnostic call was needed. Semantic model quality and the existing output limits were not changed as a latency shortcut.

[Evidence and reproduction](evidence/README.md). [Current runtime/UI contract](../../README.md).
