import { expect, it } from "vitest";
import { boundSylvieToolResult } from "@/lib/ai/sylvie/tool-context";
it("preserves small results, identifiers and dates", () => {
  const value = { totalQuests: 1, quests: [{ id: 7, title: "Physics", scheduledFor: "2026-10-15", completedAt: new Date("2026-10-15T00:00:00Z") }] };
  expect(boundSylvieToolResult(value)).toEqual({ ...value, quests: [{ ...value.quests[0], completedAt: "2026-10-15T00:00:00.000Z" }] });
});
it("bounds large/escaped results and discloses incomplete context without new AI calls", () => {
  const input = { totalQuests: 1000, quests: Array.from({ length: 1000 }, (_, id) => ({ id, title: "Physics", description: "\u0000".repeat(5000) })) };
  const result = boundSylvieToolResult(input) as { contextTruncated: boolean; data: typeof input };
  expect(result.contextTruncated).toBe(true); expect(result.data.totalQuests).toBe(1000); expect(result.data.quests[0].id).toBe(0);
  expect(JSON.stringify(result).length).toBeLessThanOrEqual(8000);
});
