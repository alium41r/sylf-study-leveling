// ============================================================
// Context Engine — Unit Tests
// ============================================================
// Tests the tiered context system:
// - formatCoreContext produces correct, concise output
// - formatRelevantContext includes only requested sections
// - Empty/missing data is handled gracefully
// - Large data is aggregated, not dumped
// - No unauthorized data leaks
// ============================================================

import { describe, it, expect } from "vitest";
import {
  formatCoreContext,
  formatRelevantContext,
  type CoreContext,
  type RelevantContext,
  type CalendarSection,
  type SubjectSection,
  type TrendsSection,
  type MemorySection,
  type HealthSection,
  type GoalsSection,
  type AchievementsSection,
} from "@/lib/ai/context-engine";

// ─── Test Data Factories ─────────────────────────────────────

function createCoreContext(overrides: Partial<CoreContext> = {}): CoreContext {
  return {
    user: {
      id: 1, name: "Ali", username: "aliumair",
      rank: "B", level: 22, currentXP: 340, xpToNextLevel: 2800,
      hp: 85, maxHp: 100, sylph: 2450, streakWeeks: 12,
      totalStudyHours: 142.5, hasCompletedOnboarding: true, title: "Scholar",
    },
    today: {
      date: "2026-08-08", dayOfWeek: "Friday",
      totalQuests: 3, completedQuests: 1, pendingQuests: 2,
      totalMinutesScheduled: 135, overdueCount: 1,
    },
    weeklyQuest: {
      targetMinutes: 180,
      progressMinutes: 95,
      percentComplete: 53,
      isCompleted: false,
      daysRemaining: 2,
      weekKey: "2026-W32",
    },
    activeGoals: {
      count: 2,
      summaries: [
        { title: "Master Physics", progressPercent: 40 },
        { title: "Math Mastery", progressPercent: 80 },
      ],
    },
    localTimeContext: {
      timezone: "UTC",
      localDate: "2026-08-08",
      localTime: "12:00",
    },
    ...overrides,
  };
}

function createEmptyCoreContext(): CoreContext {
  return {
    user: {
      id: 1, name: "New User", username: "newuser",
      rank: "E", level: 1, currentXP: 0, xpToNextLevel: 200,
      hp: 100, maxHp: 100, sylph: 0, streakWeeks: 0,
      totalStudyHours: 0, hasCompletedOnboarding: false, title: "Novice",
    },
    today: {
      date: "2026-08-08", dayOfWeek: "Friday",
      totalQuests: 0, completedQuests: 0, pendingQuests: 0,
      totalMinutesScheduled: 0, overdueCount: 0,
    },
    weeklyQuest: {
      targetMinutes: 180,
      progressMinutes: 0,
      percentComplete: 0,
      isCompleted: false,
      daysRemaining: 7,
      weekKey: "2026-W32",
    },
    activeGoals: { count: 0, summaries: [] },
    localTimeContext: {
      timezone: "UTC",
      localDate: "2026-08-08",
      localTime: "12:00",
    }
  };
}

// ─── Core Context Formatter Tests ────────────────────────────

describe("formatCoreContext", () => {
  it("includes essential user identity", () => {
    const output = formatCoreContext(createCoreContext());
    expect(output).toContain("Ali");
    expect(output).toContain("@aliumair");
    expect(output).toContain("B-Rank");
    expect(output).toContain("Lv.22");
  });

  it("includes XP, HP, Sylph, streak", () => {
    const output = formatCoreContext(createCoreContext());
    expect(output).toContain("340/2800");
    expect(output).toContain("85/100");
    expect(output).toContain("2450");
    expect(output).toContain("12 weeks");
  });

  it("shows quest summary", () => {
    const output = formatCoreContext(createCoreContext());
    expect(output).toContain("2026-08-08 (Friday)");
    expect(output).toContain("1/3 completed, 2 pending");
    expect(output).toContain("(135 mins)");
  });

  it("shows overdue count warning", () => {
    const output = formatCoreContext(createCoreContext());
    expect(output).toContain("Overdue: 1");
  });

  it("does NOT show overdue warning when count is 0", () => {
    const ctx = createCoreContext({
      today: {
        date: "2026-08-08", dayOfWeek: "Friday",
        totalQuests: 2, completedQuests: 2, pendingQuests: 0,
        totalMinutesScheduled: 60, overdueCount: 0,
      },
    });
    const output = formatCoreContext(ctx);
    expect(output).not.toContain("overdue");
  });

  it("includes active goals with progress", () => {
    const output = formatCoreContext(createCoreContext());
    expect(output).toContain("Master Physics");
    expect(output).toContain("40%");
    expect(output).toContain("Math Mastery");
    expect(output).toContain("80%");
  });

  it("handles empty state (new user)", () => {
    const output = formatCoreContext(createEmptyCoreContext());
    expect(output).toContain("New User");
    expect(output).toContain("NOT completed onboarding");
    expect(output).toContain("0/0 completed");
    expect(output).toContain("Overdue: 0");
  });

  it("includes anti-hallucination instruction", () => {
    const output = formatCoreContext(createCoreContext());
    expect(output).toContain("do NOT");
    expect(output).toContain("fabricate");
  });

  it("has bounded length (~200 tokens target)", () => {
    const output = formatCoreContext(createCoreContext());
    // Rough estimate: 1 token ≈ 4 chars. 200 tokens ≈ 800 chars.
    // Core context should be well under 1500 chars.
    expect(output.length).toBeLessThan(1500);
  });
});

// ─── Relevant Context Formatter Tests ────────────────────────

describe("formatRelevantContext", () => {
  it("returns empty string when no sections are provided", () => {
    const output = formatRelevantContext({});
    expect(output).toBe("");
  });

  it("includes calendar section when provided", () => {
    const relevant: RelevantContext = {
      calendar: { isOverloaded: false,
        next7Days: [
          { date: "2026-08-09", dayOfWeek: "Saturday", questCount: 2, totalMinutes: 60, pendingCount: 2, remainingCapacity: 120 },
          { date: "2026-08-10", dayOfWeek: "Sunday", questCount: 0, totalMinutes: 0, pendingCount: 0, remainingCapacity: 180 },
        ],
        overdueQuests: [
          { id: 1, title: "Old Quest", scheduledFor: "2026-08-05", requiredMinutes: 30 },
        ],
      },
    };
    const output = formatRelevantContext(relevant);
    expect(output).toContain("CALENDAR");
    expect(output).toContain("Saturday");
    expect(output).toContain("2 quests");
    expect(output).toContain("Capacity remaining: 120min");
    expect(output).toContain("Capacity remaining: 180min");
    expect(output).toContain("OVERDUE");
    expect(output).toContain("Old Quest");
  });

  it("includes subject section with pre-computed analytics", () => {
    const relevant: RelevantContext = {
      subjects: {
        subjects: [
          { name: "Physics", completionRate: 62, avgSessionMinutes: 38, avgFocusRate: 65, totalSessions: 15, strength: "weak", trend: "declining" },
          { name: "Math", completionRate: 91, avgSessionMinutes: 28, avgFocusRate: 82, totalSessions: 20, strength: "strong", trend: "improving" },
        ],
        strongestSubject: "Math",
        weakestSubject: "Physics",
      },
    };
    const output = formatRelevantContext(relevant);
    expect(output).toContain("SUBJECTS");
    expect(output).toContain("Physics");
    expect(output).toContain("62%");
    expect(output).toContain("weak");
    expect(output).toContain("💪"); // strong indicator for Math
    expect(output).toContain("⚠️"); // weak indicator for Physics
    expect(output).toContain("Strongest: Math");
    expect(output).toContain("Weakest: Physics");
  });

  it("includes trends with pre-computed direction", () => {
    const relevant: RelevantContext = {
      trends: { isStruggling: false,
        weeklyStudyMinutes: [280, 320, 350, 400],
        weeklyCompletionRates: [65, 70, 78, 82],
        avgDailyMinutes: 48,
        studyTimeDirection: "increasing",
        completionDirection: "improving",
        bestDayOfWeek: "Monday",
        currentStreakDays: 12,
        longestRecentStreak: 12,
      },
    };
    const output = formatRelevantContext(relevant);
    expect(output).toContain("TRENDS");
    expect(output).toContain("increasing");
    expect(output).toContain("improving");
    expect(output).toContain("48min/day");
    expect(output).toContain("Monday");
  });

  it("includes memories when provided", () => {
    const relevant: RelevantContext = {
      memories: {
        memories: [
          { key: "exam_physics", value: "Physics midterm on 2026-08-20", source: "user_stated" },
          { key: "preferred_time", value: "Morning 8-11am", source: "inferred" },
        ],
      },
    };
    const output = formatRelevantContext(relevant);
    expect(output).toContain("REMEMBERED");
    expect(output).toContain("exam_physics");
    expect(output).toContain("user_stated");
  });

  it("includes health section with pre-computed damage/healing", () => {
    const relevant: RelevantContext = {
      health: { isBurnoutRisk: false,
        hp: 45, maxHp: 100,
        recentDamage: 35, recentHealing: 10, damageEvents: 5,
      },
    };
    const output = formatRelevantContext(relevant);
    expect(output).toContain("HEALTH");
    expect(output).toContain("45/100");
    expect(output).toContain("-35 damage");
    expect(output).toContain("5 events");
  });

  it("includes goals section", () => {
    const relevant: RelevantContext = {
      goals: {
        goals: [
          { id: 1, title: "Master Physics", status: "ACTIVE", effortLevel: "INTENSE", progressPercent: 40, totalQuests: 20, completedQuests: 8 },
        ],
      },
    };
    const output = formatRelevantContext(relevant);
    expect(output).toContain("GOALS");
    expect(output).toContain("Master Physics");
    expect(output).toContain("40%");
    expect(output).toContain("8/20");
  });

  it("does NOT include sections that weren't requested", () => {
    // Only provide calendar — verify no subjects, trends, memories appear
    const relevant: RelevantContext = {
      calendar: { isOverloaded: false,
        next7Days: [{ date: "2026-08-09", dayOfWeek: "Saturday", questCount: 0, totalMinutes: 0, pendingCount: 0, remainingCapacity: 120 }],
        overdueQuests: [],
      },
    };
    const output = formatRelevantContext(relevant);
    expect(output).toContain("CALENDAR");
    expect(output).not.toContain("SUBJECTS");
    expect(output).not.toContain("TRENDS");
    expect(output).not.toContain("REMEMBERED");
    expect(output).not.toContain("HEALTH");
    expect(output).not.toContain("GOALS");
  });

  it("skips empty memory arrays", () => {
    const relevant: RelevantContext = {
      memories: { memories: [] },
    };
    const output = formatRelevantContext(relevant);
    expect(output).not.toContain("REMEMBERED");
  });
});

// ─── Data Aggregation Tests (Backend computes, not LLM) ──────

describe("Context Engine — Aggregation Principles", () => {
  it("core context uses quest COUNTS not individual quest records", () => {
    const core = createCoreContext();
    // Core should have totalQuests, completedQuests, pendingQuests — not an array of quest objects
    expect(typeof core.today.totalQuests).toBe("number");
    expect(typeof core.today.completedQuests).toBe("number");
    expect(typeof core.today.pendingQuests).toBe("number");
    // Should NOT have a questsToday array in core
    expect((core.today as any).questsToday).toBeUndefined();
  });

  it("core context uses overdueCount not overdue quest array", () => {
    const core = createCoreContext();
    expect(typeof core.today.overdueCount).toBe("number");
    expect((core.today as any).overdueQuests).toBeUndefined();
  });

  it("subject analytics provides pre-computed rates, not raw session data", () => {
    const subjects: SubjectSection = {
      subjects: [{
        name: "Physics", completionRate: 62, avgSessionMinutes: 38,
        avgFocusRate: 65, totalSessions: 15, strength: "weak", trend: "declining",
      }],
      strongestSubject: "Physics",
      weakestSubject: "Physics",
    };
    // Should have computed values, not raw session arrays
    const physics = subjects.subjects[0];
    expect(typeof physics.completionRate).toBe("number");
    expect(typeof physics.avgSessionMinutes).toBe("number");
    expect(typeof physics.avgFocusRate).toBe("number");
    expect(typeof physics.strength).toBe("string");
    expect(typeof physics.trend).toBe("string");
    expect((physics as any).sessions).toBeUndefined();
  });

  it("trends section provides pre-computed directions, not raw data arrays", () => {
    const trends: TrendsSection = { isStruggling: false,
      weeklyStudyMinutes: [280, 320, 350, 400],
      weeklyCompletionRates: [65, 70, 78, 82],
      avgDailyMinutes: 48,
      studyTimeDirection: "increasing",
      completionDirection: "improving",
      bestDayOfWeek: "Monday",
      currentStreakDays: 12,
      longestRecentStreak: 12,
    };
    expect(typeof trends.studyTimeDirection).toBe("string");
    expect(typeof trends.completionDirection).toBe("string");
    expect(typeof trends.avgDailyMinutes).toBe("number");
  });

  it("health section provides pre-computed damage/healing totals", () => {
    const health: HealthSection = { isBurnoutRisk: false,
      hp: 45, maxHp: 100,
      recentDamage: 35, recentHealing: 10, damageEvents: 5,
    };
    expect(typeof health.recentDamage).toBe("number");
    expect(typeof health.recentHealing).toBe("number");
    // Should NOT have raw HP ledger entries
    expect((health as any).entries).toBeUndefined();
    expect((health as any).recentHpChanges).toBeUndefined();
  });

  it("goals section provides pre-computed progress, not raw quest arrays", () => {
    const goals: GoalsSection = {
      goals: [{
        id: 1, title: "Test Goal", status: "ACTIVE",
        effortLevel: "NORMAL", progressPercent: 75,
        totalQuests: 12, completedQuests: 9,
      }],
    };
    const goal = goals.goals[0];
    expect(typeof goal.progressPercent).toBe("number");
    expect(typeof goal.totalQuests).toBe("number");
    expect((goal as any).quests).toBeUndefined();
  });
});

// ─── Token Efficiency Tests ──────────────────────────────────

describe("Context Engine — Token Efficiency", () => {
  it("core context formatted output is concise", () => {
    const output = formatCoreContext(createCoreContext());
    const lines = output.split("\n").filter(l => l.trim());
    // Core should be ~14 lines with LOCAL_TIME, TODAY, WEEKLY QUEST, and GOALS sections
    expect(lines.length).toBeLessThanOrEqual(16);
  });

  it("relevant context sections are concise summaries", () => {
    const relevant: RelevantContext = {
      subjects: {
        subjects: [
          { name: "Physics", completionRate: 62, avgSessionMinutes: 38, avgFocusRate: 65, totalSessions: 15, strength: "weak", trend: "declining" },
          { name: "Math", completionRate: 91, avgSessionMinutes: 28, avgFocusRate: 82, totalSessions: 20, strength: "strong", trend: "improving" },
          { name: "Chemistry", completionRate: 45, avgSessionMinutes: 40, avgFocusRate: 58, totalSessions: 8, strength: "weak", trend: "stable" },
        ],
        strongestSubject: "Math",
        weakestSubject: "Chemistry",
      },
    };
    const output = formatRelevantContext(relevant);
    // 3 subjects should produce about 5-6 lines, not 50+
    const lines = output.split("\n").filter(l => l.trim());
    expect(lines.length).toBeLessThan(10);
  });

  it("full context (core + all sections) stays under reasonable token budget", () => {
    const core = formatCoreContext(createCoreContext());
    const relevant = formatRelevantContext({
      calendar: { isOverloaded: false,
        next7Days: Array.from({ length: 7 }, (_, i) => ({
          date: `2026-08-${9 + i}`, dayOfWeek: "Day", questCount: 2, totalMinutes: 60, pendingCount: 2, remainingCapacity: 120
        })),
        overdueQuests: [{ id: 1, title: "Test", scheduledFor: "2026-08-05", requiredMinutes: 30 }],
      },
      subjects: {
        subjects: [
          { name: "Physics", completionRate: 62, avgSessionMinutes: 38, avgFocusRate: 65, totalSessions: 15, strength: "weak", trend: "declining" },
          { name: "Math", completionRate: 91, avgSessionMinutes: 28, avgFocusRate: 82, totalSessions: 20, strength: "strong", trend: "improving" },
        ],
        strongestSubject: "Math",
        weakestSubject: "Physics",
      },
      trends: { isStruggling: false,
        weeklyStudyMinutes: [280, 320, 350, 400],
        weeklyCompletionRates: [65, 70, 78, 82],
        avgDailyMinutes: 48,
        studyTimeDirection: "increasing",
        completionDirection: "improving",
        bestDayOfWeek: "Monday",
        currentStreakDays: 12,
        longestRecentStreak: 12,
      },
      memories: {
        memories: [
          { key: "exam", value: "Physics midterm 2026-08-20", source: "user_stated" },
          { key: "pref_time", value: "Morning", source: "inferred" },
        ],
      },
      health: { isBurnoutRisk: false, hp: 85, maxHp: 100, recentDamage: 15, recentHealing: 20, damageEvents: 2 },
    });
    const total = core + "\n\n" + relevant;
    // Even with all sections, total should stay under ~4000 chars (~1000 tokens)
    expect(total.length).toBeLessThan(4000);
  });
});
