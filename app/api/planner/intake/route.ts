import { plannerRoute, readBody } from "@/lib/planner/server/http";
import { createIntake } from "@/lib/planner/server/intake";
import { PlannerError } from "@/lib/planner/errors";

export const dynamic = "force-dynamic";

/**
 * POST /api/planner/intake — create or resume the intake session for a client key.
 *
 * Idempotent by `(user, clientKey)`: a retry after a lost response returns the same
 * session rather than starting a second brief.
 */
export function POST(req: Request) {
  return plannerRoute(req, async (userId) => {
    const body = await readBody(req);
    if (!body || typeof body !== "object") throw new PlannerError(400, "INVALID_REQUEST");
    return createIntake(userId, body);
  });
}
