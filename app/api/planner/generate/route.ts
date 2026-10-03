import { plannerRoute, readBody } from "@/lib/planner/server/http";
import { generationResponse } from "@/lib/planner/server/generation";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
export function POST(req: Request) {
  const started = Date.now();
  return plannerRoute(req, async (userId) =>
    generationResponse(userId, await readBody(req), req.signal, started)
  );
}
