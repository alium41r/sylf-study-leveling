import { z } from "zod";

/**
 * One scope unit, and the only definition of it in the tree.
 *
 * This lives in its own module because two layers need the shape and neither may
 * depend on the other: the Plan Brief (the student's confirmed setup) and the research
 * contract (a candidate awaiting confirmation). Keeping the node here means the
 * candidate schema never has to import the brief, so there is no import cycle — and,
 * more importantly, it means a candidate is built from *the same* node type the engine
 * will eventually receive, so confirmation is a copy rather than a translation.
 */

export const SCOPE_NODE_KINDS = ["SECTION", "CHAPTER", "TOPIC"] as const;

export const ScopeNodeSchema = z.strictObject({
  nodeId: z.string().min(1).max(60),
  label: z.string().trim().min(1).max(200),
  kind: z.enum(SCOPE_NODE_KINDS),
  parentId: z.string().max(60).nullable(),
  /** Selected nodes become engine units (directly, or via their chapter). */
  selected: z.boolean(),
  /**
   * Public sources that support this node, by source id.
   *
   * Optional and bounded: a researched node cites the pages it came from, a unit the
   * student typed cites nothing, and an old stored scope parses unchanged. Provenance
   * is display-only — the engine never sees it.
   */
  sourceIds: z.array(z.string().min(1).max(60)).max(4).optional(),
});
export type ScopeNode = z.infer<typeof ScopeNodeSchema>;
export const SCOPE_NODE_KINDS_SCHEMA = z.enum(SCOPE_NODE_KINDS);
