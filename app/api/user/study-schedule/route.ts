import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

const updateStudyScheduleSchema = z.object({
  dailyGoalMinutes: z.number().int().min(10).max(1440).optional(),
  restDays: z.array(z.number().int().min(0).max(6)).max(6).optional(),
  enableHpPenalty: z.boolean().optional(),
});

/**
 * GET /api/user/study-schedule
 * Returns the current study schedule configuration for the authenticated user.
 */
export async function GET(req: NextRequest) {
  try {
    const payload = await getSession(req);
    if (!payload || !payload.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = payload.userId as number;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        dailyGoalMinutes: true,
        restDays: true,
        enableHpPenalty: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json(
      {
        dailyGoalMinutes: user.dailyGoalMinutes ?? 120,
        restDays: user.restDays ?? [0],
        enableHpPenalty: user.enableHpPenalty ?? true,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("GET /api/user/study-schedule error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/user/study-schedule
 * Updates daily focus target, rest days array, and penalty preferences.
 */
export async function PATCH(req: NextRequest) {
  try {
    const payload = await getSession(req);
    if (!payload || !payload.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = payload.userId as number;
    const body = await req.json();
    const parsed = updateStudyScheduleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid schedule settings", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const data: Record<string, any> = {};

    if (parsed.data.dailyGoalMinutes !== undefined) {
      data.dailyGoalMinutes = parsed.data.dailyGoalMinutes;
    }
    if (parsed.data.restDays !== undefined) {
      // Deduplicate and sort
      data.restDays = Array.from(new Set(parsed.data.restDays)).sort((a, b) => a - b);
    }
    if (parsed.data.enableHpPenalty !== undefined) {
      data.enableHpPenalty = parsed.data.enableHpPenalty;
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data,
      select: {
        dailyGoalMinutes: true,
        restDays: true,
        enableHpPenalty: true,
      },
    });

    return NextResponse.json(updated, { status: 200 });
  } catch (error: any) {
    console.error("PATCH /api/user/study-schedule error:", error);
    return NextResponse.json({ error: error?.message || "Internal server error" }, { status: 500 });
  }
}
