import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { initializeUserProfile } from "@/lib/auth-service";
import { AUTH_COOKIE_OPTIONS } from "@/lib/auth";

const registerSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  name: z.string().min(1, "Name is required"),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(20, "Username must be at most 20 characters")
    .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores"),
  timezone: z.string().optional(),
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

    const { email, password, name, username, timezone } = validation.data;

    const { user, token } = await initializeUserProfile({
      email,
      username,
      name,
      password,
      timezone,
      isOAuth: false,
    });

    const response = NextResponse.json(
      {
        message: "Scholar registered successfully!",
        token,
        user,
      },
      { status: 201 }
    );

    response.cookies.set({
      ...AUTH_COOKIE_OPTIONS,
      value: token,
    });

    return response;
  } catch (error: any) {
    const errorMessage = error?.message || "Internal server error";
    const status = errorMessage.includes("already exists") || errorMessage.includes("taken") ? 400 : 500;
    return NextResponse.json({ error: errorMessage }, { status });
  }
}
