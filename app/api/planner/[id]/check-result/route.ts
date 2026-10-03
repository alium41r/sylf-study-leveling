import { plannerRoute, readBody } from "@/lib/planner/server/http";
import { resetCheckResult, setCheckResult } from "@/lib/planner/server/check-result";
import { PlannerError } from "@/lib/planner/errors";

export const dynamic = "force-dynamic";

export function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return plannerRoute(req, async userId => {
    const { id } = await ctx.params;
    const body = await readBody(req);
    if (!body || typeof body !== "object") throw new PlannerError(400, "INVALID_REQUEST");
    // The action is dispatch metadata only; the service schemas are strict, so
    // strip it before delegating rather than teaching each schema to ignore it.
    const { action, ...payload } = body as Record<string, unknown>;
    if (action === "SET") return setCheckResult(userId, id, payload);
    if (action === "RESET") return resetCheckResult(userId, id, payload);
    throw new PlannerError(400, "INVALID_REQUEST");
  });
}
