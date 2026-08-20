import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { NotificationPreferencesSchema } from "@/lib/notification-preferences";
import {
  getDbNotificationPreferences,
  setDbNotificationPreferences,
} from "@/lib/db-notification-preferences";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const payload = await getSession(req);
    if (!payload || !payload.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const preferences = await getDbNotificationPreferences(payload.userId as number);
    return NextResponse.json({ preferences }, { status: 200 });
  } catch (error) {
    console.error("GET /api/notifications/preferences error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const payload = await getSession(req);
    if (!payload || !payload.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = payload.userId as number;
    const body = await req.json();

    const parseResult = NotificationPreferencesSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const currentPrefs = await getDbNotificationPreferences(userId);
    const updatedPrefs = {
      ...currentPrefs,
      ...parseResult.data,
    };

    const preferences = await setDbNotificationPreferences(userId, updatedPrefs);

    return NextResponse.json(
      { success: true, message: "Alert preferences updated successfully", preferences },
      { status: 200 }
    );
  } catch (error) {
    console.error("PATCH /api/notifications/preferences error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  return PATCH(req);
}
