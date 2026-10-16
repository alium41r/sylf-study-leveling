# Phase 3 verification evidence

All images, prompts and speech events are synthetic. Recognition fixtures never access a microphone or speech service. Provider tests use mocks. The separate hosted Storage check uses one temporary synthetic image and removes its canaries; production HTTP checks clear cookies and do not invoke providers.

| Evidence | Coverage |
| --- | --- |
| [checks.json](checks.json) | Test/build/type/lint outcomes and qualifications. |
| [visual-checks.json](visual-checks.json) | Four actual surfaces × desktop/mobile × dark/light/custom light appearances. |
| [narrow-checks.json](narrow-checks.json) | 320px custom-dark layouts, four images and simulated service-based dictation. |
| [browser-interactions.json](browser-interactions.json) | Image delivery/reuse, editable drafts, cancellation, unsupported browsers and failed uploads. |
| [production-http.json](production-http.json) | Actual production microphone policy and unauthorized new/legacy image access. |
| [migration.json](migration.json) | Sole pending Storage migration applied; 65 migrations current, telemetry unchanged. |
| [hosted-storage.json](hosted-storage.json) | Real private-bucket upload, signing, client isolation and cleanup. |
| [verify-storage.mjs](verify-storage.mjs) | Explicitly invoked hosted qualification script; no AI calls. |
| [lint-baseline.json](lint-baseline.json) | Older touched files compared against this phase’s starting source. |
| [fixture-source.txt](fixture-source.txt) | Reproduction source for the isolated visual fixture. |
| `*.png` | Actual renders plus synthetic mathematical image inputs. |

Reproduce offline feature checks:

```sh
npm run test -- --run --maxWorkers=2 __tests__/ai/image-pipeline.test.ts __tests__/system/chat-multimodal.test.tsx __tests__/ai/e2e-conversation.test.ts __tests__/system/chat-interactions.test.tsx __tests__/ai/dispatch-telemetry.test.ts __tests__/ai/provider-streaming.test.ts __tests__/ai/chat-streaming.test.ts __tests__/planner/quick-plan.test.tsx __tests__/planner/designer.test.ts __tests__/planner/copilot-contract.test.ts
npx next typegen
npx tsc --noEmit
npx next build --webpack
npm run mobile:build
npm run mobile:verify
```

The broader suite’s full selection and known failures are recorded in checks.json. Hosted database/provider tests remain opt-in. Visual fixtures are recreated under `scratch/chat-ui-phase3/`, run on port 4311, and accept `surface=main|popup|focus|planner`, `mode=light|dark`, and `custom`, `voice`, `remote`, `unsupported`, `slow` or `error` flags. `voice` installs a synthetic recognizer. Use the included mathematical images as file inputs.

For visual reproduction, copy `fixture-equation.png` and `fixture-diagram.png` into the fixture’s `public/fixtures/` directory as `equation.png` and `diagram.png`; duplicate them as `image-3.png` and `image-4.png` for four-image layout checks. Hosted Storage qualification is separate from the offline commands and creates only temporary synthetic objects.
