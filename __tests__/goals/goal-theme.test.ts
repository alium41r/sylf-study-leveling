import { describe, it, expect } from "vitest";
import {
  GOAL_COLOR_TOKENS,
  GOAL_COLOR_PALETTE,
  resolveGoalColor,
  isGoalColorToken,
  formatGoalDeadline,
  formatTargetDateLabel,
  daysUntil,
  targetDateToUtc,
  targetDateToWeeks,
} from "../../lib/goal-theme";

describe("Objective Accent Theme Engine", () => {
  it("exposes the curated 6-token cyber/neon palette", () => {
    expect(GOAL_COLOR_TOKENS).toEqual([
      "EMERALD",
      "CYAN",
      "BLUE",
      "VIOLET",
      "ROSE",
      "AMBER",
    ]);

    for (const token of GOAL_COLOR_TOKENS) {
      const theme = GOAL_COLOR_PALETTE[token];
      expect(theme.swatch).toMatch(/^#[0-9a-f]{6}$/i);
      expect(theme.base).toMatch(/^#[0-9a-f]{6}$/i);
      expect(theme.light).toMatch(/^#[0-9a-f]{6}$/i);
      expect(theme.dark).toMatch(/^#[0-9a-f]{6}$/i);
      expect(theme.dim).toMatch(/^rgba\(/);
      expect(theme.mid).toMatch(/^rgba\(/);
      expect(theme.name.length).toBeGreaterThan(0);
    }
  });

  it("resolves known tokens and falls back to EMERALD for unknown ones", () => {
    expect(resolveGoalColor("ROSE")).toBe(GOAL_COLOR_PALETTE.ROSE);
    expect(resolveGoalColor("BLUE").base).toBe(GOAL_COLOR_PALETTE.BLUE.base);
    // Unknown / missing tokens must never crash the UI
    expect(resolveGoalColor("NEON_PINK").swatch).toBe(GOAL_COLOR_PALETTE.EMERALD.swatch);
    expect(resolveGoalColor(null).swatch).toBe(GOAL_COLOR_PALETTE.EMERALD.swatch);
    expect(resolveGoalColor(undefined).swatch).toBe(GOAL_COLOR_PALETTE.EMERALD.swatch);
    expect(isGoalColorToken("ROSE")).toBe(true);
    expect(isGoalColorToken("rose")).toBe(false);
    expect(isGoalColorToken("")).toBe(false);
  });
});

describe("Exact Timeline Countdown (Workstream A)", () => {
  const ref = new Date("2026-08-23T12:00:00Z");

  it("computes whole calendar-day differences", () => {
    expect(daysUntil("2026-08-23T00:00:00Z", ref)).toBe(0);
    expect(daysUntil("2026-08-24T00:00:00Z", ref)).toBe(1);
    expect(daysUntil("2026-08-22T00:00:00Z", ref)).toBe(-1);
  });

  it("formats day-level granularity — never '1 weeks'", () => {
    expect(formatGoalDeadline("2026-08-23T00:00:00Z", ref)).toBe("Due today");
    expect(formatGoalDeadline("2026-08-24T00:00:00Z", ref)).toBe("Due tomorrow");
    expect(formatGoalDeadline("2026-08-26T00:00:00Z", ref)).toBe("3 days left");
    expect(formatGoalDeadline("2026-08-29T00:00:00Z", ref)).toBe("6 days left");
  });

  it("switches to exact week labels from 7 days out", () => {
    expect(formatGoalDeadline("2026-08-30T00:00:00Z", ref)).toBe("1 week left");
    expect(formatGoalDeadline("2026-09-09T00:00:00Z", ref)).toBe("2 weeks left");
    expect(formatGoalDeadline("2026-10-14T00:00:00Z", ref)).toBe("7 weeks left");
  });

  it("reports overdue deadlines with exact day counts", () => {
    expect(formatGoalDeadline("2026-08-22T00:00:00Z", ref)).toBe("Overdue by 1 day");
    expect(formatGoalDeadline("2026-08-20T00:00:00Z", ref)).toBe("Overdue by 3 days");
  });

  it("labels exact calendar target dates", () => {
    expect(formatTargetDateLabel(new Date("2026-08-31T00:00:00Z"))).toBe("Target: Aug 31, 2026");
    expect(formatTargetDateLabel("2026-12-25")).toBe("Target: Dec 25, 2026");
    expect(formatTargetDateLabel(null)).toBeNull();
    expect(formatTargetDateLabel(undefined)).toBeNull();
  });

  it("converts YYYY-MM-DD into its UTC representational midnight", () => {
    const d = targetDateToUtc("2026-08-31");
    expect(d.toISOString()).toBe("2026-08-31T00:00:00.000Z");
    expect(() => targetDateToUtc("31/08/2026")).toThrow();
    expect(() => targetDateToUtc("2026-8-31")).toThrow();
  });

  it("derives legacy week counts from exact dates (min 1)", () => {
    expect(targetDateToWeeks(new Date("2026-08-24T00:00:00Z"), ref)).toBe(1);
    expect(targetDateToWeeks(new Date("2026-08-30T00:00:00Z"), ref)).toBe(1);
    expect(targetDateToWeeks(new Date("2026-09-06T00:00:00Z"), ref)).toBe(2);
    expect(targetDateToWeeks(new Date("2026-08-23T00:00:00Z"), ref)).toBe(1);
  });
});
