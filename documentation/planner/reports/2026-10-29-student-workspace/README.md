# Original Phase 3 — Student Planner Workspace

29 October 2026. Implements the user's decision to defer formal Phase C and provide a real student interface for the existing AI-first backend. **No paid calls, deployment, production configuration changes or migration deployment.** Live educational qualification remains unproven; the failed C01 evidence is unchanged.

## Implemented

- Canonical `/planner` and `/planner/[planId]` routes on web/mobile, linked from System → Planner, using Sylf's shared appearance and mobile-safe transport. Existing Classic/Modes and compiler-v1 admission remain available.
- Free accepted-goal setup and durable student feedback; optional separately authorized existing assistant advice; accepted-details editing and private PDF/text material selection.
- Trusted compiler-v2 complete-journey admission, finite quality-first role allowances, explicit consent and same-host worker readiness. A browser cannot forge resource policies, compiler identity or provider routing.
- Durable progress, cancellation, exact clarification/continuation, linked historical drafts, full natural strategy versions, structured activity/criteria/dependency inspection, independent review decisions/issues and immutable history.
- Complete or honestly incomplete draft display. Approval is required only to create executable approved work; no formal benchmark hides development previews. Active work remains protected while a draft update is prepared.
- Separate human-readable candidate review and exact atomic confirmation with required acknowledgements and existing currentness/protection checks.
- Research protocol v3 fixes selected-plan identity boundaries. One complete, settled invalid verification can receive a metered correction without accepting foreign references. Historical v2/absent-marker recovery stays pinned.
- Root usage/cost uncertainty remains explicit. Server admission rejects a fresh preview over running work or preceding uncertain spending; linked continuation preserves the original root and deadline. Lost browser acknowledgements retain identical mutation identities.

The current interface/API contract and local activation instructions are in [Student workspace](../../STUDENT_WORKSPACE.md). This task adds no database schema or parallel agent/scheduling infrastructure.

## Verification

Final verification is recorded in [the verification manifest](evidence/verification.json). Intermediate receipts are retained separately.

- The first focused PostgreSQL service run passed **218 V2 + 225 legacy** checks. Its outer source-integrity receipt correctly failed because five in-progress workspace/test files changed during that run. It is not the final frozen-source qualification.
- The pre-navigation frozen PostgreSQL run passed **400 V2 + 225 legacy = 625 checks**, with unchanged captured sources. The final public-HTTP smoke/regression run and expanded unit bank are recorded in the manifest. Node 24 route generation, worker/web builds, post-build typecheck and mobile build/bundle verification pass. Browser evidence covers 390×844, 1280×900 and 1440×980, including light/dark modes and custom surfaces.
- The PostgreSQL smoke uses actual public workspace admission/read routes, ownership, services, SQL, receipts, the supervised worker, Research, natural strategy, translation, allocation, independent review, reviewed publication and Apply. Scripted providers are explicit; no API credits are used.
- Browser checks render the actual workspace/editor and shared appearance code with an isolated scripted HTTP fixture. They validate interface behavior, not real-model output or a connected production account. The disposable PostgreSQL checks independently exercise persistence/execution.

## Changes and preservation

Implementation owners: `app/components/planner/student/`, existing `PlannerTab`, `/api/planner/workspace` and capabilities; existing `AssistantService`, `GenerationService`, `ResearchUnderstanding` and worker readiness; `lib/planner/v2/client/` DTO/transport; versioned Understanding schema. Tests cover UI, auth/activation, resource consent, exact rest-day mapping, Research namespaces/recovery, real ownership, free-note replay/CAS, complete/incomplete draft projection, linked continuation and atomic confirmation.

Retained Classic/Modes tests had pre-existing button selectors and a default-state assertion that did not reflect the already implemented Sylvie handoff. These were corrected to the actual baseline behavior while retaining navigation, capabilities and telemetry assertions. A new auth dependency introduced into Classic during development was removed; the gated student entry alone consumes the existing AuthProvider.

The retained Research fixture expectation changes from fresh capture marker 2 to **3**. This reflects new admission only; original saved-marker prompt/packet byte checks and old readers remain active. No execution assertion or provider deadline was weakened. The source preservation manifest compares this task against its own 6,023-file starting snapshot, including pre-existing uncommitted work.

## Remaining limits

- No successful real-model end-to-end generation is claimed. Actual educational correctness, translation semantics and reviewer accuracy need the user's manual testing or a separately authorized future qualification.
- Activation is explicit and default-off. Manual use requires compatible migrated local infrastructure, configured provider/private document storage, account entitlement, and the existing worker. No production environment was activated.
- The UI creates one selected goal at a time; the existing backend's joint planning and its immutable history are preserved. Study windows/assessment detail editing is available progressively; there is no separate Calendar editor or automatic permission expansion.
- Operational/context/storage/transport ceilings remain finite and visible. Extremely large views can return explicit overflow. The convenient history selector lists 100 recent attempts; older retained records are not deleted.
- Interval witnesses establish mathematical availability rather than new appointments. Calendar/provider outages and stale/missing coverage can still require a student decision instead of fabricated capacity.
- The preview resource policy quotes token/call/deadline limits, not a dollar spending cap. Actual/unknown costs remain in the existing ledger; optional advice is accounted separately.

## Development verification interruptions

Two earlier PostgreSQL service runs passed their checks but their outer source-pin audits correctly failed while implementation files were still being edited. These receipts are retained; the later frozen run is authoritative. The task-local Node 24/PostgreSQL runtimes and build directories were subsequently removed from the environment. A navigation typecheck fell back to host Node 26 and exhausted its default heap; it is not qualified. Node 24.21.0 was restored from the official archive with its SHA-256 checksum verified, and PostgreSQL 18.4 from the prior embedded distribution with SHA-512 integrity checked. Only bundled-library aliases inside the temporary package were restored. The final route/typecheck/build/native regression runs use those explicit runtimes. No host installation changed.

The source preservation audit observed an unrelated `render-diagnostics.json` update timestamped before this task's first test command. It is retained, not reset. New navigation edits add only the canonical Planner route classifications/links to the already modified shared shell and existing mobile route outlet. Existing notes, providers, database schema, migrations and historical C01 evidence are not rewritten.

## Final measured result

| Gate | Result |
| --- | --- |
| Genuine PostgreSQL, including public workspace route/worker/Apply smoke | **401 V2 + 225 legacy = 626 passed**, zero failures or required skips; final captured sources unchanged |
| Retained PostgreSQL cases | **All 619 previously required cases retained**; seven new workspace cases |
| Units and web/mobile navigation | **476 passed**, zero failures/skips; all prior 470 case identities retained |
| Node 24.21.0 | Route type generation, worker build, Next 16 Webpack production build, post-build typecheck, mobile build and bundle verification pass |
| Scoped lint | Zero errors/new warnings; two retained unused settings imports in the existing mobile outlet remain warnings |
| Browser | Eight rendered states at desktop/phone sizes; standard and custom light/dark surfaces; no horizontal overflow; consent, clarification, draft inspection, separate confirmation, cancellation and identical-request recovery pass |
| Spending and rollout | **Zero paid provider calls**; no production config/route cutover, hosted migrations or deployment |

The public-route smoke calls actual production Request/Response handlers, then the existing worker/compiler, real disposable SQL/receipts and atomic confirmation. Identity resolution, worker-health transport and model responses are explicit fixtures. Browser UI tests use a separate scripted HTTP fixture. Neither test claims a live connected-account or real-model journey.

See [completion audit](COMPLETION_AUDIT.md), [verification](evidence/verification.json), [retention](evidence/retention.json), [final native run](evidence/postgres-http-final/postgres-harness-run.json), [final build](evidence/navigation-build/results.json), [browser results](evidence/browser-navigation-final.json) and [source preservation](evidence/source-preservation.json). The prior full baseline comparison remains separately preserved; its temporary input snapshot was removed externally, so later scoped patches are not misrepresented as another complete baseline comparison.

Scoped diff/reference checks pass. A full working-tree diff check additionally reports trailing whitespace in the already modified, unrelated Notes license notice. It remains untouched; see [the retained global diagnostic](evidence/static-global-retained.json). This is outside the Planner verification scope and does not prevent its builds or tests.
