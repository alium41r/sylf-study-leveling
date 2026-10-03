import { plannerRoute, readBody } from "@/lib/planner/server/http";
import { applyIntakeAction } from "@/lib/planner/server/intake";
import { PlannerError } from "@/lib/planner/errors";

export const dynamic = "force-dynamic";

/**
 * POST /api/planner/intake/[id]/action — one typed, server-validated action.
 *
 * Actions the planner does not support yet answer 422 NOT_AVAILABLE rather than
 * silently doing nothing, and `requestGeneration` returns the normalized engine
 * input plus a stable request key: the existing generate route still owns quota,
 * the operation lifecycle, streaming and recovery.
 */
export function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return plannerRoute(req, async (userId) => {
    const { id } = await ctx.params;
    const body = await readBody(req);
    if (!body || typeof body !== "object") throw new PlannerError(400, "INVALID_REQUEST");
    return applyIntakeAction(userId, id, body);
  });
}
