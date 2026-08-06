import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

// Zod Schema to validate incoming data
const registerSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  name: z.string().min(1, "Name is required"),
  username: z.string().min(3, "Username must be at least 3 characters").max(20).regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores"),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validation = registerSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid data", details: validation.error.format() },
        { status: 400 }
      );
    }

    const { email, password, name, username } = validation.data;

    // Check if a user with this email already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return NextResponse.json(
        { error: "A scholar with this email already exists" },
        { status: 400 }
      );
    }

    // Check if username is taken
    const existingUsername = await prisma.user.findUnique({ where: { username } });
    if (existingUsername) {
      return NextResponse.json(
        { error: "This username is already taken" },
        { status: 400 }
      );
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create the user with default RPG stats
    const newUser = await prisma.user.create({
      data: {
        email,
        username: username.toLowerCase(),
        password: hashedPassword,
        name,
        privacy: {
          create: {} // Generates default privacy settings automatically
        }
      },
    });

    // Send a welcome system message from "The System"
    await prisma.systemMessage.create({
      data: {
        userId: newUser.id,
        content:
          "[SYSTEM NOTIFICATION]\n\nYou have been granted the qualifications of a Player.\nWelcome, E-Rank Scholar. Your journey begins now.\n\nSet your first Goal to receive your Daily Quests.",
        type: "INFO",
      },
    });

    return NextResponse.json(
      { message: "Scholar registered successfully!" },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
