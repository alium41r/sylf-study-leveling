import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

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

    const userId = payload.userId as number;
    const body = await req.json();
    let { username, name, email } = body;

    // Sanitize inputs
    username = username?.trim();
    name = name?.trim();
    email = email?.trim();

    // Validate Username
    if (username !== undefined) {
      if (!username || !/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
        return NextResponse.json(
          { error: "Username must be 3-20 characters long and can only contain letters, numbers, and underscores." },
          { status: 400 }
        );
      }
    }

    // Validate Display Name
    if (name !== undefined) {
      if (!name || name.length > 30 || !/^[\w\s\-']+$/.test(name)) {
        return NextResponse.json(
          { error: "Display name must be 1-30 characters and can only contain letters, numbers, spaces, hyphens, and apostrophes." },
          { status: 400 }
        );
      }
    }

    // Validate Email
    if (email !== undefined) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!email || !emailRegex.test(email)) {
        return NextResponse.json(
          { error: "Please provide a valid email address." },
          { status: 400 }
        );
      }
    }

    // Get current user to compare
    const currentUser = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!currentUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const updates: any = {};

    if (username !== undefined && username !== currentUser.username) {
      // Check duplicate
      const existingUser = await prisma.user.findUnique({ where: { username } });
      if (existingUser) {
        return NextResponse.json({ error: "This username is already taken." }, { status: 409 });
      }
      updates.username = username;
    }

    if (email !== undefined && email !== currentUser.email) {
      // Check duplicate
      const existingEmail = await prisma.user.findUnique({ where: { email } });
      if (existingEmail) {
        return NextResponse.json({ error: "This email address is already registered." }, { status: 409 });
      }
      updates.email = email;
    }

    if (name !== undefined && name !== currentUser.name) {
      updates.name = name;
    }

    // If nothing changed
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ message: "No changes detected." }, { status: 200 });
    }

    // Apply updates
    await prisma.user.update({
      where: { id: userId },
      data: updates
    });

    return NextResponse.json({ message: "Account information updated successfully." }, { status: 200 });
  } catch (error) {
    console.error("Error updating account:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred while updating your account." },
      { status: 500 }
    );
  }
}
