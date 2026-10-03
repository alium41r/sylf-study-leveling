"use client";
import type { RetrievalPurpose } from "./retrieval";

/**
 * The short, restrained retrieval hint an item may carry ("Recall",
 * "Reinforcement"). It is a display label only: the stamp itself is planner
 * metadata and never changes how the item executes.
 */
export const RETRIEVAL_PURPOSE_HINT: Record<RetrievalPurpose, string> = {
  RECALL: "Recall",
  REINFORCEMENT: "Reinforcement",
  PRACTICE: "Practice",
  MISTAKE_REVIEW: "Mistake review",
};

/** The hint for an item that carries a retrieval stamp, or null for a plain item. */
export function retrievalHint(item: {
  retrievalPurpose?: RetrievalPurpose | null;
}): string | null {
  const purpose = item.retrievalPurpose;
  if (!purpose) return null;
  return RETRIEVAL_PURPOSE_HINT[purpose] ?? null;
}
