import { readPlannerChatTurn } from "@/lib/planner/copilot/image-input";
import { ChatImageError } from "@/lib/ai/sylvie/images-server";
import { plannerRoute } from "@/lib/planner/server/http";
import { runDesignerTurn } from "@/lib/planner/designer/run";
import { PlannerError } from "@/lib/planner/errors";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/planner/intake/[id]/designer — one Plan Designer turn.
 *
 * The pre-generation sibling of the Copilot's turn endpoint, and deliberately the same shape:
 * authenticated, owner-scoped, private/no-store, one interpretation pass with an optional
 * wording pass, at most five commands, and never a database write unless the student's own
 * command is one the intake service may apply directly.
 *
 * The recent turns travel with the request and are validated against the schema's own bound;
 * nothing about the conversation is stored, because the Plan Brief is the only planner state
 * that matters. Confirming a Designer proposal goes through the *existing* Copilot apply
 * endpoint — a setup proposal is an ordinary signed proposal carrying ordinary commands, so it
 * needs no second apply path and gets no second security surface.
 */
export function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return plannerRoute(req, async (userId) => {
    const { id } = await ctx.params;
    let parsed;
    try { parsed = await readPlannerChatTurn(req); }
    catch (error) {
      if (error instanceof ChatImageError) return Response.json({ error: { code: "INVALID_IMAGE", message: error.message } }, { status: error.status, headers: { "Cache-Control": "private, no-store" } });
      throw error;
    }
    const body = parsed.body as { recent?: { role: "STUDENT" | "SYLF"; text: string }[] } | null;
    if (!body || typeof body !== "object") throw new PlannerError(400, "INVALID_REQUEST");
    const outcome = await runDesignerTurn({
      userId,
      sessionId: id,
      raw: body,
      images: parsed.images,
      recent: Array.isArray(body.recent) ? body.recent.slice(-8) : [],
      signal: req.signal,
    });
    return {
      schemaVersion: 1,
      ...outcome.result,
      /**
       * The server's own read of the setup, the mode suggestion and the advisory guidance
       * travel beside the result rather than inside it: the panel needs all three whatever the
       * outcome was, and a frontend should never have to derive them from prose.
       */
      designer: {
        summary: outcome.summary,
        mode: outcome.mode,
        guidance: outcome.guidance,
        unresolved: outcome.unresolved,
        question: outcome.question,
      },
      view: outcome.view,
      metrics: outcome.metrics,
    };
  });
}
