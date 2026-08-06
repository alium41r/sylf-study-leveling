import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { PrivacyLevel } from "@/lib/privacy-types";

// Reusable function to ensure a user has a privacy record
async function getOrCreatePrivacy(userId: number) {
  let privacy = await prisma.userPrivacy.findUnique({ where: { userId } });
  if (!privacy) {
    privacy = await prisma.userPrivacy.create({ data: { userId } });
  }
  return privacy;
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.split(" ")[1];
    const payload = await verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const privacy = await getOrCreatePrivacy(payload.userId as number);
    return NextResponse.json(privacy, { status: 200 });
  } catch (error) {
    console.error("Privacy GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.split(" ")[1];
    const payload = await verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const body = await req.json();
    
    // Validate that all provided values are valid PrivacyLevel enums
    const validLevels = Object.values(PrivacyLevel) as string[];
    
    // Whitelist allowed fields to prevent arbitrary updates
    const allowedFields = [
      "profileVisibility",
      "showOnlineStatus",
      "showCurrentSession",
      "showStudyHours",
      "showRank",
      "showAchievements",
      "allowFriendRequests",
      "allowDirectMessages"
    ];

    const updateData: Record<string, string> = {};

    for (const key of Object.keys(body)) {
      if (allowedFields.includes(key)) {
        if (!validLevels.includes(body[key])) {
          return NextResponse.json({ error: `Invalid setting value for ${key}. Allowed: ${validLevels.join(', ')}` }, { status: 400 });
        }
        updateData[key] = body[key];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ message: "No valid settings provided." }, { status: 400 });
    }

    const updatedPrivacy = await prisma.userPrivacy.upsert({
      where: { userId: payload.userId as number },
      update: updateData,
      create: { userId: payload.userId as number, ...updateData },
    });

    return NextResponse.json({ message: "Privacy settings updated", data: updatedPrivacy }, { status: 200 });
  } catch (error) {
    console.error("Privacy PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
