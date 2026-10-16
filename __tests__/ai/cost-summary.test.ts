// @vitest-environment node
import { expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { aiUsageLog: { findMany } } }));
vi.mock("@/lib/auth-server", () => ({ getSession: async () => ({ userId: 7 }) }));
import { GET } from "@/app/api/ai-costs/route";
it("reports incomplete spend as unknown and exposes its known subtotal separately", async () => {
  const base = { feature: "chat", workload: "sylvie", createdAt: new Date(), rootRequestId: "root", provider: "deepseek", model: "deepseek-flash", cacheHitTokens: 0, requestId: "one" };
  findMany.mockResolvedValue([
    { ...base, promptTokens: 100, completionTokens: 50, reasoningTokens: 20, latencyMs: 100, outcome: "SUCCEEDED", usageKnown: true, cacheUsageKnown: true, estimatedCostUsd: 0.002 },
    { ...base, requestId: "two", promptTokens: 0, completionTokens: 0, reasoningTokens: null, latencyMs: 300, outcome: "FAILED", usageKnown: false, cacheUsageKnown: false, estimatedCostUsd: null },
  ]);
  const response = await GET(new NextRequest("http://localhost/api/ai-costs"));
  expect(response.status).toBe(200);
  const { today } = await response.json();
  expect(today).toMatchObject({ totalRequests: 2, logicalRequests: 1, promptTokens: 100, completionTokens: 50, reasoningTokens: 20, averageDispatchLatencyMs: 200,
    failedDispatches: 1, unknownUsageRequests: 1, unknownCacheRequests: 1, costUsd: null, knownCostUsd: 0.002, costComplete: false });
  expect(today.byModel[0]).toMatchObject({ costUsd: null, knownCostUsd: 0.002 });
});
