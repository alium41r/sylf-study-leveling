import { z } from "zod";
import { plannerRoute, readBody } from "@/lib/planner/server/http";
import { recoverGeneration } from "@/lib/planner/server/generation";
type Context = { params: Promise<{ key: string }> };
export const dynamic = "force-dynamic";
export function GET(req: Request, ctx: Context) {
  return plannerRoute(req, async (userId) =>
    recoverGeneration(userId, (await ctx.params).key)
  );
}
export function POST(req: Request, ctx: Context) {
  return plannerRoute(req, async (userId) => {
    const body = z
      .strictObject({
        schemaVersion: z.literal(1),
        action: z.enum(["CANCEL", "RECOVER_EXPIRED"]),
      })
      .parse(await readBody(req));
    return recoverGeneration(userId, (await ctx.params).key, body.action);
  });
}
