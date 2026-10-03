import { plannerRoute, readBody } from "@/lib/planner/server/http";
import { expansionResponse } from "@/lib/planner/server/expansion";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * One explicit selected-period expansion of a confirmed Course Roadmap.
 * Owner-scoped, cookie-authenticated, private/no-store, and recoverable by
 * operation key through the owned operation endpoint.
 */
export function POST(
  req: Request,
  ctx: { params: Promise<{ id: string; itemKey: string }> }
) {
  const started = Date.now();
  return plannerRoute(req, async (userId) => {
    const { id, itemKey } = await ctx.params;
    return expansionResponse(userId, id, itemKey, await readBody(req), req.signal, started);
  });
}
