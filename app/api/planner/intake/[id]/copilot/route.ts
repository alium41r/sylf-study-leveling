import { plannerRoute, readBody } from "@/lib/planner/server/http";
import { runCopilotTurn } from "@/lib/planner/copilot/run";
import { PlannerError } from "@/lib/planner/errors";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/planner/intake/[id]/copilot — one Copilot turn.
 *
 * Authenticated, owner-scoped, private/no-store, and bounded: one interpretation pass with
 * an optional wording pass, at most five commands, and never a database write unless the
 * student's own command is one this surface may execute directly.
 *
 * The recent turns travel with the request and are truncated here; nothing about the
 * conversation is stored, because the Plan Brief is the only planner state that matters.
 */
export function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return plannerRoute(req, async (userId) => {
    const { id } = await ctx.params;
    const body = (await readBody(req)) as { recent?: { role: "STUDENT" | "SYLF"; text: string }[] } | null;
    if (!body || typeof body !== "object") throw new PlannerError(400, "INVALID_REQUEST");
    const outcome = await runCopilotTurn({
      userId,
      sessionId: id,
      raw: body,
      recent: Array.isArray(body.recent) ? body.recent.slice(-8) : [],
      signal: req.signal,
    });
    return {
      schemaVersion: 1,
      ...outcome.result,
      view: outcome.view,
      metrics: outcome.metrics,
    };
  });
}
