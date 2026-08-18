import { expect, test, describe, beforeAll, afterAll, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/cron/daily-briefing/route";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      groupBy: vi.fn(),
      findMany: vi.fn(),
    },
    dailyBriefingLog: {
      updateMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/ai/daily-briefing-service", () => ({
  DailyBriefingService: {
    generateDailyBriefing: vi.fn().mockResolvedValue({ success: true }),
  },
}));

describe("Phase 5C - Cron Route Tests", () => {
  let mockReq: NextRequest;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-secret";
    mockReq = {
      headers: new Headers({
        authorization: "Bearer test-secret",
      }),
    } as unknown as NextRequest;
  });

  test("rejects invalid cron secret", async () => {
    const badReq = {
      headers: new Headers({
        authorization: "Bearer wrong-secret",
      }),
    } as unknown as NextRequest;
    
    const response = await GET(badReq);
    expect(response.status).toBe(401);
  });

  test("identifies active timezones and skips inactive ones", async () => {
    // Mock user timezones
    vi.mocked(prisma.user.groupBy).mockResolvedValue([
      { _count: { timezone: 1 }, timezone: "Asia/Karachi" },
      { _count: { timezone: 1 }, timezone: "America/New_York" },
      { _count: { timezone: 1 }, timezone: "Invalid/Timezone" },
      { _count: { timezone: 1 }, timezone: "UTC" },
    ] as any);

    // If no one is at 6 AM, it should return a message
    // We can mock Intl.DateTimeFormat to control the hour
    const originalDateTimeFormat = Intl.DateTimeFormat;
    
    const mockFormat = vi.fn().mockImplementation((date) => {
      // Just simulate everything returns '5' except "Asia/Karachi" which returns '6'
      return "5"; 
    });

    vi.stubGlobal("Intl", {
      ...Intl,
      DateTimeFormat: function(locale: string, options: any) {
        if (options?.hour === "numeric") {
          return {
            format: (d: Date) => {
              if (options.timeZone === "Invalid/Timezone") throw new Error("Invalid timezone");
              return options.timeZone === "Asia/Karachi" ? "6" : "5";
            }
          };
        }
        return new originalDateTimeFormat(locale, options);
      }
    });

    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 1, timezone: "Asia/Karachi" }
    ] as any);

    vi.mocked(prisma.dailyBriefingLog.updateMany).mockResolvedValue({ count: 0 } as any);
    vi.mocked(prisma.dailyBriefingLog.create).mockResolvedValue({} as any);

    const response = await GET(mockReq);
    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(data.message).toContain("Processed 1 briefings");

    // Verify findMany was called with only Asia/Karachi (since Invalid fallback UTC was 5)
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          timezone: { in: ["Asia/Karachi"] }
        })
      })
    );

    vi.unstubAllGlobals();
  });
});
