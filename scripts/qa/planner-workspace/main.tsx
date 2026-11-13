import React from "react";
import { createRoot } from "react-dom/client";
import StudentPlannerWorkspace from "@/app/components/planner/student/StudentPlannerWorkspace";
import { applyAppearance } from "@/app/components/GlobalSystemWrapper";
import { studentFixture } from "@/__tests__/planner-v2/workspace/fixtures";
import "@/app/globals.css";
const params = new URLSearchParams(location.search),
  scenario = params.get("state") ?? "READY",
  mode =
    scenario === "CAPACITY" ? "CLARIFY" : scenario === "empty"
      ? "READY"
      : (scenario as Parameters<typeof studentFixture>[0]);
let view = studentFixture(mode);
if (scenario === "CAPACITY") {
  view.research!.questions = [];
  view.capacityDecision = { today: "2026-11-03", overdue: [{ questId: 7, title: "Maths practice", date: "2026-10-30", remainingMinutes: 30, planId: null, canReschedule: true }] };
}
if(params.get("live")==="writing"&&view.draft)view.draft.stage="STRATEGY";
let created=false;
applyAppearance({
  mode: params.get("mode") ?? "dark",
  background: params.get("background") ?? "#10151e",
  accent: params.get("accent") ?? "#91afff",
  persistLocal: false,
});
const requests: { path: string; action: string | null }[] = [];
window.fetch = async (input, init) => {
  const path = String(input),
    body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
  requests.push({ path, action: body?.action ?? null });
  if (scenario === "CAPACITY" && path === "/api/quests/7" && init?.method === "PATCH") {
    view.capacityDecision = { today: "2026-11-03", overdue: [], overdueResolved: true };
    return Response.json({ scheduledFor: body.scheduledFor });
  }
  if (!path.startsWith("/api/planner"))
    return Response.json(
      { error: { code: "QA_NETWORK_DISABLED" } },
      { status: 503 }
    );
  if (body?.action === "CREATE") {
    created=true;view.intent.intent=body.intent;view.plan.title=body.intent.title;view.attempt=null;view.draft=null;view.changeSet=null;view.workspace.candidate=null;view.workspace.phase="READY";view.workspace.allowedActions=["GENERATE"];
    return Response.json({ planId: view.plan.planId });
  }
  if(init?.method==="PATCH"&&body?.intent){view.intent.intent=body.intent;return Response.json({saved:true});}
  if (body?.action === "CANCEL") {
    view.attempt!.state = "CANCELLED";
    return Response.json(view.attempt);
  }
  if (body?.action === "CONTINUE" || body?.action === "GENERATE") {
    view = studentFixture("RESEARCH");
    return Response.json({ attempt: view.attempt });
  }
  if (path.endsWith("/commit")) {
    view.workspace.active = view.workspace.candidate;
    view.workspace.candidate = null;
    view.workspace.allowedActions = ["STUDY"];
    view.workspace.phase = "IDLE";
    view.plan.state = "ACTIVE";
    return Response.json({ applied: true });
  }
  if(path.includes("activity=true")&&path.includes("stream=true")){
    let timer:ReturnType<typeof setInterval>|undefined;
    const body=new ReadableStream<Uint8Array>({start(controller){
      const encoder=new TextEncoder(),callId="scripted-call",words="Unpaid scripted streaming fixture: inspect the accepted facts, then hand off to the strategist. No live model is being called.".split(" ");let count=0;
      const send=(event:string,data:unknown)=>controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      send("activity",{attemptId:view.attempt!.attemptId,state:view.attempt!.state,calls:[{id:callId,label:"Understanding your goal",state:"WORKING",startedAt:new Date().toISOString(),reasoning:{text:"",characters:0,recorded:false,complete:false,clipped:false,redacted:false}}],research:[],output:null});
      const close=()=>{if(timer)clearInterval(timer);try{controller.close();}catch{}};
      init?.signal?.addEventListener("abort",close,{once:true});
      timer=setInterval(()=>{if(init?.signal?.aborted){close();return;}const text=words.slice(0,++count).join(" ");send("preview",{attemptId:view.attempt!.attemptId,reasoning:{callId,text,characters:text.length,recorded:true,complete:false,clipped:false,redacted:false}});if(count>=words.length){clearInterval(timer);}},140);
    },cancel(){if(timer)clearInterval(timer);}});
    return new Response(body,{headers:{"Content-Type":"text/event-stream"}});
  }
  if(path.includes("activity=true"))return Response.json({attemptId:view.attempt!.attemptId,state:view.attempt!.state,calls:[{id:"scripted-call",label:params.get("live")==="writing"?"Writing your study strategy":"Understanding your goal",state:"WORKING",startedAt:new Date().toISOString(),reasoning:{text:"Scripted interface fixture: check the accepted constraints before ordering the activities. This is not a live model response.",characters:127,recorded:true,complete:false,clipped:false,redacted:false}}],research:[{id:"scripted-read",label:"Reading a source",detail:"Scripted unpaid example source",reason:"This is an isolated interface fixture, not a live model response.",working:false}],output:params.get("live")==="writing"?{text:"Scripted unpaid preview: learn the method, then apply it independently.\n\nThe production view displays actual provider text here.",receivedCharacters:126,clipped:false,updatedAt:new Date().toISOString(),state:"WRITING"}:null});
  if (body) return Response.json({ saved: true });
  if (path.includes("planId=")) return Response.json(view);
  return Response.json({
    plans: scenario === "empty" && !created ? [] : [view.plan],
    next: null,
    readiness: {
      enabled: true,
      ready: true,
      reason: null,
      profile: "student-preview-v2",
    },
  });
};
Object.assign(window, { plannerQA: { requests, paidCalls: 0, scenario } });
createRoot(document.getElementById("root")!).render(
  <div
    style={{
      height: "100dvh",
      display: "flex",
      flexDirection: "column",
      background: "var(--app-canvas)",
      fontFamily: "Inter,system-ui,sans-serif",
    }}
  >
    <div
      style={{
        padding: "8px 20px",
        color: "var(--text-secondary)",
        fontSize: 11,
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      Unpaid scripted UI fixture · no model or database requests
    </div>
    <StudentPlannerWorkspace
      capabilities={{
        timezone: "Asia/Karachi",
        today: "2026-10-29",
        restDays: [5],
        subjects: [],
      }}
      onExit={() => {}}
      onApplied={() => {}}
    />
  </div>
);
