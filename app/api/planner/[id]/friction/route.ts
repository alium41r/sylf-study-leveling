import { plannerRoute, readBody } from "@/lib/planner/server/http";
import { recordFriction } from "@/lib/planner/server/friction";
import { PlannerError } from "@/lib/planner/errors";

export const dynamic = "force-dynamic";

/**
 * POST /api/planner/[id]/friction — optional, side-effect-free friction feedback.
 *
 * Records one closed reason against a draft item. No provider call, no quota, no
 * Quest or revision change: it only writes the single feedback row.
 */
export function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return plannerRoute(req, async (userId) => {
    const { id } = await ctx.params;
    const body = await readBody(req);
    if (!body || typeof body !== "object")
      throw new PlannerError(400, "INVALID_REQUEST");
    return recordFriction(userId, id, body);
  });
}
