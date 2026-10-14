import { expect, it } from "vitest";
import { getWeeklyBounds, calculateWeeklyStreak } from "@/lib/game-engine";
import { storedStudySeconds, studySessionIsRunning } from "@/lib/session-math";
import { normalizeFocusTimestamp, deriveMemberTimer } from "@/lib/focus-party-types";

it("uses accepted focus seconds and explicit paused state in read models", () => {
  const paused = { executionState: "PAUSED", durationSeconds: 301, durationMinutes: 99, startedAt: new Date(0), endedAt: null };
  expect(storedStudySeconds(paused)).toBe(301); expect(studySessionIsRunning(paused)).toBe(false);
  expect(studySessionIsRunning({ ...paused, executionState: "RUNNING" })).toBe(true);
});
it("keeps UTC PostgreSQL party anchors independent of device timezone", () => {
  expect(normalizeFocusTimestamp("2026-10-14T09:00:00")).toBe("2026-10-14T09:00:00.000Z");
  expect(deriveMemberTimer(10, "2026-10-14T09:00:00", "FOCUSING", Date.parse("2026-10-14T09:01:00Z")).liveSeconds).toBe(70);
});
it("uses local Monday midnight in timezones beyond UTC+12", () => {
  const bounds = getWeeklyBounds(new Date("2026-10-12T04:00:00Z"), "Pacific/Kiritimati");
  expect(bounds.weekKey).toBe("2026-W42"); expect(bounds.weekStart.toISOString()).toBe("2026-10-11T10:00:00.000Z");
  expect(bounds.weekEnd.toISOString()).toBe("2026-10-18T09:59:59.999Z");
});
it("handles ISO-year rollover and consecutive weeks after a 53-week year", () => {
  expect(getWeeklyBounds(new Date("2025-12-29T12:00:00Z")).weekKey).toBe("2026-W01");
  expect(calculateWeeklyStreak("2026-W53", "2027-W01", 8)).toEqual({ newStreak: 9, freezeUsed: false });
});
