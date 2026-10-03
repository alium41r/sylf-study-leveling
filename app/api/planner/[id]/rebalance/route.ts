import { plannerRoute, readBody } from "@/lib/planner/server/http";
import { rebalanceResponse } from "@/lib/planner/server/rebalance-run";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * One explicit, user-approved replan of a confirmed plan.
 *
 * Owner-scoped, cookie-authenticated, private/no-store and recoverable by operation
 * key. It generates a proposal and seals it as a diff: no Quest changes until the
 * user confirms the reconciliation.
 */
export function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const started = Date.now();
  return plannerRoute(req, async (userId) => {
    const { id } = await ctx.params;
    return rebalanceResponse(userId, id, await readBody(req), req.signal, started);
  });
}
