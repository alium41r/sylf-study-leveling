# Long-answer truncation fix

16 October 2026. Investigated the reported production screenshot without paid AI calls or application deployment.

## Confirmed cause

The image route allowed **1,024 completion tokens**, including reasoning. Image routing takes precedence over text STEM classification, so attaching a mechanics question used this small vision allowance even though the question needed a derivation. This was a token ceiling, not a character slice in the renderer.

A read-only query of recent production dispatch metadata found a DeepSeek Flash request with `finishReason: length`, 1,024 completion tokens, **881 reasoning tokens**, and 12,549 ms transport duration. That left only 143 non-reasoning completion tokens. This is direct evidence that the production cap stopped an answer; the screenshot is consistent with it. The diagnostic deliberately did not read conversation text, user IDs or image URLs, so it does not identify the screenshot's exact message. [Metadata evidence](evidence/hosted-completions.json), [read-only query](evidence/read-completions.mjs).

The provider adapter already recognized token-limit finishes, but the chat route discarded that flag and persisted/delivered the partial answer as a normal completed reply. A separate 262,144-character SSE frame limit would also reject sufficiently long final replies because legacy-compatible fields repeat the answer.

## Changes

| Active Sylvie workload | Previous completion ceiling | New ceiling |
| --- | ---: | ---: |
| Images/diagrams | 1,024 | **32,768** |
| Complex STEM | 4,096 | **32,768** |
| General / Focus / task planning / calendar | 768 / 512 / 1,024 / 640 | 8,192 |
| Coaching / analysis | 768 / 1,024 | 16,384 |
| Lightweight actions/facts | 384 | 4,096 |

Explicit detailed requests get at least 16,384 tokens. These are completion ceilings, including reasoning where the provider counts it; they do not force long replies or bill unused tokens. The shared concise persona and deterministic short-introduction path remain. No specialized Planner generation budgets, abandoned node features or unfinished V2 behavior were changed.

- Reasoning/image attempts allow 180 seconds, replacing the 45-second image window. Ordinary attempts retain 90 seconds. All attempts share a 240-second server deadline; the client allows 245 seconds, and the chat route declares a 300-second Vercel execution allowance for persistence/telemetry headroom. The existing Stop/cancellation chain remains. [Vercel documents the route export and hosting limits](https://vercel.com/docs/functions/configuring-functions/duration); the project's dashboard setting was not accessed or modified.
- `MAX_TOKENS` now reaches the UI as an incomplete state. Its notice sits outside Markdown, so a cut-off equation/code fence cannot swallow it. The flag persists through existing hidden message metadata and is stripped from visible text/model history. No database migration is needed. Partial content can still be copied; incomplete tool responses cannot stage/apply a partial action list.
- No automatic continuation or paid retry was introduced. Users can request continuation; long assistant history retains its opening and tail within the existing 4,000-character per-message/18,000-character total context bounds.
- The SSE parser now permits bounded **2,097,152-character individual frames** and correctly accepts a network chunk containing multiple valid frames. An authoritative-result regression exceeding the old limit passes; over-limit frames still fail safely.

[DeepSeek's current model documentation](https://api-docs.deepseek.com/quick_start/pricing/) lists a much higher provider maximum than the old app cap. We retain finite app ceilings and deadlines rather than claiming unlimited output.

## Verification

- **607 tests passed**, three opt-in hosted database tests skipped, across 48 files. Includes the screenshot's mechanics wording/image path, reasoning-heavy token-limit result, persistent history flag, incomplete equation rendering, tool safety, large SSE results, context continuation, cancellation and existing provider/accounting behavior. An earlier focused five-file run passed 85 tests; these overlap.
- TypeScript, production webpack build, mobile build and mobile bundle/security verification passed. Lint comparison against current HEAD found no increased per-file rule counts. Existing lint debt remains.
- Actual shared workspace/popup/Focus components were checked in the browser at 1440×1000 and 390×844, in dark/light/custom appearance: **18 cases passed**, with the incomplete notice visible, Copy available and no horizontal overflow. Responses were synthetic; no provider or user conversation was accessed. Screenshots were visually inspected.
- Production diagnostics were read-only. No paid generation, app deployment or schema change occurred. Live completion quality/latency with the new allowance has not been certified.

## Using the fix

Commit/push through the existing Vercel deployment workflow to apply these source changes. The production site keeps its previous limits until that deployment succeeds. Existing saved answers are not rewritten or retroactively flagged. In the original chat, use **Use image again** and ask Sylvie to finish the solution, or resubmit the question after deployment. Keeping the image selected makes its visual context explicit.

There is substantially more room for long solutions, but provider/hosting/network limits still exist. If a ceiling is reached, Sylvie now reports the incomplete result honestly. No paid provider call was made to retry the user's private mechanics question during this work.
