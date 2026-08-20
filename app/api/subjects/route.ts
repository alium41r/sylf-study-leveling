import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { TimezoneService } from "@/lib/timezone-service";

async function getUserId(req: NextRequest): Promise<number | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.split(" ")[1];
  try {
    const payload = await verifyToken(token);
    if (payload && payload.userId) {
      return payload.userId as number;
    }
    return null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    });
    const timezone = user?.timezone || "UTC";
    const todayStart = TimezoneService.getStartOfDayUTC(timezone);

    // We want to fetch subjects and calculate today's duration for each
    const subjects = await prisma.subject.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        color: true,
        sessions: {
          where: {
            startedAt: {
              gte: todayStart,
            },
          },
          select: {
            durationMinutes: true,
            durationSeconds: true,
            endedAt: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const enriched = subjects.map((sub: any) => {
      const todaySeconds = sub.sessions.reduce((acc: number, session: any) => {
        if (!session.endedAt) return acc;
        return acc + (session.durationSeconds || (session.durationMinutes * 60) || 0);
      }, 0);

      return {
        id: sub.id,
        name: sub.name,
        color: sub.color,
        todaySeconds,
      };
    });

    return NextResponse.json(enriched);
  } catch (error) {
    console.error("GET subjects error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    if (!body.name) {
      return NextResponse.json(
        { error: "Subject name is required" },
        { status: 400 }
      );
    }

    const subject = await prisma.subject.create({
      data: {
        userId,
        name: body.name,
        color: body.color || "#7c3aed",
      },
    });

    return NextResponse.json({ ...subject, todaySeconds: 0 }, { status: 201 });
  } catch (error) {
    console.error("POST subject error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
