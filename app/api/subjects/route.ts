import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

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
    // We want to fetch subjects and calculate today's duration for each
    const subjects = await prisma.subject.findMany({
      where: { userId },
      include: {
        sessions: {
          where: {
            startedAt: {
              // Very simple today check for demo
              gte: new Date(new Date().setHours(0, 0, 0, 0)),
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const enriched = subjects.map((sub: any) => {
      const todaySeconds = sub.sessions.reduce((acc: number, session: any) => {
        if (!session.endedAt) return acc;
        const start = session.startedAt.getTime();
        const end = session.endedAt.getTime();
        return acc + Math.floor((end - start) / 1000);
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
