// ============================================================
// Deterministic Responder — app-data intents (DB-backed)
// ============================================================
// Detection is now intent-based (lib/ai/intents/matcher): the same
// normalized message resolves to the same intent regardless of
// wording, and every executor lives in lib/ai/intents/executors.
// This module keeps the public `matchDeterministic` API stable.
// ============================================================

import { matchIntent } from "./intents/matcher";
import { EXECUTORS } from "./intents/executors";
import { IntentParams } from "./intents/registry";

export interface DeterministicReply {
  content: string;
  /** Intent id — surfaced in server logs for measurement. */
  reason: string;
  intentId: string;
  params: IntentParams;
  confidence: number;
}

/**
 * Resolve an app-data question to a deterministic intent + executor.
 * Returns null when the intent is not confidently matched — the caller
 * falls back to the LLM. Never throws.
 */
export async function matchDeterministic(
  userId: number,
  rawMessage: string
): Promise<DeterministicReply | null> {
  const match = matchIntent(rawMessage);
  if (!match) return null;

  const executor = EXECUTORS[match.intent.id];
  if (!executor) return null;

  try {
    const content = await executor(userId, match.params);
    if (content === null || content === undefined || !String(content).trim()) {
      return null;
    }
    return {
      content,
      reason: match.intent.id,
      intentId: match.intent.id,
      params: match.params,
      confidence: match.confidence,
    };
  } catch (e) {
    console.error(`[Deterministic] executor '${match.intent.id}' failed — escalating to LLM:`, e);
    return null;
  }
}
