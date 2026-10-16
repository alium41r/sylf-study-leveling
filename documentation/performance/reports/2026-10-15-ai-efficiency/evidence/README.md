# Implementation evidence

All conversations/tasks in these fixtures are synthetic. No paid provider execution, production mutation, conversation export or live database migration was performed.

| File | Meaning |
| --- | --- |
| [checks.json](checks.json) | Final test/build/type/lint results, baseline failure names and verification blockers. |
| [offline-measurements.json](offline-measurements.json) | Exact synthetic tool-result character sizes and configured budgets. Character/4 figures are proxies, not model tokens. |
| [measure-offline.cjs](measure-offline.cjs) | Local fixture measurement; loads source with TypeScript transpilation and never invokes a provider. |
| [model-availability.json](model-availability.json) | Free authenticated model-list GET outcomes; no generation. DeepSeek unavailable, Gemini/Groq metadata listed. |
| [verify-models.mjs](verify-models.mjs) | Metadata-only check; reads local credentials without printing them. Requires network access. |
| [chat-ui-checks.json](chat-ui-checks.json), `chat-*.png` | Actual active ConversationPanel rendered with mock auth/API, synthetic messages and existing palette generators at desktop/mobile sizes. Six layout smoke checks; no full app interaction claim. |
| [capture-chat.mjs](capture-chat.mjs) | Isolated temporary Chrome profiles and CDP screenshots. Requires a local synthetic fixture server at port 4310; no user browser profile or live API. |
| [chat-fixture-source.txt](chat-fixture-source.txt) | Fixture source snapshot, including mock auth/navigation and the existing palette generators. Recreate under `scratch/ai-efficiency-ui/` to reproduce captures. |

Run from the repository root:

```sh
node documentation/performance/reports/2026-10-15-ai-efficiency/evidence/measure-offline.cjs
npm run test -- --run __tests__/ai/dispatch-telemetry.test.ts __tests__/ai/tool-context-budget.test.ts __tests__/ai/classic-efficiency.test.ts __tests__/ai/cost-summary.test.ts __tests__/ai/transport-cancellation.test.ts __tests__/ai/provider-contract.test.ts __tests__/ai/daily-briefing.test.ts __tests__/ai/model-migration.test.ts __tests__/planner/exam-provider-options.test.ts __tests__/planner-v2/intelligence/provider.test.ts
npm run test -- --run __tests__/ai __tests__/planner __tests__/planner-v2
npx tsc --noEmit
npx prisma generate
npx next build --webpack
npm run mobile:build
npm run mobile:verify
```

The broader run has known baseline failures; see checks.json rather than interpreting a nonzero exit as a new regression. PostgreSQL checks require a working Docker daemon. No raw application/provider logs are copied into this evidence directory. Phase 1's aggregate/billing estimates remain in their original evidence directory and are not relabeled as post-change measurements.
