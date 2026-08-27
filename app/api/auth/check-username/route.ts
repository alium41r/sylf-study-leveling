import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const username = searchParams.get("username")?.toLowerCase().trim();

    if (!username) {
      return NextResponse.json(
        { available: false, error: "Username is required." },
        { status: 400 }
      );
    }

    if (username.length < 3) {
      return NextResponse.json(
        { available: false, error: "Username must be at least 3 characters." },
        { status: 400 }
      );
    }

    if (username.length > 20) {
      return NextResponse.json(
        { available: false, error: "Username cannot exceed 20 characters." },
        { status: 400 }
      );
    }

    if (!/^[a-z0-9_]+$/.test(username)) {
      return NextResponse.json(
        { available: false, error: "Only lowercase letters, numbers, and underscores are allowed." },
        { status: 400 }
      );
    }

    const session = await getSession(req);
    const existingUser = await prisma.user.findUnique({
      where: { username },
      select: { id: true, username: true },
    });

    if (!existingUser) {
      return NextResponse.json(
        { available: true, message: "Username is available." },
        { status: 200 }
      );
    }

    // If the existing user is the current authenticated user checking their own username
    if (session && existingUser.id === session.userId) {
      return NextResponse.json(
        { available: true, message: "Username is currently yours." },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { available: false, error: "This username is already taken." },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Check Username API Error:", error);
    return NextResponse.json(
      { available: false, error: "Unable to verify username availability." },
      { status: 500 }
    );
  }
}
