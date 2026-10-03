import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../lib/prisma";
import { StudyScheduleService } from "../../lib/study-schedule-service";

describe("Floating Rest Day Engine (Service)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(prisma.floatingRestDay, "findUnique").mockResolvedValue(null);
  });

  describe("isUserRestDay — unified rest day resolver", () => {
    it("returns true when the day-of-week matches the fixed rest schedule", async () => {
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
        id: 1,
        restDays: [0],
        timezone: "UTC",
      } as any);
      // 2026-08-23 is a Sunday (day 0)
      expect(await StudyScheduleService.isUserRestDay(1, "2026-08-23")).toBe(true);
      // 2026-08-24 is a Monday — not a fixed rest day
      expect(await StudyScheduleService.isUserRestDay(1, "2026-08-24")).toBe(false);
    });

    it("returns true when a FloatingRestDay record exists for the date", async () => {
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
        id: 1,
        restDays: [],
        timezone: "UTC",
      } as any);
      vi.spyOn(prisma.floatingRestDay, "findUnique").mockResolvedValue({
        id: 1,
        userId: 1,
        dateKey: "2026-08-25",
      } as any);

      expect(await StudyScheduleService.isUserRestDay(1, "2026-08-25")).toBe(true);
      // Without a record, the same date is an active study day
      vi.mocked(prisma.floatingRestDay.findUnique).mockResolvedValue(null);
      expect(await StudyScheduleService.isUserRestDay(1, "2026-08-25")).toBe(false);
    });

    it("accepts Date objects and resolves them in the user's timezone", async () => {
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
        id: 1,
        restDays: [],
        timezone: "UTC",
      } as any);
      vi.spyOn(prisma.floatingRestDay, "findUnique").mockResolvedValue(null);

      expect(
        await StudyScheduleService.isUserRestDay(1, new Date("2026-08-25T10:30:00Z"))
      ).toBe(false);
    });

    it("fails closed when the floating lookup is unavailable", async () => {
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
        id: 1,
        restDays: [],
        timezone: "UTC",
      } as any);
      // floatingRestDay table access fails
      vi.spyOn(prisma.floatingRestDay, "findUnique").mockRejectedValue(
        new Error("table unavailable")
      );
      await expect(StudyScheduleService.isUserRestDay(1, "2026-08-25")).rejects.toThrow("table unavailable");
    });
  });

  describe("getIsoWeekKey", () => {
    it("produces Monday-Sunday aligned ISO week keys", () => {
      // 2026-08-17 (Mon) and 2026-08-23 (Sun) share one ISO week...
      const monday = StudyScheduleService.getIsoWeekKey("2026-08-17");
      const sunday = StudyScheduleService.getIsoWeekKey("2026-08-23");
      // ...while the next Monday starts a new week
      const nextMonday = StudyScheduleService.getIsoWeekKey("2026-08-24");

      expect(monday).toMatch(/^\d{4}-W\d{2}$/);
      expect(monday).toBe(sunday);
      expect(nextMonday).not.toBe(monday);
    });
  });

  describe("findNextActiveDateKey", () => {
    it("skips fixed AND floating rest days day-by-day", () => {
      // from 2026-08-25 (Tue); restDays [0] (Sun), floating: 2026-08-27 (Thu)
      const next = StudyScheduleService.findNextActiveDateKey(
        "2026-08-25",
        [0],
        new Set(["2026-08-27"])
      );
      // 26 (Wed) active -> next day after 25 is 26
      expect(next).toBe("2026-08-26");

      const next2 = StudyScheduleService.findNextActiveDateKey(
        "2026-08-26",
        [0],
        new Set(["2026-08-27"])
      );
      // 27 (Thu) is floating-rest -> 28 (Fri) is active
      expect(next2).toBe("2026-08-28");
    });

    it("returns null when no active day exists within the lookahead", () => {
      const allFloating = new Set([
        "2026-08-26",
        "2026-08-27",
        "2026-08-28",
        "2026-08-29",
      ]);
      const next = StudyScheduleService.findNextActiveDateKey(
        "2026-08-25",
        [],
        allFloating,
        3
      );
      expect(next).toBeNull();
    });
  });

  describe("cascadeQuestShifts — automatic quest shifting", () => {
    it("shifts uncompleted quests to the next available active date", async () => {
      const tx = {
        $queryRaw: vi.fn().mockResolvedValue([]),
        user: { findUnique: vi.fn().mockResolvedValue({ restDays: [0] }) },
        quest: {
          findMany: vi.fn().mockResolvedValue([
            { id: 11, title: "Past Paper", scheduledFor: "2026-08-25" },
            { id: 12, title: "Flashcards", scheduledFor: "2026-08-25" },
          ]),
          update: vi.fn().mockImplementation(({ where, data }) =>
            Promise.resolve({ id: where.id, ...data })
          ),
        },
        floatingRestDay: {
          findMany: vi.fn().mockResolvedValue([{ dateKey: "2026-08-26" }]),
        },
        // The Planner's linked-Quest guard always runs now, so the transaction double
        // must model the table it reads: nothing here is planner-linked.
        plannerQuestLink: { findFirst: vi.fn().mockResolvedValue(null) },
      };

      // Designate 2026-08-25 (Tue) as a floating rest day; 26 (Wed) is also
      // floating -> both quests land on 2026-08-27 (Thu).
      const shifts = await StudyScheduleService.cascadeQuestShifts(1, "2026-08-25", { tx });

      expect(shifts).toHaveLength(2);
      expect(shifts[0]).toMatchObject({
        questId: 11,
        title: "Past Paper",
        oldDate: "2026-08-25",
        newDate: "2026-08-27",
      });
      expect(shiftDates(tx)).toEqual(["2026-08-27", "2026-08-27"]);
    });

    it("ignores completed and failed quests", async () => {
      const tx = {
        $queryRaw: vi.fn().mockResolvedValue([]),
        user: { findUnique: vi.fn().mockResolvedValue({ restDays: [] }) },
        quest: {
          findMany: vi.fn().mockResolvedValue([]),
          update: vi.fn(),
        },
        floatingRestDay: { findMany: vi.fn().mockResolvedValue([]) },
        // The Planner's linked-Quest guard always runs now, so the transaction double
        // must model the table it reads: nothing here is planner-linked.
        plannerQuestLink: { findFirst: vi.fn().mockResolvedValue(null) },
      };

      const shifts = await StudyScheduleService.cascadeQuestShifts(1, "2026-08-25", { tx });

      expect(shifts).toEqual([]);
      expect(tx.quest.update).not.toHaveBeenCalled();
    });
  });

  describe("getFloatingRestDayStatus", () => {
    it("reports weekly quota usage and addability", async () => {
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue({ id: 1, restDays: [] } as any);
      vi.spyOn(prisma.floatingRestDay, "findUnique").mockResolvedValue(null);
      vi.spyOn(prisma.floatingRestDay, "findMany").mockResolvedValue([
        { dateKey: "2026-08-17" },
      ] as any);

      // 2026-08-17 (Mon) and 2026-08-19 (Wed) share ISO week 2026-W34
      const status = await StudyScheduleService.getFloatingRestDayStatus(1, "2026-08-19");

      expect(status.isFloatingRest).toBe(false);
      expect(status.isFixedRest).toBe(false);
      expect(status.weekUsage).toBe(1);
      expect(status.weekQuota).toBe(1);
      expect(status.canAdd).toBe(false);
    });

    it("flags fixed rest days and existing floating days", async () => {
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue({ id: 1, restDays: [0] } as any);
      vi.spyOn(prisma.floatingRestDay, "findUnique").mockResolvedValue({
        id: 9,
        userId: 1,
        dateKey: "2026-08-23",
      } as any);
      vi.spyOn(prisma.floatingRestDay, "findMany").mockResolvedValue([]);

      const status = await StudyScheduleService.getFloatingRestDayStatus(1, "2026-08-23");

      expect(status.isFixedRest).toBe(true);
      expect(status.isFloatingRest).toBe(true);
      expect(status.canAdd).toBe(false);
    });
  });
});

function shiftDates(tx: any): string[] {
  return tx.quest.update.mock.calls.map((c: any[]) => c[0].data.scheduledFor);
}
