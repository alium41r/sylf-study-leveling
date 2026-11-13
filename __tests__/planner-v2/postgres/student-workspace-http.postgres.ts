import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { connect, user } from "./database";
import { journeyIntent, reviewResponse } from "./reviewed-learning-fixture";
import {
  naturalText,
  naturalProposal,
} from "../intelligence/natural-learning-fixture";
import { PlannerDatabase } from "@/lib/planner/v2/server/database";
import { AttemptService } from "@/lib/planner/v2/server/attempts";
import { PlannerWorker } from "@/lib/planner/v2/server/worker";
import { createCompilerHandlers } from "@/lib/planner/v2/server/compiler";
import { ResearchService } from "@/lib/planner/v2/server/research";
import type { LLMAdapter } from "@/lib/ai/providers/types";
import type { LearningInput } from "@/lib/planner/v2/intelligence/schemas/natural-learning";
import type { StrategyDocument } from "@/lib/planner/v2/intelligence/foundation/contracts";
import type { StudentWorkspace } from "@/lib/planner/v2/client/workspace";
// Match the established HTTP/SQL harness: only cookie identity and connection
// configuration are replaced. Every route, service, receipt and worker is real.
vi.mock("@/lib/auth-server", () => ({
  getSession: async (req: Request) => {
    const owner = Number(req.headers.get("x-disposable-owner"));
    return owner > 0 ? { userId: owner } : null;
  },
}));
vi.mock("@/lib/prisma", async () => {
  const { Pool } = await import("pg"),
    url = new URL(process.env.PLANNER_TEST_DATABASE_URL!);
  if (
    url.hostname !== "127.0.0.1" ||
    !/^\/sylf_planner_phase1_[a-f0-9]{16}$/.test(url.pathname) ||
    process.env.PLANNER_PHASE0_REQUIRED !== "true"
  )
    throw Error("Disposable database required");
  const pool = new Pool({ connectionString: url.toString(), max: 6 });
  return { getApplicationPool: () => pool, prisma: {} };
});
import { getApplicationPool } from "@/lib/prisma";
import { GET, POST } from "@/app/api/planner/workspace/route";
import { POST as confirm } from "@/app/api/planner/[id]/commit/route";
let connection: Awaited<ReturnType<typeof connect>>,
  attempts: AttemptService,
  db: PlannerDatabase,
  owner = 0;
beforeAll(async () => {
  connection = await connect();
  db = new PlannerDatabase(getApplicationPool());
  attempts = new AttemptService(db);
});
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  if (owner)
    for (const row of (
      await connection.query(
        "SELECT id FROM \"PlannerAttempt\" WHERE \"userId\"=$1 AND state IN ('QUEUED','RUNNING','NEEDS_DECISION')",
        [owner]
      )
    ).rows)
      await attempts.cancel(owner, row.id);
});
afterAll(async () => {
  await getApplicationPool().end();
  await connection.end();
});
const request = (path: string, body?: unknown) =>
  new Request(`http://disposable.invalid/api/planner${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "x-disposable-owner": String(owner),
      "x-sylf-planner-contract": "2",
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
it.each(["direct", "research-recovery", "clarification"] as const)("runs %s student admission through the real worker, preview readers and atomic confirmation without paid calls", async (scenario) => {
  owner = await user(connection);
  await connection.query(
    "UPDATE \"User\" SET \"restDays\"='{}',timezone='UTC' WHERE id=$1",
    [owner]
  );
  vi.stubEnv("PLANNER_V2_DURABLE_CORE_ENABLED", "true");
  vi.stubEnv("PLANNER_V2_STUDENT_WORKSPACE_ENABLED", "true");
  vi.stubEnv("DEEPSEEK_API_KEY", "scripted-unpaid-only");
  const health = vi.fn(async (input: RequestInfo | URL) => {
    expect(String(input)).toBe("http://127.0.0.1:8081/ready");
    return Response.json({
      ready: true,
      compatible: true,
      compilerVersions: [1, 2],
    });
  });
  vi.stubGlobal("fetch", health);
  const created = await POST(
    request("/workspace", {
      action: "CREATE",
      key: randomUUID(),
      intent: journeyIntent(),
    })
  );
  expect(created.status).toBe(200);
  const { planId } = await created.json();
  const read = async () => {
    const response = await GET(request(`/workspace?planId=${planId}`));
    expect(response.status).toBe(200);
    return (await response.json()) as StudentWorkspace;
  };
  const initial = await read();
  expect(initial.attempt).toBeNull();
  expect(
    (
      await POST(
        request("/workspace", {
          action: "NOTE",
          planId,
          key: randomUUID(),
          text: "I have studied the chapter but need independent method-selection practice.",
          expectedConversationVersion: 0,
        })
      )
    ).status
  ).toBe(200);
  const admission = {
    action: "GENERATE",
    profile: "student-preview-v1",
    consent: true,
    request: {
      schemaVersion: 2,
      requestKey: randomUUID(),
      text: "Explain and predict a simple circuit. Preserve my exact accepted goal and available study windows.",
      researchRequested: false,
      targets: [
        {
          kind: "EXISTING",
          planId,
          expectedIntentVersionId: initial.intent.intentVersionId,
          expectedPlanningVersion: initial.workspace.planningVersion,
          baseActiveRevisionId: null,
        },
      ],
    },
  };
  const accepted = await POST(request("/workspace", admission));
  expect(accepted.status).toBe(200);
  const { attempt } = await accepted.json();
  let currentAttempt=attempt;
  expect(attempt.state).toBe("QUEUED");
  expect((await POST(request("/workspace", admission))).status).toBe(200);
  const roles: string[] = [];
  const adapter: LLMAdapter = {
    generateResponse: async (messages, instruction) => {
      const packet = JSON.parse(messages[0].content!);
      let value: unknown;
      if (instruction.includes("You are Sylf's Research & Understanding role.")) {
        roles.push("RESEARCH");
        const researchCalls=roles.filter(role=>role==="RESEARCH").length;
        if(scenario==="research-recovery"&&researchCalls===2)expect(packet.gaps.join(" ")).toContain("Server completion validation: unresolved gap_resource");
        value = scenario==="clarification"&&researchCalls===1?{action:"CLARIFY",summary:{goals:"Explain and predict circuits",background:"Unknown",strengths:"Unknown",weaknesses:"Unknown",resources:"Resource choice needed",constraints:"Accepted",preferences:"Accepted",uncertainty:"Disclosed"},questions:[{ref:"question_resource",topic:"practice_resource_choice",question:"Should the plan use original circuit examples or a particular supplied packet?",consequence:"This determines which source contents the activities require."}]}:{
          action: "COMPLETE",
          summary: {
            goals: "Explain and predict circuits",
            background: "Prior study is student-reported",
            strengths: "Demonstrated transfer is unknown",
            weaknesses: "Method selection requires independent practice",
            resources: "Self-contained original circuit examples",
            constraints: "Accepted windows and immutable goal",
            preferences: "Accepted pacing",
            uncertainty: "No demonstrated mastery is invented",
          },
          batches: [],
          unresolved: scenario==="research-recovery"?[{ref:"gap_resource",consequential:researchCalls===1,explanation:researchCalls===1?"The external packet edition is unknown.":"No external edition is required for the accepted general goal; use original examples and preserve the unknown edition."}]:[],
        };
      } else if (instruction.startsWith("Check the complete")) {
        roles.push("SYNTHESIS");
        value = {
          supported: true,
          explanation:
            "The synthesis preserves claims, context and uncertainty",
          issues: [],
        };
      } else if (instruction.startsWith("You are Sylf's DeepSeek")) {
        roles.push("STRATEGIST");
        value = naturalText;
      } else if (
        instruction.startsWith(
          "You are Sylf's independent educational reviewer"
        )
      ) {
        roles.push("REVIEWER");
        value = reviewResponse();
      } else {
        roles.push("TRANSLATOR");
        value = naturalProposal(
          packet.ownedLearning as LearningInput,
          packet.strategy as StrategyDocument
        );
      }
      return {
        text: typeof value === "string" ? value : JSON.stringify(value),
        model: "deepseek-flash",
        fingerprint: "unpaid-public-workspace-smoke",
        finishReason: "STOP",
        usage: {
          promptTokens: 100,
          completionTokens: 100,
          totalTokens: 200,
          reasoningTokens: 50,
          cacheHitTokens: 0,
        },
      };
    },
  };
  const provider = { adapter: () => adapter },
    research = new ResearchService(attempts, { provider, search: null }),
    worker = new PlannerWorker(
      attempts,
      createCompilerHandlers(attempts, { provider, research }),
      () => {}
    );
  try {
    await worker.tick();
    for (let n = 0; n < 400; n++) {
      if (
        ["SUCCEEDED", "FAILED", "NEEDS_DECISION"].includes(
          (await attempts.read(owner, currentAttempt.attemptId)).state
        )
      )
        break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    if(scenario==="clarification"){
      const pending=await read();expect(pending.attempt?.state).toBe("NEEDS_DECISION");
      const continued=await POST(request("/workspace",{action:"CONTINUE",request:{key:randomUUID(),parentAttemptId:attempt.attemptId,expectedResearchDigest:pending.research!.digest,answers:[{ref:"question_resource",text:"Use original self-contained examples. No external packet is required."}],intents:[{planId,expectedIntentId:pending.intent.intentVersionId,expectedPlanningVersion:pending.workspace.planningVersion,baseRevisionId:null}]}}));
      expect(continued.status).toBe(200);currentAttempt=(await continued.json()).attempt;
      expect(currentAttempt.budget.rootRequestId).toBe(pending.attempt!.budget.rootRequestId);expect(currentAttempt.budget.executionDeadlineAt).toBe(pending.attempt!.budget.executionDeadlineAt);
      await worker.tick();
      for(let n=0;n<400;n++){if(["SUCCEEDED","FAILED"].includes((await attempts.read(owner,currentAttempt.attemptId)).state))break;await new Promise(resolve=>setTimeout(resolve,25));}
    }
    const complete = await read();
    expect(complete.attempt?.error).toBeNull();
    expect(complete.attempt?.state).toBe("SUCCEEDED");
    expect(roles).toEqual(scenario==="direct"?["RESEARCH","SYNTHESIS","STRATEGIST","TRANSLATOR","REVIEWER"]:scenario==="research-recovery"?["RESEARCH","SYNTHESIS","RESEARCH","SYNTHESIS","STRATEGIST","TRANSLATOR","REVIEWER"]:["RESEARCH","RESEARCH","SYNTHESIS","STRATEGIST","TRANSLATOR","REVIEWER"]);
    expect(complete.draft?.strategies[0].text).toBe(naturalText);
    expect(complete.draft?.allocation?.status).toBe("FEASIBLE");
    expect(complete.workspace.allowedActions).toContain("CONFIRM");
    expect(complete.usage?.calls).toBe(scenario==="direct"?5:scenario==="research-recovery"?7:6);
    expect(complete.usage?.uncertain).toBe(false);
    expect(
      (
        await connection.query(
          'SELECT count(*) FROM "Quest" WHERE "userId"=$1',
          [owner]
        )
      ).rows[0].count
    ).toBe("0");
    const body = {
        schemaVersion: 2,
        attemptId: currentAttempt.attemptId,
        changeSetId: complete.changeSet!.changeSetId,
        acknowledgements: [],
      },
      context = { params: Promise.resolve({ id: planId }) };
    const applied = await confirm(request(`/${planId}/commit`, body), context);
    expect(applied.status).toBe(200);
    const receipt = await applied.json();
    expect(
      await (await confirm(request(`/${planId}/commit`, body), context)).json()
    ).toEqual(receipt);
    const active = await read();
    expect(active.workspace.active?.revisionId).toBe(
      receipt.targets[0].revisionId
    );
    expect(active.draft?.strategies[0].text).toBe(naturalText);
    expect(
      (
        await connection.query(
          'SELECT count(*) FROM "Quest" WHERE "userId"=$1',
          [owner]
        )
      ).rows[0].count
    ).toBe("1");
    expect(
      health.mock.calls.every(
        ([url]) => String(url) === "http://127.0.0.1:8081/ready"
      )
    ).toBe(true);
  } finally {
    await worker.shutdown();
  }
}, 30000);
