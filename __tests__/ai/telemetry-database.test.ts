// @vitest-environment node
// Explicitly opt in: uses the configured Supabase database, always rolls back
// synthetic users/receipts/messages, and blocks every provider/network call.
import { randomInt, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient, type Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({ transaction: null as Prisma.TransactionClient | null, providerAttempts: 0 }));
vi.mock("@/lib/prisma", () => ({
  prisma: new Proxy({}, {
    get(_target, property) {
      if (!state.transaction) throw new Error("DATABASE_PROBE_OUTSIDE_ROLLBACK");
      return Reflect.get(state.transaction, property);
    },
  }),
}));
vi.mock("@/lib/auth-server", async () => vi.importActual("@/lib/auth-server"));
vi.mock("@/lib/ai/providers/factory", () => ({ LLMFactory: { getAdapter: () => {
  state.providerAttempts++;
  throw new Error("PAID_PROVIDER_EXECUTION_BLOCKED");
} } }));

import { observeAiDispatch, withAiRequest } from "@/lib/ai/telemetry";
import { geminiUsage, openAIUsage } from "@/lib/ai/providers/usage";
import { AUTH_COOKIE_NAME, signToken } from "@/lib/auth";
import { GET as getCosts } from "@/app/api/ai-costs/route";
import { POST as chat } from "@/app/api/system-messages/chat/route";
import { GET as getMessages, POST as postMessage } from "@/app/api/system-messages/route";

describe.skipIf(process.env.SYLF_AI_DATABASE_VERIFY !== "1")("Supabase AI telemetry and chat (rollback only, no paid calls)", () => {
  let client: PrismaClient;
  let pool: Pool;
  const transport = vi.fn(() => { throw new Error("EXTERNAL_NETWORK_BLOCKED"); });

  beforeAll(() => {
    if (!process.env.DIRECT_URL) throw new Error("DIRECT_URL_REQUIRED");
    pool = new Pool({ connectionString: process.env.DIRECT_URL, max: 1, connectionTimeoutMillis: 8000 });
    client = new PrismaClient({ adapter: new PrismaPg(pool) });
    vi.stubEnv("JWT_SECRET", randomUUID() + randomUUID());
    vi.stubGlobal("fetch", transport);
  });
  afterAll(async () => {
    state.transaction = null;
    await client?.$disconnect();
    await pool?.end();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  async function rolledBack(action: (userId: number, transaction: Prisma.TransactionClient) => Promise<void>) {
    const userId = -randomInt(1, 1_000_000_000);
    const suffix = randomUUID();
    const rollback = new Error("INTENTIONAL_PROBE_ROLLBACK");
    try {
      await client.$transaction(async transaction => {
        state.transaction = transaction;
        await transaction.user.create({ data: { id: userId, email: `ai-probe-${suffix}@example.invalid`, username: `ai-probe-${suffix}` } });
        await action(userId, transaction);
        throw rollback;
      }, { timeout: 45_000, maxWait: 10_000 });
    } catch (error) { if (error !== rollback) throw error; }
    finally { state.transaction = null; }
    expect(await client.user.count({ where: { id: userId } })).toBe(0);
    expect(await client.aiUsageLog.count({ where: { userId } })).toBe(0);
    expect(await client.chatSession.count({ where: { userId } })).toBe(0);
    expect(await client.systemMessage.count({ where: { userId } })).toBe(0);
  }

  async function request(userId: number, path: string, body?: object) {
    const token = await signToken({ userId, tokenVersion: 1 }, "5m");
    return new NextRequest(`http://localhost${path}`, {
      method: body ? "POST" : "GET",
      headers: { cookie: `${AUTH_COOKIE_NAME}=${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }

  it("persists and settles correlated dispatches, prices usage and preserves unknown spend", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      await rolledBack(async (userId, transaction) => {
        await withAiRequest({ userId, feature: "chat", workload: "telemetry_verification" }, async () => {
          await observeAiDispatch("deepseek", "deepseek-flash", async () => {
            const pending = await transaction.aiUsageLog.findFirstOrThrow({ where: { userId } });
            expect(pending).toMatchObject({ accountingState: "DISPATCHED", usageKnown: false, latencyMs: null, estimatedCostUsd: null });
            return { model: "deepseek-flash", usage: openAIUsage({ prompt_tokens: 1000, completion_tokens: 200, prompt_cache_hit_tokens: 250, completion_tokens_details: { reasoning_tokens: 100 } }) };
          }, value => value);
          await observeAiDispatch("gemini", "gemini-2.5-flash", async () => ({ model: "gemini-2.5-flash", usage: geminiUsage({ promptTokenCount: 1000, candidatesTokenCount: 50, thoughtsTokenCount: 20, cachedContentTokenCount: 100 }) }), value => value);
          await expect(observeAiDispatch("groq", "openai/gpt-oss-120b", async () => { throw new Error("SYNTHETIC_FAILURE"); }, () => ({}))).rejects.toThrow("SYNTHETIC_FAILURE");
          await observeAiDispatch("gemini", "gemini-2.5-flash", async () => ({ model: "gemini-2.5-flash", usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 }, grounding: true }), value => value);
          await observeAiDispatch("deepseek", "unpriced-test-model", async () => ({ model: "unpriced-test-model", usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 } }), value => value);
        });
        const receipts = await transaction.aiUsageLog.findMany({ where: { userId }, orderBy: { dispatchIndex: "asc" } });
        expect(receipts).toHaveLength(5);
        expect(new Set(receipts.map(row => row.requestId)).size).toBe(5);
        expect(new Set(receipts.map(row => row.rootRequestId)).size).toBe(1);
        expect(receipts[0]).toMatchObject({ requestedModel: "deepseek-flash", modelVerified: true, promptTokens: 1000, completionTokens: 200, reasoningTokens: 100, cacheHitTokens: 250, usageKnown: true, cacheUsageKnown: true, estimatedCostUsd: 0.000467, outcome: "SUCCEEDED", accountingState: "SETTLED" });
        expect(receipts[1]).toMatchObject({ completionTokens: 70, reasoningTokens: 20, estimatedCostUsd: 0.000448 });
        expect(receipts[2]).toMatchObject({ outcome: "FAILED", usageKnown: false, estimatedCostUsd: null, accountingState: "UNKNOWN_SPEND" });
        expect(receipts[3].estimatedCostUsd).toBeNull();
        expect(receipts[4].estimatedCostUsd).toBeNull();
        expect(receipts.every(row => row.latencyMs !== null && row.pricingVersion !== null)).toBe(true);
        const response = await getCosts(await request(userId, "/api/ai-costs"));
        expect(response.status).toBe(200);
        expect((await response.json()).today).toMatchObject({ totalRequests: 5, logicalRequests: 1, reasoningTokens: 120, failedDispatches: 1, unknownCostRequests: 3, costUsd: null, knownCostUsd: 0.000915, costComplete: false });
        expect(warning).not.toHaveBeenCalled();
      });
    } finally { warning.mockRestore(); }
  }, 60_000);

  it("preserves cookie-authenticated concise chat, history and empty-cost reads without AI dispatches", async () => {
    await rolledBack(async (userId, transaction) => {
      expect((await chat(new NextRequest("http://localhost/api/system-messages/chat", { method: "POST", body: JSON.stringify({ message: "Short introduction to Sylf" }) }))).status).toBe(401);
      const response = await chat(await request(userId, "/api/system-messages/chat", { message: "Give me a very short introduction to Sylf." }));
      expect(response.status).toBe(200);
      const reply = await response.json();
      expect(reply.reply).toBe("Sylf helps you plan your studies, stay focused, and track your progress.");
      expect(reply.modelUsed).toBe("DETERMINISTIC");
      const history = await getMessages(await request(userId, `/api/system-messages?sessionId=${reply.sessionId}`));
      expect(history.status).toBe(200);
      expect((await history.json()).messages).toHaveLength(2);
      expect(await transaction.aiUsageLog.count({ where: { userId } })).toBe(0);
      expect(await transaction.userQuota.count({ where: { userId } })).toBe(0);
      const costs = await getCosts(await request(userId, "/api/ai-costs"));
      expect(costs.status).toBe(200);
      expect((await costs.json()).today).toMatchObject({ totalRequests: 0, costUsd: 0, costComplete: true });
      expect(state.providerAttempts).toBe(0);
      expect(transport).not.toHaveBeenCalled();
    });
  }, 60_000);

  it("isolates direct messages across accounts using the real database and cookie authentication", async () => {
    await rolledBack(async (userId, transaction) => {
      const suffix = randomUUID();
      const foreign = await transaction.user.create({ data: { id: userId - 1, email: `foreign-${suffix}@example.invalid`, username: `foreign-${suffix}` } });
      const otherChat = await transaction.chatSession.create({ data: { userId: foreign.id, title: "Synthetic isolated chat" } });
      expect((await postMessage(await request(userId, "/api/system-messages", { sessionId: otherChat.id, content: "Synthetic rejected message" }))).status).toBe(404);
      expect(await transaction.systemMessage.count({ where: { sessionId: otherChat.id } })).toBe(0);
      const own = await transaction.chatSession.create({ data: { userId, title: "Synthetic owned chat" } });
      expect((await postMessage(await request(userId, "/api/system-messages", { sessionId: own.id, content: "Synthetic accepted message" }))).status).toBe(200);
      expect(await transaction.systemMessage.count({ where: { sessionId: own.id, userId } })).toBe(1);
      expect(state.providerAttempts).toBe(0);
      expect(transport).not.toHaveBeenCalled();
    });
  }, 60_000);
});
