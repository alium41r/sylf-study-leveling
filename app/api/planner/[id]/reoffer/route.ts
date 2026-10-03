import { plannerRoute, readBody } from "@/lib/planner/server/http";
import { acceptReoffer, declineReoffer, reofferOffers } from "@/lib/planner/server/reoffer";
import { PlannerError } from "@/lib/planner/errors";

export const dynamic = "force-dynamic";

/**
 * GET /api/planner/[id]/reoffer — work the student released that Sylf still thinks is worth
 * offering back.
 *
 * A read, deliberately. The offer is derived from what the plan is missing right now, so
 * showing it changes nothing and reloading the page shows the same thing. Only the *answer*
 * is durable.
 */
export function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return plannerRoute(req, async (userId) => {
    const { id } = await ctx.params;
    return { offers: await reofferOffers(userId, id) };
  });
}

/**
 * POST /api/planner/[id]/reoffer — the student's answer.
 *
 * `accept` materialises the replacement as ordinary executable work, through the same door
 * stretch promotion uses: no provider call, no quota, no change to the reviewed revision.
 * `decline` records one closed state on the tombstone and stops Sylf asking again.
 */
export function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return plannerRoute(req, async (userId) => {
    const { id } = await ctx.params;
    const body = await readBody(req);
    if (!body || typeof body !== "object") throw new PlannerError(400, "INVALID_REQUEST");
    const action = (body as { action?: unknown }).action;
    if (action === "accept") return { accepted: await acceptReoffer(userId, id, body) };
    if (action === "decline") return { declined: await declineReoffer(userId, id, body) };
    throw new PlannerError(400, "INVALID_REQUEST");
  });
}
