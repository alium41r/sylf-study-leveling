import { plannerRoute, readBody } from "@/lib/planner/server/http";
import { listPlans } from "@/lib/planner/server/revisions";
import { durablePlanner, requireDurablePlannerAdmission } from "@/lib/planner/v2/server/web";
import { CanonicalIntentV2Schema, PLANNER_V2_ENVELOPE } from "@/lib/planner/v2/contracts";
import { z } from "zod";
export const dynamic = "force-dynamic";
export function GET(req: Request) {
  return plannerRoute(req, userId => listPlans(userId, new URL(req.url).searchParams.get("before") ?? undefined));
}

export function POST(req: Request) {
  return plannerRoute(req, async userId => {
    requireDurablePlannerAdmission();
    const body = z.strictObject({ schemaVersion: z.literal(2), idempotencyKey: z.string().min(8).max(100), intent: CanonicalIntentV2Schema })
      .parse(await readBody(req, PLANNER_V2_ENVELOPE.serializedBytes));
    return durablePlanner().intents.create(userId, body.idempotencyKey, body.intent);
  });
}
