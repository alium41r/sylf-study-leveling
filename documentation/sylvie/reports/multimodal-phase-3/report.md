# Phase 3 — native images and editable dictation

Implemented October 15, 2026 across the Sylvie workspace, shortcut popup, Focus assistant and active Planner Designer/Copilot. Existing streaming, confirmations, conversation ownership, quotas and dispatch accounting remain in place. No paid AI call, application deployment or Planner V2 activation was performed. One related Storage migration was applied through the existing Supabase/Prisma workflow; application schema fields remain unchanged.

## What changed

The existing DeepSeek adapter already accepted image blocks, but automatic routing preferred Gemini, uploads were written into a public directory, and image context disappeared after the first turn. The shared composer exposed uploads only in the workspace and had no dictation control. The app’s microphone policy also prohibited recording, and Next’s default request buffer was smaller than the new bounded multi-image payload.

The shared composer now accepts multiple images, paste/drop, previews and removal, alongside a small microphone control. Upload feedback is indeterminate and reflects actual request phases; it does not invent progress percentages. Image thumbnails reserve their space, completed replies retain stable rendering, and narrow layouts scroll the attachment strip rather than the page. Planner’s inherited link/button styles required scoped corrections for image galleries.

Native vision defaults to `deepseek-flash`, matching the [provider’s image contract](https://api-docs.deepseek.com/guides/vision/). Text and up to four images enter the existing generation call; there is no extra OCR, summarization or file-upload call to the AI provider. Explicit selections remain first choice. Unsupported Groq images receive a clear choice of compatible models; explicit Gemini retains its working Flash fallback with a visible, persisted disclosure. Text-only and image streaming retain the existing safe tool-free boundary; structured Planner outputs remain buffered.

Server validation enforces 5 MiB per image, 12 MiB total uploaded files, four attachments, valid decoded content and a 40-megapixel input ceiling. Images are oriented and metadata stripped, never enlarged, and capped at 4096 pixels per side. PNG remains lossless; JPEG/WebP use quality 92; GIF analysis uses the first frame. The image processor already installed with Next.js is now a direct server dependency. Next’s buffer is 13 MiB to accommodate framing; the application independently enforces its smaller bound, including dishonest/missing length headers.

## Privacy, continuity and Planner

New chat images use the private `ai-chat-attachments` bucket through the existing Supabase storage client. The sole pending migration provisioned the bucket and a restrictive policy denying direct client access, reusing the project’s existing private-bucket isolation pattern. All 65 migrations are applied. Runtime upload fails closed if the bucket is missing or public. Objects use generated owner/session paths. The existing attachment column holds a versioned manifest, with no schema change. Browser image requests recheck cookie authentication, revocation and ownership and prohibit caching. Only short-lived, five-minute provider URLs leave the server; storage paths/URLs are excluded from browser replies and logs. Existing public upload URLs now pass through an authenticated rewrite too.

“Use image again” and explicit image follow-ups select relevant existing references. Ordinary turns neither download old image bytes nor mint access URLs; image manifests never become model instructions. Identical files in one batch are deduplicated. References eliminate browser reuploads; a stateless model still needs image input, and may bill it, when a new answer requires that image. Failed uploads/message writes and chat deletion clean up objects. Cleanup is best-effort during failures; a process crash or storage outage can leave private orphan objects, without a background cleanup workflow added here.

Planner images enter its existing bounded interpreter with the same 600-character request, command validation, version guards and signed application controls. The server forces image-derived requests to proposal-only even if a caller asks otherwise. Full syllabus imports still use the existing scope workflow. Planner retains only its existing bounded tab-local transcript and local image previews; it adds no conversation database or planning engine. Its explicit image reuse resends the selected local file. Voice and normal chat preserve their 600/4000-character limits respectively.

## Dictation and browser limits

Dictation uses standard or prefixed Web Speech recognition. Installed on-device language support is preferred when availability can be checked; otherwise the browser may process audio through its own service. The composer discloses that possibility. Sylf creates no audio Blob, stores no recording, adds no transcription API and downloads no language model. Recognized text appends to the existing draft, remains editable, and is never submitted automatically.

Starting/listening/processing/error states support stop, cancel and explicit retry. Startup, processing and listening are bounded to 20 seconds, five seconds and 90 seconds. Permission denial, missing microphones, service failures and unsupported environments provide clear feedback. Only one composer can listen. New/switching conversations and closed/disabled interfaces release recognition. Two lifecycle fixes were necessary: starting another unsaved conversation now resets capture, and popup closure cancels before animation retains its children.

| Environment | Expected behavior and limits |
| --- | --- |
| Chrome/Edge desktop | Standard or prefixed recognition where available; installed on-device support is feature-detected. Browser/service policy can still reject recognition. |
| Chrome Android | Browser recognition; continuous listening may end after an utterance. No automatic restart. Local availability APIs are less widely supported. |
| Safari macOS/iOS | Prefixed recognition; availability depends on browser/OS settings. Local processing cannot be assumed. |
| Firefox stable, restricted WebViews, missing APIs | Feature detection and keyboard-dictation fallback. No substitute paid service. |

These limits follow [MDN’s speech documentation](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition), [on-device contract](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/processLocally) and [compatibility data](https://github.com/mdn/browser-compat-data/blob/main/api/SpeechRecognition.json). Actual microphone/language accuracy and native-device behavior remain unqualified; tests simulate recognition without listening to the user.

## Costs and verification

There is no Sylf transcription-provider charge. Browser processing can require network access; private image storage/bandwidth uses the existing Supabase plan. No new paid transcription provider was added. Provider-reported prompt tokens include image input; the existing dispatch meter retains reported output, reasoning/cache subsets, unknown spend on interrupted streams and conservative cost estimates.

For illustration, the documented ceiling of 1024 input tokens per image costs at most **$0.0003072** in uncached image input at the configured $0.30/million peak rate, before text/history and output. Off-peak input is cheaper. This is an estimate, not measured billing; actual provider usage is authoritative and the existing estimator deliberately uses conservative peak rates. [Published pricing](https://api-docs.deepseek.com/quick_start/pricing/).

The selected final suite passed **702 tests**, skipped two opt-in hosted tests and retained **14 pre-existing failures** in three unrelated Planner API/capacity/quota files. Failure titles match the Phase 2 baseline. Tests cover real image decoding, limits, private references/ownership, native provider payloads and usage, explicit model fallback, irrelevant-turn exclusion, Planner review guards, editable dictation, permissions, timeouts, cancellation and conversation replacement. TypeScript, production build, mobile build and mobile boundary verification are recorded in [checks](evidence/checks.json), alongside lint baseline comparisons.

Actual components were inspected in 24 desktop/mobile appearance cases and four 320px cases with four attachments, including simulated local/remote speech. Additional browser checks cover delivery/reuse, failure feedback, unsupported APIs, new conversations and immediate popup microphone release. Production HTTP checks use an explicitly empty cookie header to verify image denial and microphone policy. All fixture content is synthetic.

Hosted Storage was qualified with one temporary synthetic image: backend upload/download and short-lived access succeeded; anonymous and authenticated clients could not list, download, upload or sign objects. Test objects were removed. [Migration](evidence/migration.json) and [hosted evidence](evidence/hosted-storage.json). No live model answer, real microphone accuracy, hosted proxy limit or deployed release is certified. No paid diagnostic call was made. [Evidence and reproduction](evidence/README.md).
