import { plannerRoute, readBody } from "@/lib/planner/server/http";
import { confirmDraft } from "@/lib/planner/server/materialize";
import { durablePlanner, isDurablePlannerRequest, requireDurablePlannerAdmission } from "@/lib/planner/v2/server/web";
import { DurableIdV2Schema, PLANNER_V2_ENVELOPE } from "@/lib/planner/v2/contracts";
import { reject } from "@/lib/planner/v2/server/database";
import { z } from "zod";
export function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return plannerRoute(req, async userId => {
    const id = (await ctx.params).id;
    if (!isDurablePlannerRequest(req)) return confirmDraft(userId, id, await readBody(req));
    requireDurablePlannerAdmission();
    const body = z.strictObject({ schemaVersion: z.literal(2), attemptId: DurableIdV2Schema, changeSetId: DurableIdV2Schema,
      acknowledgements: z.array(z.string().min(1).max(100)).max(60) }).parse(await readBody(req, PLANNER_V2_ENVELOPE.serializedBytes));
    const core = durablePlanner(); const attempt = await core.attempts.read(userId, body.attemptId);
    if (!attempt.targets.some(target => target.planId === id)) reject("REFERENCE_NOT_OWNED", "This confirmation does not belong to the selected plan.", "APPLY");
    return core.apply.apply(userId, body);
  });
}
