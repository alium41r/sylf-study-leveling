# Chat Phase 2 evidence

All conversations, subjects and proposals shown here are synthetic. Browser fetches are intercepted; no user account, database or model provider is used by the visual fixture.

| Evidence | Meaning |
| --- | --- |
| [checks.json](checks.json) | Verification results, preserved baseline failures and remaining qualifications. |
| [visual-checks.json](visual-checks.json) | Twenty-four desktop/mobile appearance and layout checks. |
| [narrow-checks.json](narrow-checks.json) | Four 320px-wide custom-dark layouts. |
| [planner-scope-checks.json](planner-scope-checks.json) | Seven final embedded Planner renders, foreground contrast and composer styles. |
| [lint-baseline.json](lint-baseline.json) | Unchanged legacy lint debt compared with this phase’s starting files. |
| [browser-interactions.json](browser-interactions.json) | First-session DOM continuity, actual incremental delivery, cancellation, switching and failure feedback. |
| [fixture-source.txt](fixture-source.txt) | Reviewable Vite fixture/auth/navigation source; recreate under `scratch/chat-ui-phase2/`. |
| `main-*.png`, `popup-*.png`, `focus-*.png`, `planner-*.png` | Actual component renders, including mobile streaming/stopped/error states and narrow custom-dark layouts. |

Reproduce local checks from the repository root:

```sh
npm run test -- --run --maxWorkers=2 __tests__/ai/chat-streaming.test.ts __tests__/ai/provider-streaming.test.ts __tests__/ai/dispatch-telemetry.test.ts __tests__/ai/transport-cancellation.test.ts __tests__/ai/provider-contract.test.ts __tests__/ai/e2e-conversation.test.ts __tests__/system/chat-interactions.test.tsx __tests__/system/conversation-panel.test.tsx __tests__/components/system-overlay.test.tsx __tests__/focus/focus-tools.test.tsx __tests__/planner/quick-plan.test.tsx __tests__/planner/sylvie-planner-delegation.test.ts __tests__/planner-v2/intelligence/provider.test.ts
npx tsc --noEmit
npx next build --webpack
npm run mobile:build
npm run mobile:verify
```

The focused command makes no paid call. The hosted telemetry test remains opt-in and was not run in this phase. The broader AI suite has documented pre-existing failures; see checks.json. Visual reproduction uses the synthetic Vite fixture at `127.0.0.1:4310`, with `surface=main|popup|focus|planner`, `mode=light|dark`, and optional `filled`, `custom`, `slow`, or `error` query flags. Slow replies deliver actual SSE chunks from the fixture rather than revealing a completed response in the component.
