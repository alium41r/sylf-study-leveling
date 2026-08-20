import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isNotificationAllowed } from "@/lib/notification-preferences";
import { getDbNotificationPreferences } from "@/lib/db-notification-preferences";

export const dynamic = "force-dynamic";

const NOTIFICATION_TYPES = [
  "WARNING",
  "REWARD",
  "LEVEL_UP",
  "STREAK",
  "SYSTEM",
  "INFO",
  "QUEST",
  "USER",
  "DAILY_BRIEFING",
] as const;

export async function GET(req: NextRequest) {
  try {
    const payload = await getSession(req);
    if (!payload || !payload.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = payload.userId as number;
    const preferences = await getDbNotificationPreferences(userId);

    // Master Switch: If alerts are silenced, return empty list
    if (!preferences.masterEnabled) {
      return NextResponse.json([], { status: 200 });
    }

    let rawNotifications: any[] = [];
    try {
      rawNotifications = await prisma.systemMessage.findMany({
        where: {
          userId,
          type: {
            in: [...NOTIFICATION_TYPES],
          },
        },
        select: {
          id: true,
          content: true,
          type: true,
          read: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
    } catch (dbError: any) {
      console.warn("Transient database connection error in /api/notifications, returning empty list:", dbError?.message || dbError);
      return NextResponse.json([], { status: 200 });
    }

    // Apply granular user preferences filter
    const filtered = rawNotifications.filter((n) =>
      isNotificationAllowed(n.type, n.content, preferences)
    );

    return NextResponse.json(filtered.slice(0, 15), { status: 200 });
  } catch (error) {
    console.error("GET /api/notifications error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const payload = await getSession(req);
    if (!payload || !payload.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = payload.userId as number;

    // Mark all unread notifications as read
    await prisma.systemMessage.updateMany({
      where: {
        userId,
        type: {
          in: [...NOTIFICATION_TYPES],
        },
        read: false,
      },
      data: {
        read: true,
      },
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("PATCH /api/notifications error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const payload = await getSession(req);
    if (!payload || !payload.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = payload.userId as number;

    // Delete all notifications for the user
    await prisma.systemMessage.deleteMany({
      where: {
        userId,
        type: {
          in: [...NOTIFICATION_TYPES],
        },
      },
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("DELETE /api/notifications error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
