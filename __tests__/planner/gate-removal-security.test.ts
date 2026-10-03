// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { GET as listPlansRoute } from "@/app/api/planner/route";
import { GET as planDetailRoute } from "@/app/api/planner/[id]/route";
import { POST as generationRoute } from "@/app/api/planner/generate/route";
import { GET as recoverRoute } from "@/app/api/planner/recover/[key]/route";
import { POST as createIntakeRoute } from "@/app/api/planner/intake/route";
import { GET as readIntakeRoute, PATCH as patchIntakeRoute } from "@/app/api/planner/intake/[id]/route";
import { POST as intakeActionRoute } from "@/app/api/planner/intake/[id]/action/route";
import { GET as capabilitiesRoute } from "@/app/api/planner/capabilities/route";

/**
 * The feature gate is gone. These tests exist to prove what it did *not* take with it.
 *
 * Every Planner Modes route used to pass through `requireEnabled()` on its way to the
 * work. Removing it removed one availability check and nothing else: a request with no
 * cookie session is still refused before any planner code runs, and the refusal is a
 * 401 — not a 404, which is what the gate used to return and what "not found" would
 * disguise an authorization failure as.
 *
 * This suite needs no database: the refusal happens before any query.
 */

vi.mock("@/lib/auth-server", () => ({
  getSession: vi.fn(async () => null),
}));

const unauthorized = new Request("http://localhost/api/planner/test", { method: "POST" });

const cases: [string, () => Promise<Response>][] = [
  ["GET /api/planner", () => listPlansRoute(new Request("http://localhost/api/planner"))],
  [
    "GET /api/planner/[id]",
    () => planDetailRoute(new Request("http://localhost/api/planner/x"), { params: Promise.resolve({ id: "x" }) }),
  ],
  ["POST /api/planner/generate", () => generationRoute(unauthorized)],
  [
    "GET /api/planner/recover/[key]",
    () => recoverRoute(new Request("http://localhost/api/planner/recover/k"), { params: Promise.resolve({ key: "k" }) }),
  ],
  ["POST /api/planner/intake", () => createIntakeRoute(unauthorized)],
  [
    "GET /api/planner/intake/[id]",
    () => readIntakeRoute(new Request("http://localhost/api/planner/intake/x"), { params: Promise.resolve({ id: "x" }) }),
  ],
  [
    "PATCH /api/planner/intake/[id]",
    () => patchIntakeRoute(new Request("http://localhost/api/planner/intake/x", { method: "PATCH" }), { params: Promise.resolve({ id: "x" }) }),
  ],
  [
    "POST /api/planner/intake/[id]/action",
    () => intakeActionRoute(unauthorized, { params: Promise.resolve({ id: "x" }) }),
  ],
];

describe("Planner routes after the feature gate removal", () => {
  it.each(cases)("%s refuses an unauthenticated caller with 401", async (_name, call) => {
    const response = await call();
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("UNAUTHORIZED");
    // Never cacheable, whatever the outcome.
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("answers capabilities with an error rather than a disabled feature", async () => {
    const response = await capabilitiesRoute(new Request("http://localhost/api/planner/capabilities"));
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error?: { code?: string }; enabled?: boolean };
    // There is no `enabled: false` state left to confuse with "the feature is off".
    expect(body.enabled).toBeUndefined();
    expect(body.error?.code).toBe("UNAUTHORIZED");
  });
});

describe("nothing requires the removed flag", () => {
  it("has no availability gate left in the planner server surface", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const path = await import("node:path");
    const dir = path.resolve(process.cwd(), "lib/planner/server");
    const files = readdirSync(dir).filter((name) => name.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      const source = readFileSync(path.join(dir, file), "utf8");
      expect(source, file).not.toMatch(/requireEnabled|PLANNER_MODES_ENABLED/);
    }
  });

  it("loads the planner server modules without any planner environment variable", async () => {
    // If a module still depended on the flag, importing it here would have to fail or
    // branch; the import succeeding is the assertion that nothing reads it.
    expect(process.env.PLANNER_MODES_ENABLED).toBeUndefined();
    const core = await import("@/lib/planner/server/core");
    expect(core).not.toHaveProperty("requireEnabled");
    const intake = await import("@/lib/planner/server/intake");
    expect(typeof intake.createIntake).toBe("function");
  });
});
