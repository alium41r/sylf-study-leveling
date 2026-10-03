import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { clearClientCache, fetchCachedJSON } from "@/lib/client-data-cache";
import { commitPlanner, invalidatePlannerCommit, recoverPlannerCommit } from "@/lib/planner/client";
import type { CommitRequest } from "@/lib/planner/contracts";
import { readBody } from "@/lib/planner/server/http";

describe("planner client boundary and cache", () => {
  beforeEach(() => { clearClientCache(); vi.unstubAllGlobals(); });
  it("shared client import graph cannot reach server or provider modules", () => {
    const seen = new Set<string>();
    function walk(file: string) {
      if (seen.has(file)) return; seen.add(file);
      const text = readFileSync(file, "utf8");
      expect(text).not.toMatch(/@prisma|server-only|next\/headers|next\/server|ai\/providers|ai\/orchestrator|node:crypto/);
      const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest);
      ast.forEachChild(node => {
        if (!ts.isImportDeclaration(node) || node.importClause?.isTypeOnly || !ts.isStringLiteral(node.moduleSpecifier)) return;
        const name = node.moduleSpecifier.text;
        if (!name.startsWith(".")) return;
        const target = path.resolve(path.dirname(file), name) + ".ts";
        if (existsSync(target)) walk(target);
      });
    }
    for (const file of ["client", "contracts", "capacity", "dates", "constraints", "done", "priority", "semantic", "smart-setup", "exam-fields", "exam-policy", "exam-client", "telemetry", "scope-topic", "roadmap-fields", "roadmap-policy", "roadmap-progress", "expansion-fields", "expansion-policy", "transport", "roadmap-client"])
      walk(path.resolve(`lib/planner/${file}.ts`));
    expect(seen.size).toBeGreaterThan(5);
    for (const file of ["core", "revisions", "materialize", "operations", "mutation-guards", "http", "generation", "expansion", "running"])
      expect(readFileSync(`lib/planner/server/${file}.ts`, "utf8")).toMatch(/^import "server-only";/);
    // The semantic critic and its targeted repair are provider-side only.
    for (const file of ["exam", "critic", "repair", "pipeline", "roadmap", "expansion"]) expect(readFileSync(`lib/ai/planner/${file}.ts`, "utf8")).toMatch(/^import "server-only";/);
  });
  it("never persists planner drafts, even with an opaque storage key", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ private: "syllabus" })); vi.stubGlobal("fetch", fetcher);
    await fetchCachedJSON("/api/planner/private", {}, { storageKey: "opaque-key" });
    expect(localStorage.getItem("sylf_cache:opaque-key")).toBeNull();
  });
  it("invalidates all affected surfaces only after durable success, without fetching", async () => {
    const endpoints = ["quests", "goals", "calendar", "dashboard", "planner", "user/stats", "ai-usage"];
    const fetcher = vi.fn(async () => Response.json({ cached: true })); vi.stubGlobal("fetch", fetcher);
    for (const p of endpoints) await fetchCachedJSON(`/api/${p}`);
    fetcher.mockImplementation(async () => Response.json({ error: "conflict" }, { status: 409 }));
    await expect(commitPlanner("id", {} as CommitRequest)).rejects.toThrow("PLANNER_CONFLICT");
    const failedCalls = fetcher.mock.calls.length;
    for (const p of endpoints) await fetchCachedJSON(`/api/${p}`);
    expect(fetcher).toHaveBeenCalledTimes(failedCalls);
    fetcher.mockImplementation(async () => Response.json({ schemaVersion: 1, items: [] }));
    await commitPlanner("id", {} as CommitRequest);
    const afterCommit = fetcher.mock.calls.length;
    expect(afterCommit).toBe(failedCalls + 1);
    for (const p of endpoints) await fetchCachedJSON(`/api/${p}`);
    expect(fetcher).toHaveBeenCalledTimes(afterCommit + 6); // Quota unaffected.
    const options = (fetcher.mock.calls as unknown as [string, RequestInit][])[failedCalls][1];
    expect(options.credentials).toBe("include"); expect(new Headers(options.headers).has("Authorization")).toBe(false);
  });
  it("does not revive stale data from a fetch that began before confirmation", async () => {
    let resolve!: (value: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(r => { resolve = r; })));
    const inFlight = fetchCachedJSON("/api/quests"); invalidatePlannerCommit();
    resolve(Response.json({ old: true })); expect(await inFlight).toBeNull();
    const fresh = vi.fn().mockResolvedValue(Response.json({ current: true })); vi.stubGlobal("fetch", fresh);
    expect(await fetchCachedJSON("/api/quests")).toEqual({ current: true }); expect(fresh).toHaveBeenCalledOnce();
  });
  it("recovers a committed receipt without sending another commit", async () => {
    const receipt = { schemaVersion: 1, items: [{ questId: 12 }] };
    const fetcher = vi.fn().mockResolvedValue(Response.json({ confirmationReceipt: receipt })); vi.stubGlobal("fetch", fetcher);
    expect(await recoverPlannerCommit("plan", "operation")).toEqual(receipt);
    expect(fetcher.mock.calls[0][0]).toContain("kind=confirmation"); expect(fetcher).toHaveBeenCalledOnce();
  });
  it("bounds streamed bodies even without Content-Length and rejects malformed JSON", async () => {
    await expect(readBody(new Request("http://localhost", { method: "POST", body: "x".repeat(262145) }))).rejects.toMatchObject({ status: 400, code: "PAYLOAD_TOO_LARGE" });
    await expect(readBody(new Request("http://localhost", { method: "POST", body: "{" }))).rejects.toMatchObject({ status: 400, code: "INVALID_BODY" });
  });
});
