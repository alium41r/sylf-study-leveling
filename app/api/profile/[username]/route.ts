import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getProfileDossier } from "@/lib/profile-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, props: { params: Promise<{ username: string }> }) {
  try {
    const params = await props.params;
    const { username } = params;

    if (!username) {
      return NextResponse.json({ error: "Username is required" }, { status: 400 });
    }

    // Optional Authentication (viewer might be a guest or logged-in user)
    let viewerId: number | null = null;
    const authHeader = req.headers.get("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      const payload = await verifyToken(token);
      if (payload) {
        viewerId = payload.userId as number;
      }
    }

    const result = await getProfileDossier(username, viewerId);

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      profile: result.profile,
      relationship: result.relationship,
      permissions: result.permissions,
      privacySettings: result.privacySettings,
    }, { status: 200 });

  } catch (error) {
    console.error("GET /api/profile/[username] error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
