import { plannerRoute, readBody } from "@/lib/planner/server/http";
import { applyCopilotProposal } from "@/lib/planner/copilot/run";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/planner/intake/[id]/copilot/apply — confirm one Copilot proposal.
 *
 * The body carries the signed proposal token, never a command list: the commands are inside
 * the signature, so a client cannot rewrite what it is confirming. Signature, session,
 * expiry and the intake version are all verified before anything happens, and the result is
 * either an applied brief, a routed capability, or a closed refusal.
 */
export function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return plannerRoute(req, async (userId) => {
    const { id } = await ctx.params;
    const outcome = await applyCopilotProposal({
      userId,
      sessionId: id,
      raw: await readBody(req),
      signal: req.signal,
    });
    return { schemaVersion: 1, ...outcome };
  });
}
