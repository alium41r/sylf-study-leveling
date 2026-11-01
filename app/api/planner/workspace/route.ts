import { z } from "zod";
import { plannerRoute, readBody } from "@/lib/planner/server/http";
import { durablePlanner } from "@/lib/planner/v2/server/web";
import {
  StudentWorkspaceService,
  studentReadiness,
  requireStudentAdmission,
  studentWorkspaceEnabled,
} from "@/lib/planner/v2/server/student-workspace";
import {
  DurableIdV2Schema,
  CanonicalIntentV2Schema,
  PLANNER_V2_ENVELOPE,
} from "@/lib/planner/v2/contracts";
import { reject } from "@/lib/planner/v2/server/database";
import { PlannerFoundationService } from "@/lib/planner/v2/server/foundation";
import { readPlannerActivity,readProviderReasoning,streamPlannerActivity } from "@/lib/planner/v2/server/activity";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const key = z.string().regex(/^[A-Za-z0-9_-]{8,100}$/);
export function GET(req: Request) {
  return plannerRoute(req, async (owner) => {
    const query = new URL(req.url).searchParams,
      core = durablePlanner(),
      service = new StudentWorkspaceService(core.db);
    const planId = query.get("planId");
    if (!planId)
      return {
        readiness: await studentReadiness(),
        ...(await service.list(owner, query.get("before") ?? undefined)),
      };
    DurableIdV2Schema.parse(planId);
    if(query.get("activity")==="true"){
      const attemptId=DurableIdV2Schema.parse(query.get("attemptId"));
      if(query.get("stream")==="true")return streamPlannerActivity(core.db,owner,planId,attemptId,req.signal);
      return query.has("reasoningCallId")?readProviderReasoning(core.db,owner,planId,attemptId,DurableIdV2Schema.parse(query.get("reasoningCallId"))):readPlannerActivity(core.db,owner,planId,attemptId);
    }
    if (query.get("artifactId") || query.get("history") === "true") {
      const attemptId = DurableIdV2Schema.parse(query.get("attemptId")),
        artifactId = query.get("artifactId")
          ? DurableIdV2Schema.parse(query.get("artifactId"))
          : null;
      const attempt = await core.attempts.read(owner, attemptId);
      if (!attempt.targets.some((t) => t.planId === planId))
        reject(
          "REFERENCE_NOT_OWNED",
          "This history does not belong to the selected plan."
        );
      const { archive } = await new PlannerFoundationService(
        core.attempts
      ).read(owner, attemptId);
      if (!artifactId)
        return {
          history: Object.values(archive.entries).map((a) => ({
            id: a.id,
            kind: a.kind,
            label:
              a.kind === "STRATEGY" ? `Strategy ${a.value.version}` : a.kind,
          })),
        };
      const artifact = archive.entries[artifactId];
      if (!artifact)
        reject("REFERENCE_NOT_OWNED", "This artifact is unavailable.");
      return { artifact };
    }
    return service.read(owner, planId);
  });
}
export function POST(req: Request) {
  return plannerRoute(req, async (owner) => {
    const body = await readBody(req, PLANNER_V2_ENVELOPE.serializedBytes),
      action = z.object({ action: z.string() }).parse(body).action;
    const core = durablePlanner();
    // Reads, cancellation and confirmation retain their existing independent
    // routes. A disabled preview cannot dispatch or create new preview work.
    if (!studentWorkspaceEnabled())
      reject(
        "WORKER_UNAVAILABLE",
        "The student Planner preview is not enabled.",
        "INTAKE"
      );
    if (action === "CREATE") {
      const input = z
        .strictObject({
          action: z.literal("CREATE"),
          key,
          intent: CanonicalIntentV2Schema,
        })
        .parse(body);
      const result = await core.intents.create(owner, input.key, input.intent);
      return { planId: result.plan.id };
    }
    if (action === "GENERATE") {
      await requireStudentAdmission();
      return new StudentWorkspaceService(core.db).generate(
        owner,
        body,
        req.signal
      );
    }
    if (action === "NOTE") {
      const input = z
        .strictObject({
          action: z.literal("NOTE"),
          planId: DurableIdV2Schema,
          key,
          text: z.string().trim().min(1).max(12000),
          expectedConversationVersion: z.number().int().nonnegative(),
        })
        .parse(body);
      return core.assistant.note(owner, input.planId, {
        key: input.key,
        text: input.text,
        expectedConversationVersion: input.expectedConversationVersion,
      });
    }
    if (action === "CONTINUE") {
      const input = z
        .strictObject({ action: z.literal("CONTINUE"), request: z.unknown() })
        .parse(body);
      await requireStudentAdmission();
      return core.research.understanding().continue(owner, input.request);
    }
    reject("INVALID_OUTPUT", "Choose a supported workspace action.", "INTAKE");
  });
}
