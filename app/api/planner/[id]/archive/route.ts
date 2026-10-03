import { ArchiveSchema, boundedParse } from "@/lib/planner/contracts";
import { plannerRoute, readBody } from "@/lib/planner/server/http";
import { archivePlan } from "@/lib/planner/server/revisions";
import { durablePlanner, isDurablePlannerRequest, requireDurablePlannerAdmission } from "@/lib/planner/v2/server/web";
import { PLANNER_V2_ENVELOPE, DurableIdV2Schema } from "@/lib/planner/v2/contracts";
import { z } from "zod";
export function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return plannerRoute(req, async userId => {
    const id = (await ctx.params).id;
    if (!isDurablePlannerRequest(req)) return archivePlan(userId, id, boundedParse(ArchiveSchema, await readBody(req)).expectedVersion);
    requireDurablePlannerAdmission();
    const body = z.strictObject({ schemaVersion: z.literal(2), expectedPlanningVersion: z.number().int().nonnegative() })
      .parse(await readBody(req, PLANNER_V2_ENVELOPE.serializedBytes));
    return durablePlanner().intents.archive(userId, DurableIdV2Schema.parse(id), body.expectedPlanningVersion);
  });
}
