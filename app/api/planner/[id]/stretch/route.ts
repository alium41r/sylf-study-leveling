import { plannerRoute, readBody } from "@/lib/planner/server/http";
import { promoteStretch } from "@/lib/planner/server/stretch";
import { PlannerError } from "@/lib/planner/errors";

export const dynamic = "force-dynamic";

/**
 * POST /api/planner/[id]/stretch — "Add this stretch work".
 *
 * The explicit, capacity-checked promotion of one or more STRETCH items the reviewed
 * plan already contains. No provider call, no quota, no plan change: it materializes
 * execution the student just asked for.
 */
export function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return plannerRoute(req, async (userId) => {
    const { id } = await ctx.params;
    const body = await readBody(req);
    if (!body || typeof body !== "object")
      throw new PlannerError(400, "INVALID_REQUEST");
    return promoteStretch(userId, id, body);
  });
}
