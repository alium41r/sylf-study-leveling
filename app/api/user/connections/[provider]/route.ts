import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { AuthProviderType } from "@/lib/provider-types";

export async function DELETE(
  req: NextRequest,
  props: { params: Promise<{ provider: string }> }
) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.split(" ")[1];
    const payload = await verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = payload.userId as number;

    const params = await props.params;
    const providerStr = params.provider.toUpperCase();

    if (!Object.values(AuthProviderType).includes(providerStr as AuthProviderType)) {
      return NextResponse.json({ error: "Invalid provider specified" }, { status: 400 });
    }

    const provider = providerStr as AuthProviderType;

    // Retrieve user and their connected accounts to ensure safety
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { connectedAccounts: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const targetAccount = user.connectedAccounts.find((acc) => acc.provider === provider);

    if (!targetAccount) {
      return NextResponse.json(
        { error: "Account is not connected" },
        { status: 400 }
      );
    }

    // Safety check: Prevent removing the last authentication method
    // In this schema, password is required, but if they signed up via OAuth it might be a dummy hash.
    // We assume if password is empty or a specific dummy value (e.g., "OAUTH_USER"), they rely on OAuth.
    // Right now, any password length < 10 might be considered unsafe if it's a dummy, but standard bcrypt is 60 chars.
    // Let's assume if password exists and is valid length, it's a real password.
    const hasPassword = user.password && user.password.length > 0 && user.password !== "OAUTH_ONLY";
    const otherProviders = user.connectedAccounts.filter((acc) => acc.provider !== provider);

    if (!hasPassword && otherProviders.length === 0) {
      return NextResponse.json(
        { 
          error: "Action denied: You cannot disconnect your only login method. Please set a password or link another account first." 
        },
        { status: 403 }
      );
    }

    // Safely delete the connection
    await prisma.connectedAccount.delete({
      where: { id: targetAccount.id },
    });

    return NextResponse.json({ success: true, message: `${provider} account disconnected successfully.` }, { status: 200 });
  } catch (error) {
    console.error("Disconnect Provider Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
