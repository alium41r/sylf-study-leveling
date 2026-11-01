import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/auth";
import { endCurrentAuthSession } from "@/lib/auth-session-service";

export async function POST(req: NextRequest) {
  // Clearing the cookie only clears this browser's copy, so end the session itself.
  await endCurrentAuthSession(req);

  const response = NextResponse.json(
    { success: true, message: "Logged out successfully." },
    { status: 200 }
  );

  response.cookies.set(AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });

  return response;
}
