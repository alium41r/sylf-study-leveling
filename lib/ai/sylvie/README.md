# Sylvie runtime

`persona.md`, `knowledge.md` and `capabilities.md` are runtime instructions, read once per server process by [prompts.ts](../prompts.ts). All chat providers and workloads receive the same components. Restart/redeploy after editing them. Next's route trace explicitly includes the three files; none enters the mobile/client bundle. This README and the full knowledge index are not model context.

The chat route assembles a local date, a validated page hint, bounded conversation history and only matching public Archive excerpts. Personal reads use turn-specific tools rather than unconditional profile/progression/goal/memory loading. Retrieved content is delimited reference data. Existing provider routing, entitlements, quota accounting and attachments remain shared owners.

`knowledge.ts` maps the existing Archive catalog to topics/pages and bounds retrieval to two entries. Maintain the catalog as the content owner; update index terms when navigation changes. General conversations bypass Archive. App overview questions receive only a small overview. Missing sources do not authorize invented features.

`planner-bridge.ts` formulates a request from user statements and preserves relevant conversation. “Review in Planner” hands it to the existing draft assistant after user review; no chat-side plan generation or unfinished V2 dependency is introduced. The Planner owns the next confirmation/apply steps.

Mutation tools are staged as exact, signed proposals bound to the authenticated user, session and originating assistant message. Confirmation executes the stored arguments without another model call; a consumed or expired proposal cannot be replayed. Public page hints and model/tool outputs cannot bypass this gate.

Regression tests live in `__tests__/ai/sylvie-*`. Mocked provider tests verify assembly, permissions, retrieval and integration; they do not certify live model wording or latency. See [the current contract](../../../documentation/sylvie/README.md) for verification and limitations.
