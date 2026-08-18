import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeChatTool } from "../../lib/ai/chat-tool-executor";
import { buildRelevantContext } from "../../lib/ai/context-engine";

vi.mock("../../lib/ai/context-engine", () => ({
  buildRelevantContext: vi.fn(),
}));

// We also need to mock prisma since chat-tool-executor imports it, even though we don't use it directly here.
vi.mock("../../lib/prisma", () => ({
  prisma: {}
}));

describe("Phase 3B: Analytics Tools", () => {
  const userId = 1;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getSubjectAnalyticsTool", () => {
    it("returns subject data when available", async () => {
      const mockSubjects = {
        subjects: [
          { name: "Math", completionRate: 85, avgSessionMinutes: 45, strength: "strong", trend: "improving" }
        ],
        strongestSubject: "Math",
        weakestSubject: null
      };
      
      vi.mocked(buildRelevantContext).mockResolvedValue({ subjects: mockSubjects } as any);
      
      const res = await executeChatTool("getSubjectAnalytics", {}, userId);
      expect(res).toEqual(mockSubjects);
      expect(buildRelevantContext).toHaveBeenCalledWith(userId, "calendar", ["subjects"]);
    });

    it("handles missing subject data", async () => {
      vi.mocked(buildRelevantContext).mockResolvedValue({} as any);
      
      const res = await executeChatTool("getSubjectAnalytics", {}, userId);
      expect(res.error).toBeDefined();
    });
  });

  describe("getPerformanceTrendsTool", () => {
    it("returns trend data when available", async () => {
      const mockTrends = {
        weeklyStudyMinutes: [100, 150, 200, 250],
        weeklyCompletionRates: [50, 60, 70, 80],
        avgDailyMinutes: 30,
        studyTimeDirection: "increasing",
        completionDirection: "improving",
        bestDayOfWeek: "Monday",
        currentStreakDays: 5,
        longestRecentStreak: 10
      };
      
      vi.mocked(buildRelevantContext).mockResolvedValue({ trends: mockTrends } as any);
      
      const res = await executeChatTool("getPerformanceTrends", {}, userId);
      expect(res).toEqual(mockTrends);
      expect(buildRelevantContext).toHaveBeenCalledWith(userId, "calendar", ["trends"]);
    });
  });

  describe("getDailyPatternTool", () => {
    it("extracts specific subset of trend data", async () => {
      const mockTrends = {
        weeklyStudyMinutes: [100, 150, 200, 250],
        weeklyCompletionRates: [50, 60, 70, 80],
        avgDailyMinutes: 45,
        studyTimeDirection: "increasing",
        completionDirection: "improving",
        bestDayOfWeek: "Tuesday",
        currentStreakDays: 12,
        longestRecentStreak: 14
      };
      
      vi.mocked(buildRelevantContext).mockResolvedValue({ trends: mockTrends } as any);
      
      const res = await executeChatTool("getDailyPattern", {}, userId);
      expect(res).toEqual({
        bestDayOfWeek: "Tuesday",
        avgDailyMinutes: 45,
        currentStreakDays: 12,
        longestRecentStreak: 14
      });
    });

    it("handles missing trend data gracefully", async () => {
      vi.mocked(buildRelevantContext).mockResolvedValue({} as any);
      
      const res = await executeChatTool("getDailyPattern", {}, userId);
      expect(res.error).toBeDefined();
    });
  });
});
