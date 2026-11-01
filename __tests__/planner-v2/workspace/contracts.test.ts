import { describe, expect, it, vi, afterEach } from "vitest";
import {
  parseUnderstandingReview,
  understandingInstructions,
  understandingVerificationPacket,
} from "@/lib/planner/v2/intelligence/schemas/understanding";
import {
  studentResourcePolicy,
  studentWorkspaceEnabled,
  StudentGenerationSchema,
  studentReadiness,
} from "@/lib/planner/v2/server/student-workspace";
import { ResourcePolicySchema } from "@/lib/planner/v2/intelligence/foundation/resources";
import { plannerRestDays } from "@/lib/planner/v2/client/workspace";
import type { UnderstandingRun } from "@/lib/planner/v2/intelligence/schemas/understanding";
import { intentFixture } from "../postgres/intent-fixture";
import {
  WorkspaceRequestError,
  workspaceRequest,
} from "@/lib/planner/v2/client/transport";
const run = {
  input: {
    verificationVersion: 3,
    plans: [{ planRef: "plan_1", intent: intentFixture() }],
    documents: [],
  },
  sources: [],
  answers: [],
} as unknown as UnderstandingRun;
const plan = run.input.plans[0];
const review = {
  claims: [],
  identities: [],
  completeSourceIds: [],
  conflicts: [],
  answer: "Only exact selected-plan aliases",
  scopeBindings: [
    {
      claimId: "claim_1",
      scopeRefs: ["plan_1:scope_electricity"],
      disposition: "ANNOTATE_SCOPE",
    },
  ],
};
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("student workspace contracts and unpaid boundaries", () => {
  it("allows a lower explicit dollar ceiling without reducing role reasoning allowances", () => {
    const policy = studentResourcePolicy(1.74);
    expect(policy.spending?.maximumMicros).toBe(1740000);
    expect(policy.roles.STRATEGIST.call.completionTokens).toBe(65536);
    expect(studentResourcePolicy().spending?.maximumMicros).toBe(1750000);
    expect(() => studentResourcePolicy(1.76)).toThrow();
    expect(() => studentResourcePolicy(1.741)).toThrow();
  });
  it("maps Sunday-based account rest days to the exact Monday-based Planner day", () => {
    expect(plannerRestDays([5, 0])).toEqual([4, 6]);
  });
  it("requires both explicit preview and durable activation, without production defaults", () => {
    expect(studentWorkspaceEnabled({})).toBe(false);
    expect(
      studentWorkspaceEnabled({ PLANNER_V2_DURABLE_CORE_ENABLED: "true" })
    ).toBe(false);
    expect(
      studentWorkspaceEnabled({
        PLANNER_V2_DURABLE_CORE_ENABLED: "true",
        PLANNER_V2_STUDENT_WORKSPACE_ENABLED: "true",
      })
    ).toBe(true);
  });
  it("admits role-specific effort without reducing natural strategy or downstream capacity", () => {
    const resources = ResourcePolicySchema.parse({
      ...studentResourcePolicy(),
      authorizationDigest: "a".repeat(64),
    });
    expect(resources.roles.STRATEGIST.format).toBe("TEXT");
    expect(
      Object.values(resources.roles).every(
        (r) => r.call.completionTokens === 65536
      )
    ).toBe(true);
    expect(resources.roles.RESEARCH.effort).toBe("LOW");
    expect(resources.roles.TRANSLATOR.effort).toBe("LOW");
    expect(resources.roles.STRATEGIST.effort).toBe("HIGH");
    expect(resources.roles.REVIEWER.effort).toBe("HIGH");
    const legacy=studentResourcePolicy(undefined,"student-preview-v1");
    expect(Object.values(legacy.roles).every(r=>r.effort==="HIGH")).toBe(true);
    expect(legacy.policyId).not.toBe(resources.policyId);
    expect(legacy.root).toEqual(resources.root);
    expect(resources.root.calls).toBe(48);
    expect(resources.journeyVersion).toBe(1);
    expect(
      StudentGenerationSchema.safeParse({
        action: "GENERATE",
        profile: "student-preview-v1",
        consent: false,
        request: {},
      }).success
    ).toBe(false);
  });
  it("checks local worker health only and never calls a model during preflight", async () => {
    vi.stubEnv("PLANNER_V2_DURABLE_CORE_ENABLED", "true");
    vi.stubEnv("PLANNER_V2_STUDENT_WORKSPACE_ENABLED", "true");
    vi.stubEnv("DEEPSEEK_API_KEY", "unpaid-test-only");
    const fetch = vi.fn(async (input: string) => {
      expect(input).toContain("127.0.0.1");
      return Response.json({
        ready: true,
        compatible: true,
        compilerVersions: [1, 2],
      });
    });
    vi.stubGlobal("fetch", fetch);
    expect((await studentReadiness()).ready).toBe(true);
    expect(fetch.mock.calls[0][0]).toBe("http://127.0.0.1:8081/ready");
  });
  it("normalizes only exact selected-plan aliases and rejects foreign, invented or duplicate identities", () => {
    expect(plan.intent.scope[0].modelRef).toBe("scope_electricity");
    expect(
      parseUnderstandingReview(review, run, plan).scopeBindings[0].scopeRefs
    ).toEqual(["scope_electricity"]);
    for (const ref of [
      "plan_2:scope_electricity",
      "plan_1:scope_999",
      "plan_1:Scope_1",
    ])
      expect(() =>
        parseUnderstandingReview(
          {
            ...review,
            scopeBindings: [{ ...review.scopeBindings[0], scopeRefs: [ref] }],
          },
          run,
          plan
        )
      ).toThrow();
  });
  it("retains historical v2 local-only interpretation and selected-plan v3 inventory", () => {
    const old = {
      ...run,
      input: { ...run.input, verificationVersion: 2 as const },
    };
    expect(() => parseUnderstandingReview(review, old, plan)).toThrow();
    expect(understandingInstructions(old).verification).not.toContain(
      "Reference protocol v3"
    );
    expect(understandingInstructions(run).verification).toContain(
      "ONLY the selected plan"
    );
    expect(
      understandingVerificationPacket(
        run,
        plan,
        {
          planRef: "plan_1",
          sourceRefs: [],
          extraction: {
            claims: [],
            identities: [],
            completeSourceIds: [],
            gaps: [],
            answer: "No external claims",
          },
        },
        [],
        []
      )
    ).toHaveProperty("referenceInventory.planRef", "plan_1");
  });
  it("treats unreadable mutation acknowledgements as uncertain rather than resetting a request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("bad response", { status: 200 }))
    );
    await expect(
      workspaceRequest("/workspace", { action: "NOTE" })
    ).rejects.toMatchObject({ uncertain: true });
    expect(new WorkspaceRequestError("unpaid", true).uncertain).toBe(true);
  });
});
