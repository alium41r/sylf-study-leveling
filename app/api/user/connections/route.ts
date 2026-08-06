import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { AuthProviderType } from "@/lib/provider-types";

export async function GET(req: NextRequest) {
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

    const connectedAccounts = await prisma.connectedAccount.findMany({
      where: { userId },
      select: {
        provider: true,
        providerEmail: true,
        createdAt: true,
      },
    });

    const providersList = Object.values(AuthProviderType);

    const connections = providersList.map((provider) => {
      const linkedAccount = connectedAccounts.find((acc) => acc.provider === provider);
      if (linkedAccount) {
        return {
          provider,
          isLinked: true,
          email: linkedAccount.providerEmail,
          linkedAt: linkedAccount.createdAt,
        };
      }
      return {
        provider,
        isLinked: false,
      };
    });

    return NextResponse.json({ connections }, { status: 200 });
  } catch (error) {
    console.error("Fetch Connections Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
