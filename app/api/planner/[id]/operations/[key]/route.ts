import { plannerRoute, readBody } from "@/lib/planner/server/http";
import { recoverOperation, stopOperation } from "@/lib/planner/server/operations";
import { abortRunning } from "@/lib/planner/server/running";
import { z } from "zod";
import { durablePlanner, isDurablePlannerRequest } from "@/lib/planner/v2/server/web";
import { PLANNER_V2_ENVELOPE, DurableIdV2Schema } from "@/lib/planner/v2/contracts";
import { reject } from "@/lib/planner/v2/server/database";
type Context = { params: Promise<{ id: string; key: string }> };
export const dynamic = "force-dynamic";
export function GET(req: Request, ctx: Context) {
  return plannerRoute(req, async userId => {
    const { id, key } = await ctx.params;
    if (isDurablePlannerRequest(req)) {
      const attempt = await durablePlanner().attempts.read(userId, DurableIdV2Schema.parse(key));
      if(attempt.kind==="RESEARCH_ADVICE")return durablePlanner().research.readAdvice(userId,id,key);
      if (!attempt.targets.some(target => target.planId === id)) reject("REFERENCE_NOT_OWNED", "This operation does not belong to the selected plan.");
      return attempt;
    }
    const kind = z.enum(["operation", "confirmation"]).parse(new URL(req.url).searchParams.get("kind") ?? "operation");
    return recoverOperation(userId, id, key, false, kind);
  });
}
export function POST(req: Request, ctx: Context) {
  return plannerRoute(req, async userId => {
    if (isDurablePlannerRequest(req)) {
      z.strictObject({ schemaVersion: z.literal(2), action: z.literal("CANCEL") }).parse(await readBody(req, PLANNER_V2_ENVELOPE.serializedBytes));
      const { id, key } = await ctx.params; const core = durablePlanner();
      const attempt = await core.attempts.read(userId, DurableIdV2Schema.parse(key));
      if(attempt.kind==="RESEARCH_ADVICE") {await core.research.readAdvice(userId,id,key);return core.attempts.cancel(userId,key);}
      if (!attempt.targets.some(target => target.planId === id)) reject("REFERENCE_NOT_OWNED", "This operation does not belong to the selected plan.");
      return core.attempts.cancel(userId, key);
    }
    // CANCEL is explicit and owner-scoped: it releases an in-flight operation and
    // refunds its reservation once. RECOVER_EXPIRED only fails an expired lease.
    const body = z
      .strictObject({
        schemaVersion: z.literal(1),
        action: z.enum(["RECOVER_EXPIRED", "CANCEL"]),
      })
      .parse(await readBody(req));
    const { id, key } = await ctx.params;
    if (body.action === "CANCEL") {
      abortRunning(id);
      const operation = await stopOperation(userId, id, key, "CANCELLED");
      return { id: operation.id, state: operation.operationState, leaseExpiresAt: operation.leaseExpiresAt, confirmationReceipt: operation.confirmationReceipt };
    }
    return recoverOperation(userId, id, key, true);
  });
}
