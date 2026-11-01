import { z } from "zod";
import { AttemptService, loadAttempt, persistAttempt, type LeaseToken } from "./attempts";
import { PlannerDatabase, rows, reject,hash, type Sql } from "./database";
import { ownedPlan } from "./intents";
import { readUnderstanding } from "./understanding";
import { UnderstandingActionSchema } from "../intelligence/schemas/understanding";
import { ProviderReasoningSchema } from "../intelligence/foundation/role-calls";
import type { PlannerActivity,PlannerReasoningText } from "../client/workspace";

export const VISIBLE_OUTPUT_CHARACTERS=65536;
const VisibleOutputSchema=z.strictObject({schemaVersion:z.literal(1),callId:z.uuid(),fence:z.number().int().nonnegative(),text:z.string().max(VISIBLE_OUTPUT_CHARACTERS),receivedCharacters:z.number().int().nonnegative().safe(),updatedAt:z.iso.datetime()});

/** Only display text is redacted. Exact model responses remain in accounting
 * and immutable strategy artifacts, never replaced by this presentation. */
export function studentVisibleText(text:string){
  return text.replace(/https?:\/\/[^\s<>"')]+/gi,url=>{try{const parsed=new URL(url);return `${parsed.origin}${parsed.pathname}`;}catch{return "[link]";}})
    .replace(/\bBearer\s+[^\s"'<>]*/gi,"[hidden credential]")
    .replace(/\b(?:sk-|gsk_|AIza)[A-Za-z0-9_-]*/g,"[hidden credential]")
    .replace(/\beyJ[A-Za-z0-9_.-]*/g,"[hidden credential]")
    .replace(/\b(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|authorization|password|secret)\s*[=:]\s*[^\s,;]*/gi,"[hidden credential]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,"[internal reference]")
    .replace(/\b(?:candidate|source|upload|scope|activity|plan)_[A-Za-z0-9_]+\b/g,"[reference]")
    .replace(/\u0000|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,"�");
}

export async function retainVisibleOutput(attempts:AttemptService,token:LeaseToken,callId:string,text:string,receivedCharacters:number,kind:"content"|"reasoning"="content"){
  await attempts.mutate(token,async(sql,attempt,payload,now)=>{
    const receipt=(await rows<{accountingState:string;reservation:{roleCall?:{role:string;format:string};call?:{fence:number;provider:string}}}>(sql,'SELECT "accountingState",reservation FROM "AiUsageLog" WHERE "requestId"=$1 AND "attemptId"=$2 AND "userId"=$3',[callId,attempt.attemptId,attempt.ownerId]))[0];
    if(!attempt.budget.aiFirst||!receipt?.reservation.roleCall||receipt.reservation.call?.fence!==token.fence||!["DISPATCHED","SETTLED"].includes(receipt.accountingState)||
      (kind==="content"?(receipt.reservation.roleCall.role!=="STRATEGIST"||receipt.reservation.roleCall.format!=="TEXT"):receipt.reservation.call.provider!=="deepseek"))reject("REFERENCE_NOT_OWNED","Visible output requires its current owned provider call.","RECOVERY");
    if(!Number.isSafeInteger(receivedCharacters)||receivedCharacters<text.length)reject("INVALID_OUTPUT","Visible output must describe the received text.","RECOVERY");
    const field=kind==="content"?"visibleOutput":"providerReasoning";
    const previous=VisibleOutputSchema.safeParse(payload[field]);
    if(previous.success&&previous.data.callId===callId&&previous.data.receivedCharacters>receivedCharacters)return;
    const clipped=studentVisibleText(text).slice(0,VISIBLE_OUTPUT_CHARACTERS).replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,"�");
    const visibleOutput=VisibleOutputSchema.parse({schemaVersion:1,callId,fence:token.fence,text:clipped,receivedCharacters,updatedAt:now.toISOString()});
    await persistAttempt(sql,attempt,attempt,{...payload,[field]:visibleOutput});
  });
}

function callLabel(role:string|undefined,key:string|undefined,model:string){
  if(model==="search")return "Searching the web";
  if(role==="STRATEGIST")return "Writing your study strategy";
  if(role==="TRANSLATOR")return "Building your learning activities";
  if(role==="REVIEWER")return "Reviewing your plan";
  return key?.startsWith("synthesis_")?"Checking the research summary":key?.startsWith("verify_")?"Verifying sources":"Understanding your goal";
}

async function activityAttempt(sql:Sql,ownerId:number,planId:string,attemptId:string){
  await ownedPlan(sql,ownerId,planId,false);
  const loaded=await loadAttempt(sql,ownerId,attemptId,false);
  if(!loaded.attempt.targets.some(target=>target.planId===planId))reject("REFERENCE_NOT_OWNED","This activity does not belong to the selected plan.");
  return loaded;
}
export async function readProviderReasoning(db:PlannerDatabase,ownerId:number,planId:string,attemptId:string,callId:string):Promise<PlannerReasoningText>{
  return db.observed(ownerId,async sql=>{
    const {attempt}=await activityAttempt(sql,ownerId,planId,attemptId);
    const row=(await rows<{reasoning:unknown;finish:string|null}>(sql,`SELECT l.reservation->'result'->'reasoning' AS reasoning,l.reservation->'result'->>'finishReason' AS finish
      FROM "AiUsageLog" l JOIN "PlannerAttempt" a ON a.id=l."attemptId" WHERE l."requestId"=$1 AND l."userId"=$2 AND a."userId"=$2 AND l."rootRequestId"=$3
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(a.artifact->'targets') t WHERE t->>'planId'=$4)`,[callId,ownerId,attempt.budget.rootRequestId,planId]))[0];
    if(!row)reject("REFERENCE_NOT_OWNED","This reasoning does not belong to the selected journey.");
    const parsed=ProviderReasoningSchema.safeParse(row.reasoning);
    if(!parsed.success)return {text:"",characters:0,complete:false,clipped:false,redacted:false,recorded:false};
    if(parsed.data.digest!==hash("provider-reasoning-v1",parsed.data.text))reject("INVALID_OUTPUT","The retained provider reasoning changed.","RECOVERY");
    const text=studentVisibleText(parsed.data.text);
    return {text,characters:parsed.data.text.length,complete:row.finish==="STOP",clipped:false,redacted:text!==parsed.data.text,recorded:true};
  });
}
export async function readPlannerActivity(db:PlannerDatabase,ownerId:number,planId:string,attemptId:string):Promise<PlannerActivity>{
  return db.observed(ownerId,async sql=>{
    const {attempt,payload}=await activityAttempt(sql,ownerId,planId,attemptId);
    type ActivityLog={requestId:string;accountingState:string;model:string;createdAt:Date;completed:string|null;actionText:string|null;reasoningPreview:string|null;reasoningCharacters:number|null;finish:string|null;reservation:{accepted?:boolean;roleCall?:{role:string;key:string};call?:{fence:number}}};
    const logs=await rows<ActivityLog>(sql,`SELECT l."requestId",l."accountingState",l.model,l."createdAt",l.reservation-'result'-'usage' AS reservation,
      a.payload->'providerCalls'->l."requestId"::text->>'completedAt' AS completed,
      CASE WHEN l.reservation->'roleCall'->>'role'='RESEARCH' AND l.reservation->'roleCall'->>'key' LIKE 'understand_%' THEN l.reservation->'result'->>'text' ELSE NULL END AS "actionText",
      left(l.reservation->'result'->'reasoning'->>'text',400) AS "reasoningPreview",length(l.reservation->'result'->'reasoning'->>'text') AS "reasoningCharacters",l.reservation->'result'->>'finishReason' AS finish
      FROM "AiUsageLog" l JOIN "PlannerAttempt" a ON a.id=l."attemptId" WHERE l."userId"=$1 AND a."userId"=$1 AND l."rootRequestId"=$2
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(a.artifact->'targets') t WHERE t->>'planId'=$3) ORDER BY l.id DESC LIMIT 200`,[ownerId,attempt.budget.rootRequestId,planId]);
    logs.reverse();
    const run=payload.understanding?readUnderstanding(payload.understanding):null;
    const actionCalls=new Map<string,string>();
    for(const log of logs)if(log.actionText&&log.reservation.accepted){try{const action=UnderstandingActionSchema.safeParse(JSON.parse(log.actionText));if(action.success)actionCalls.set(hash("research-action-v1",action.data),log.requestId);}catch{/* Not an action response. */}}
    const actions=run?[...run.actions,...(run.pending?[run.pending]:[])]:[];
    const research:PlannerActivity["research"]=actions.map((action,index)=>{
      let label="",detail="",reason:string|null=null;
      if(action.action==="SEARCH"){label="Search";detail=action.query;reason=action.reason;}
      else if(action.action==="READ"){label="Read";detail=run!.candidates.find(c=>c.ref===action.candidateRef)?.title??"Selected public source";reason=action.reason;}
      else if(action.action==="READ_UPLOAD"){label="Read";detail=run!.input.documents.find(d=>d.ref===action.uploadRef)?.title??"Selected material";reason=action.reason;}
      else if(action.action==="CLARIFY"){label="Ask";detail=action.questions.map(q=>q.question).join(" ");}
      else{label="Research proposal";detail=action.summary.goals;}
      return {id:`research_${index}`,callId:actionCalls.get(hash("research-action-v1",action)),label,detail:studentVisibleText(detail),reason:reason?studentVisibleText(reason):null,working:index===actions.length-1&&!!run?.toolPending&&attempt.state==="RUNNING"};
    }).slice(-100);
    const parsed=VisibleOutputSchema.safeParse(payload.visibleOutput),visible=parsed.success?parsed.data:null,receipt=visible?logs.find(log=>log.requestId===visible.callId):undefined;
    const output=visible&&receipt?{text:studentVisibleText(visible.text),receivedCharacters:visible.receivedCharacters,clipped:visible.receivedCharacters>VISIBLE_OUTPUT_CHARACTERS,updatedAt:visible.updatedAt,
      state:receipt.accountingState==="SETTLED"&&receipt.reservation.accepted?"RECEIVED" as const:attempt.state==="RUNNING"&&attempt.fence===visible.fence&&receipt.accountingState==="DISPATCHED"?"WRITING" as const:"INTERRUPTED" as const}:null;
    const thinking=VisibleOutputSchema.safeParse(payload.providerReasoning);
    const ended=["FAILED","CANCELLED","SUCCEEDED","SUPERSEDED","NEEDS_DECISION"].includes(attempt.state);
    const updated=ended?(await rows<{updatedAt:Date}>(sql,'SELECT "updatedAt" FROM "PlannerAttempt" WHERE id=$1',[attemptId]))[0].updatedAt.toISOString():undefined;
    return {attemptId,state:attempt.state,startedAt:attempt.budget.processingStartedAt??attempt.requestedAt,...(updated?{finishedAt:updated}:{}),research,output,calls:logs.map(log=>{
      const partial=thinking.success&&thinking.data.callId===log.requestId?thinking.data:null;
      const raw=partial?.text??log.reasoningPreview??"",text=studentVisibleText(raw),characters=partial?.receivedCharacters??log.reasoningCharacters??0;
      return {id:log.requestId,label:callLabel(log.reservation.roleCall?.role,log.reservation.roleCall?.key,log.model),startedAt:log.createdAt.toISOString(),...(log.completed?{finishedAt:log.completed}:{}),
        state:log.accountingState==="DISPATCHED"&&attempt.state==="RUNNING"?"WORKING" as const:log.accountingState==="SETTLED"?"RECEIVED" as const:"STOPPED" as const,
        ...(log.reservation.roleCall?{reasoning:{text,characters,recorded:!!partial||log.reasoningPreview!==null,complete:log.finish==="STOP",clipped:characters>raw.length,redacted:text!==raw}}:{})};
    })};
  });
}

/** Read only the current display fields between durable checkpoint changes.
 * This avoids repeatedly loading research sources and completed traces. */
async function liveActivityProjection(db:PlannerDatabase,ownerId:number,planId:string,attemptId:string){
  return db.observed(ownerId,async sql=>{
    const value=(await rows<{state:string;fence:number;checkpoint:string;reasoning:unknown;output:unknown}>(sql,`SELECT a.state,(a.artifact->>'fence')::int AS fence,
      concat(a.state,':',a.artifact->>'stage',':',a.payload->'understanding'->>'step',':',a.payload->'understanding'->>'toolPending',':',a.payload->'understanding'->'pending'->>'action',':',md5(coalesce((a.payload->'providerCalls')::text,''))) AS checkpoint,
      a.payload->'providerReasoning' AS reasoning,a.payload->'visibleOutput' AS output
      FROM "PlannerAttempt" a WHERE a.id=$1 AND a."userId"=$2 AND EXISTS(SELECT 1 FROM "PlannerPlan" p WHERE p.id=$3::uuid AND p."userId"=$2)
      AND EXISTS(SELECT 1 FROM jsonb_array_elements(a.artifact->'targets') t WHERE t->>'planId'=$3::text)`,[attemptId,ownerId,planId]))[0];
    if(!value)reject("REFERENCE_NOT_OWNED","This activity does not belong to the selected plan.");
    return value;
  });
}

/** A read-only SSE view of the existing cross-process durable preview. No
 * provider calls, replay, synthetic typing or separate event persistence. */
export async function streamPlannerActivity(db:PlannerDatabase,ownerId:number,planId:string,attemptId:string,signal:AbortSignal){
  const initial=await readPlannerActivity(db,ownerId,planId,attemptId);
  const encoder=new TextEncoder(),stop=new AbortController();
  const cancel=()=>stop.abort();signal.addEventListener("abort",cancel,{once:true});if(signal.aborted)cancel();
  const body=new ReadableStream<Uint8Array>({
    start(controller){
      const send=(event:string,data:unknown)=>{if(!stop.signal.aborted)controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));};
      void(async()=>{
        let checkpoint:string|undefined,lastPreview="",snapshot=initial;
        const started=Date.now();
        try{
          send("activity",snapshot);
          while(!stop.signal.aborted&&Date.now()-started<55000){
            const live=await liveActivityProjection(db,ownerId,planId,attemptId);
            if(checkpoint!==live.checkpoint){
              snapshot=await readPlannerActivity(db,ownerId,planId,attemptId);checkpoint=live.checkpoint;send("activity",snapshot);
            }
            const reasoning=VisibleOutputSchema.safeParse(live.reasoning),output=VisibleOutputSchema.safeParse(live.output);
            const preview={attemptId,
              ...(reasoning.success&&live.state==="RUNNING"&&reasoning.data.fence===live.fence?{reasoning:{callId:reasoning.data.callId,text:studentVisibleText(reasoning.data.text),characters:reasoning.data.receivedCharacters,recorded:true,complete:false,clipped:reasoning.data.receivedCharacters>reasoning.data.text.length,redacted:true}}:{}),
              ...(output.success&&live.state==="RUNNING"&&output.data.fence===live.fence?{output:{text:studentVisibleText(output.data.text),receivedCharacters:output.data.receivedCharacters,clipped:output.data.receivedCharacters>output.data.text.length,updatedAt:output.data.updatedAt,state:"WRITING"}}:{})};
            const serialized=JSON.stringify(preview);if(serialized!==lastPreview){send("preview",preview);lastPreview=serialized;}
            if(!["RUNNING","QUEUED"].includes(live.state)){send("done",{});break;}
            await new Promise<void>(resolve=>{const done=()=>{clearTimeout(timer);stop.signal.removeEventListener("abort",done);resolve();};const timer=setTimeout(done,400);stop.signal.addEventListener("abort",done,{once:true});if(stop.signal.aborted)done();});
          }
        }catch{send("unavailable",{});}
        finally{signal.removeEventListener("abort",cancel);try{controller.close();}catch{/* Consumer cancellation already closed the body. */}}
      })();
    },
    cancel(){stop.abort();signal.removeEventListener("abort",cancel);},
  });
  return new Response(body,{headers:{"Content-Type":"text/event-stream; charset=utf-8","Cache-Control":"private, no-store, no-transform","X-Accel-Buffering":"no"}});
}
