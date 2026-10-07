import { plannerRoute, readBody } from "@/lib/planner/server/http";
import { generationResponse } from "@/lib/planner/server/generation";
import { durablePlanner, isDurablePlannerRequest, requireDurablePlannerAdmission } from "@/lib/planner/v2/server/web";
import { PLANNER_V2_ENVELOPE } from "@/lib/planner/v2/contracts";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
export function POST(req: Request) {
  const started = Date.now();
  return plannerRoute(req, async userId => {
    if(isDurablePlannerRequest(req)){
      requireDurablePlannerAdmission();
      const result=await durablePlanner().generation.accept(userId,await readBody(req,PLANNER_V2_ENVELOPE.serializedBytes),req.signal);
      return Response.json({schemaVersion:2,...result},{status:result.replayed?200:202,headers:{"Cache-Control":"private, no-store",
        Location:`/api/planner/${result.attempt.targets[0].planId}/operations/${result.attempt.attemptId}?contractVersion=2`}});
    }
    return generationResponse(userId,await readBody(req),req.signal,started);
  });
}
