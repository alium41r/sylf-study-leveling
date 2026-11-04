import { describe, expect, it } from "vitest";
import { attemptSettled, buildIntent, newPlannerKey, STUDENT_SPENDING_LIMIT_USD } from "./planner";

const details = { title: " Maths ", goal: " Pass the exam ", deadline: "2027-05-01", topics: ["Algebra", " ", "Calculus"], timezone: "Europe/London", restDays: [0, 6], dailyMinutes: 90, startMinute: 960, endMinute: 1200 };

describe("buildIntent", () => {
  it("turns the student's Sunday-first rest days into the planner's Monday-first weekdays", () => {
    const intent = buildIntent(details, () => "key");
    expect(intent.availability.restWeekdays).toEqual([6, 5]);
    expect(intent.availability.dailyCeilingMinutes).toEqual([90, 90, 90, 90, 90, 0, 0]);
    expect(intent.availability.studyWindows.weekly.map((window) => window.weekday)).toEqual([0, 1, 2, 3, 4]);
  });
  it("drops empty topics, trims text and writes a fixed deadline only when there is one", () => {
    const intent = buildIntent(details, () => "key");
    expect(intent.title).toBe("Maths");
    expect(intent.scope.map((item) => item.title)).toEqual(["Algebra", "Calculus"]);
    expect(buildIntent({ ...details, deadline: "" }, () => "key").deadline).toEqual({ kind: "NONE" });
  });
});

describe("newPlannerKey", () => {
  it("matches the server's key pattern and differs between calls", () => {
    const a = newPlannerKey();
    expect(a).toMatch(/^[A-Za-z0-9_-]{8,100}$/);
    expect(newPlannerKey(() => 0.123456, () => 1)).not.toBe(newPlannerKey(() => 0.654321, () => 1));
  });
});

describe("attemptSettled", () => {
  it("is false only while a run is queued or running", () => {
    expect(["QUEUED", "RUNNING"].map(attemptSettled)).toEqual([false, false]);
    expect(["NEEDS_DECISION", "SUCCEEDED", "FAILED", "CANCELLED", "SUPERSEDED", undefined].every(attemptSettled)).toBe(true);
  });
  it("keeps the student ceiling the web uses", () => expect(STUDENT_SPENDING_LIMIT_USD).toBe(1.75));
});
