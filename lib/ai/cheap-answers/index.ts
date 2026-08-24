// ============================================================
// Cheap-Answer Engine — the zero-token intelligence layer
// ============================================================
// A pluggable registry of pure-function handlers that answers easy,
// low-reasoning questions from every genre BEFORE the LLM is ever
// called (and before quota is charged).
//
// GENRES COVERED (v1):
//   • arithmetic          "whats 2+2" / "calculate 12/4" / "2^10"
//   • percentages         "what is 15% of 240"
//   • comparisons         "which is bigger, 5 or 3"
//   • unit conversion     "convert 5 km to miles", "how many cm in 2 m",
//                         temperature °C ↔ °F (fixed factors/formulas only)
//   • curated constants   "what is pi", "how many days in a week"
//   • text counting       "how many words in ..."
//   • date/time           "whats the date", "how many days until 2026-12-25"
//   • app stats/identity  (delegates to the DB-backed deterministic responder)
//
// ESCALATION RULES (the accuracy boundary — answers MUST be correct):
//   • Anything ambiguous, currency/volatile rates, definitions, history,
//     people, or a date we can't parse exactly → return null → LLM.
//   • Invalid or malformed inputs → null → LLM. Never guess.
//
// EXTENSIBILITY: add a handler = add one entry below + a pure function
// file. Handlers are ordered (specific → general) and run synchronously
// except date/time (needs the user's timezone).
// ============================================================

import { tryMathQuestion } from "./math";
import { tryPercentage, tryComparison, tryTextCount } from "./calculators";
import { tryUnitConversion } from "./units";
import { tryFact } from "./facts";
import { tryDateTime } from "./datetime";
import { matchDeterministic } from "../deterministic-responder";
import { resolveContinuation, LastCheapContext } from "../intents/continuation";
import { EXECUTORS } from "../intents/executors";
import { IntentParams } from "../intents/registry";

export interface CheapAnswer {
  content: string;
  /** Handler / intent id — surfaced in server logs for measurement. */
  reason: string;
  intentId: string;
  params: IntentParams;
  confidence: number;
}

interface SyncHandler {
  id: string;
  run: (raw: string) => string | null;
}

const SYNC_HANDLERS: SyncHandler[] = [
  { id: "math", run: tryMathQuestion },
  { id: "percentage", run: tryPercentage },
  { id: "comparison", run: tryComparison },
  { id: "units", run: tryUnitConversion },
  { id: "facts", run: tryFact },
  { id: "text-count", run: tryTextCount },
];

const MAX_LENGTH = 120;

/**
 * Resolve an easy question deterministically. Returns null when the
 * question doesn't clearly belong to a covered intent — the caller then
 * proceeds with the normal (LLM) pipeline. Never consumes quota.
 *
 * `context` optionally carries the previous deterministic answer in this
 * session so short follow-ups ("what about yesterday?") can resolve too.
 */
export async function resolveCheapAnswer(
  userId: number,
  raw: string,
  context?: LastCheapContext | null
): Promise<CheapAnswer | null> {
  if (!raw || raw.trim().length > MAX_LENGTH) return null;

  for (const handler of SYNC_HANDLERS) {
    try {
      const out = handler.run(raw);
      if (out) {
        return {
          content: out,
          reason: handler.id,
          intentId: handler.id,
          params: { timeScope: null },
          confidence: 1,
        };
      }
    } catch (e) {
      // A handler bug must escalate, never crash the chat.
      console.error(`[CheapAnswers] handler '${handler.id}' failed:`, e);
    }
  }

  try {
    const dt = await tryDateTime(raw, userId);
    if (dt) {
      return {
        content: dt,
        reason: "datetime",
        intentId: "datetime",
        params: { timeScope: null },
        confidence: 1,
      };
    }
  } catch (e) {
    console.error("[CheapAnswers] datetime handler failed:", e);
  }

  const det = await matchDeterministic(userId, raw);
  if (det) {
    return {
      content: det.content,
      reason: det.reason,
      intentId: det.intentId,
      params: det.params,
      confidence: det.confidence,
    };
  }

  // Conversational follow-ups against the previous cheap answer.
  try {
    const cont = resolveContinuation(raw, context);
    if (cont) {
      const executor = EXECUTORS[cont.intentId];
      if (executor) {
        const content = await executor(userId, cont.params);
        if (content && String(content).trim()) {
          return {
            content,
            reason: cont.intentId,
            intentId: cont.intentId,
            params: cont.params,
            confidence: 0.85,
          };
        }
      }
    }
  } catch (e) {
    console.error("[CheapAnswers] continuation failed:", e);
  }

  return null;
}
