import { plannerRoute, readBody } from "@/lib/planner/server/http";
import { appendEdit, getRevision, listRevisions } from "@/lib/planner/server/revisions";
import { durablePlanner, isDurablePlannerRequest } from "@/lib/planner/v2/server/web";
import { DurableIdV2Schema } from "@/lib/planner/v2/contracts";
import { ownedPlan } from "@/lib/planner/v2/server/intents";
import { loadRevision } from "@/lib/planner/v2/server/revisions";
import { rows, reject } from "@/lib/planner/v2/server/database";
export const dynamic = "force-dynamic";
export function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return plannerRoute(req, async userId => {
    const { id } = await ctx.params; const params = new URL(req.url).searchParams;
    const revision = params.get("revisionId");
    if (isDurablePlannerRequest(req)) {
      return durablePlanner().db.coordinated(userId, async sql => {
        await ownedPlan(sql, userId, DurableIdV2Schema.parse(id));
        if (!revision) reject("INVALID_OUTPUT", "Request a specific revision for its full review artifact.");
        if (!(await rows(sql, 'SELECT id FROM "PlannerRevision" WHERE id=$1 AND "planId"=$2 AND "schemaVersion"=2', [DurableIdV2Schema.parse(revision), id])).length)
          reject("REFERENCE_NOT_OWNED", "This V2 revision does not belong to the selected plan.");
        return loadRevision(sql, userId, revision);
      });
    }
    return revision ? getRevision(userId, id, revision) : listRevisions(userId, id, Number(params.get("before") ?? 2147483647));
  });
}
export function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return plannerRoute(req, async userId => appendEdit(userId, (await ctx.params).id, await readBody(req)));
}
