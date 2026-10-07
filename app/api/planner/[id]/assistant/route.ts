import { z } from "zod";
import { plannerRoute,readBody } from "@/lib/planner/server/http";
import { durablePlanner,requireDurablePlannerAdmission } from "@/lib/planner/v2/server/web";
import { AssistantTurnRequestSchema } from "@/lib/planner/v2/server/assistant";
import { DurableIdV2Schema,ProseV2Schema } from "@/lib/planner/v2/contracts";
const requestSchema=z.discriminatedUnion("action",[
  z.strictObject({action:z.literal("TURN"),turn:AssistantTurnRequestSchema}),
  z.strictObject({action:z.literal("ACCEPT_INTAKE"),eventKey:z.string().min(8).max(100),expectedIntentId:DurableIdV2Schema,expectedPlanningVersion:z.number().int().nonnegative(),fields:z.array(z.string()).min(1).max(8)}),
  z.strictObject({action:z.literal("PREPARE"),key:z.string().min(8).max(100),recommendationId:DurableIdV2Schema,selectedPlanIds:z.array(DurableIdV2Schema).min(1).max(2),researchRequested:z.boolean()}),
  z.strictObject({action:z.literal("RESEARCH_ADVICE"),key:z.string().min(8).max(100),text:ProseV2Schema,documentIds:z.array(DurableIdV2Schema).max(9),eventKey:z.string().min(8).max(100).optional(),parentAttemptId:DurableIdV2Schema.optional()}),
]);
export const runtime="nodejs";
export async function GET(req:Request,ctx:{params:Promise<{id:string}>}) {
  return plannerRoute(req,async owner=>{requireDurablePlannerAdmission();return durablePlanner().assistant.read(owner,(await ctx.params).id);});
}
export async function POST(req:Request,ctx:{params:Promise<{id:string}>}) {
  return plannerRoute(req,async owner=>{
    requireDurablePlannerAdmission();const {id}=await ctx.params;const body=requestSchema.parse(await readBody(req,32*1024));const services=durablePlanner();
    if(body.action==="TURN")return services.assistant.respond(owner,id,body.turn,req.signal);
    if(body.action==="ACCEPT_INTAKE")return services.assistant.acceptIntake(owner,id,body);
    if(body.action==="PREPARE")return services.assistant.prepare(owner,id,body);
    if(body.eventKey)return services.assistant.prepareResearchAdvice(owner,id,{...body,eventKey:body.eventKey});
    return services.research.enqueueAdvice(owner,{key:body.key,text:body.text,readPlanIds:[id],documentIds:body.documentIds,parentAttemptId:body.parentAttemptId});
  });
}
