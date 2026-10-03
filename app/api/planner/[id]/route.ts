import { plannerRoute, readBody } from "@/lib/planner/server/http";
import { getPlanDetail } from "@/lib/planner/server/revisions";
import { durablePlanner, isDurablePlannerRequest, requireDurablePlannerAdmission } from "@/lib/planner/v2/server/web";
import { CanonicalIntentV2Schema, PLANNER_V2_ENVELOPE, DurableIdV2Schema } from "@/lib/planner/v2/contracts";
import { z } from "zod";
export const dynamic = "force-dynamic";
export function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return plannerRoute(req, async userId => {
    const id = (await ctx.params).id;
    if (isDurablePlannerRequest(req)) {
      return durablePlanner().workspace.read(userId, DurableIdV2Schema.parse(id));
    }
    return getPlanDetail(userId, id);
  });
}

export function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return plannerRoute(req, async userId => {
    requireDurablePlannerAdmission();
    const body = z.strictObject({ schemaVersion: z.literal(2), expectedPlanningVersion: z.number().int().nonnegative(),
      expectedIntentVersionId: DurableIdV2Schema, intent: CanonicalIntentV2Schema }).parse(await readBody(req, PLANNER_V2_ENVELOPE.serializedBytes));
    return durablePlanner().intents.edit(userId, DurableIdV2Schema.parse((await ctx.params).id), body.expectedPlanningVersion, body.expectedIntentVersionId, body.intent);
  });
}
