import { plannerRoute, readBody } from "@/lib/planner/server/http";
import { patchIntake, readIntake } from "@/lib/planner/server/intake";
import { PlannerError } from "@/lib/planner/errors";

export const dynamic = "force-dynamic";

/** GET — the brief, its readiness and the server-computed distribution. */
export function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return plannerRoute(req, async (userId) => {
    const { id } = await ctx.params;
    return readIntake(userId, id);
  });
}

/**
 * PATCH — replace the brief.
 *
 * `expectedVersion` is required: a stale writer gets INTAKE_STALE with the current
 * state instead of overwriting another tab's work.
 */
export function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return plannerRoute(req, async (userId) => {
    const { id } = await ctx.params;
    const body = await readBody(req);
    if (!body || typeof body !== "object") throw new PlannerError(400, "INVALID_REQUEST");
    return patchIntake(userId, id, body);
  });
}
