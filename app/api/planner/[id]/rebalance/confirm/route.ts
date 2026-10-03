import { plannerRoute, readBody } from "@/lib/planner/server/http";
import { confirmRebalance } from "@/lib/planner/server/rebalance";
export const dynamic = "force-dynamic";

/**
 * Atomic reconciliation of one approved replan.
 *
 * Every protected-execution check, the capacity re-validation, the tombstoning of
 * superseded work, the replacement Quests, lineage and the receipt happen in one
 * transaction: reality changing underneath returns a conflict, never a partial
 * replan.
 */
export function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return plannerRoute(req, async (userId) => {
    const { id } = await ctx.params;
    return confirmRebalance(userId, id, await readBody(req));
  });
}
