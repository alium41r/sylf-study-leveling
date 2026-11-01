import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/planner/workspace/route";
import { getSession } from "@/lib/auth-server";
import { durablePlanner } from "@/lib/planner/v2/server/web";
vi.mock("@/lib/auth-server", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/planner/v2/server/web", () => ({ durablePlanner: vi.fn() }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});
describe("student workspace HTTP authority", () => {
  it("authenticates reads and writes before accessing an owned workspace", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    expect(
      (await GET(new Request("http://localhost/api/planner/workspace"))).status
    ).toBe(401);
    expect(
      (
        await POST(
          new Request("http://localhost/api/planner/workspace", {
            method: "POST",
            body: JSON.stringify({ action: "CREATE" }),
          })
        )
      ).status
    ).toBe(401);
    expect(durablePlanner).not.toHaveBeenCalled();
  });
  it("leaves preview mutations disabled when only the durable core is enabled", async () => {
    vi.mocked(getSession).mockResolvedValue({ userId: 12 } as Awaited<
      ReturnType<typeof getSession>
    >);
    vi.mocked(durablePlanner).mockReturnValue(
      {} as ReturnType<typeof durablePlanner>
    );
    vi.stubEnv("PLANNER_V2_DURABLE_CORE_ENABLED", "true");
    vi.stubEnv("PLANNER_V2_STUDENT_WORKSPACE_ENABLED", "false");
    const response = await POST(
      new Request("http://localhost/api/planner/workspace", {
        method: "POST",
        body: JSON.stringify({ action: "CREATE" }),
      })
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: { code: "WORKER_UNAVAILABLE" },
    });
  });
});
