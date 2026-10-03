import { plannerRoute, readBody } from "@/lib/planner/server/http";
import {
  activePreferencesForPlan,
  ignorePreference,
  resetPreference,
} from "@/lib/planner/server/preferences";
import { PlannerError } from "@/lib/planner/errors";

export const dynamic = "force-dynamic";

/**
 * GET  /api/planner/[id]/preferences — the active planning preferences for a plan.
 * POST /api/planner/[id]/preferences — { action: "IGNORE" | "RESET", ... }.
 *
 * Reads and writes are plan-scoped and side-effect free; nothing here starts a
 * provider call or a replan.
 */
export function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return plannerRoute(req, async (userId) =>
    activePreferencesForPlan(userId, (await ctx.params).id)
  );
}

export function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return plannerRoute(req, async (userId) => {
    const { id } = await ctx.params;
    const body = await readBody(req);
    if (!body || typeof body !== "object")
      throw new PlannerError(400, "INVALID_REQUEST");
    const { action, ...payload } = body as Record<string, unknown>;
    if (action === "IGNORE") return ignorePreference(userId, id, payload);
    if (action === "RESET") return resetPreference(userId, id, payload);
    throw new PlannerError(400, "INVALID_REQUEST");
  });
}
