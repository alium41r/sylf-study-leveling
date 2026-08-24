// ============================================================
// Continuation Resolution — minimal conversational context
// ============================================================
// Resolves short follow-ups against the previous deterministic
// answer in the same session:
//   "what about yesterday?" → same intent, scope shifted
//   "and my xp?"            → same scope, stat switched
// Everything else (and anything without a previous cheap answer)
// falls through to the LLM. Purely functional and fully testable.
// ============================================================

import { normalizeMessage } from "../message-intent";
import { INTENTS, IntentParams, TimeScope } from "./registry";
import { matchIntent } from "./matcher";

export interface LastCheapContext {
  intentId: string;
  params: IntentParams;
}

const SCOPE_WORDS: Record<string, TimeScope> = {
  yesterday: "yesterday",
  tomorrow: "tomorrow",
  "this week": "this_week",
  "this month": "this_month",
  today: "today",
};

export function resolveContinuation(
  raw: string,
  last?: LastCheapContext | null
): { intentId: string; params: IntentParams } | null {
  if (!last) return null;

  const norm = normalizeMessage(raw);
  const m = norm.match(/^(and|what about|how about|also)\s+(.+)$/);
  if (!m) return null;
  const fragment = m[2];

  // Scope-only continuation: "what about yesterday?"
  const scope = SCOPE_WORDS[fragment];
  if (scope) {
    const intent = INTENTS.find((i) => i.id === last.intentId);
    if (intent && intent.allowedScopes.includes(scope)) {
      return { intentId: last.intentId, params: { ...last.params, timeScope: scope } };
    }
    return null;
  }

  // Stat-switch continuation: "and my level?" / "and xp?"
  const reconstructed = "my " + fragment.replace(/^my\s*/, "");
  const match = matchIntent(reconstructed);
  if (!match) return null;

  // Only continue into another stat-style intent; never invent actions.
  if (last.params.timeScope && match.intent.allowedScopes.includes(last.params.timeScope)) {
    return { intentId: match.intent.id, params: { ...match.params, timeScope: last.params.timeScope } };
  }
  return { intentId: match.intent.id, params: match.params };
}
