import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { AuthProviderType } from "@/lib/provider-types";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.userId;

    const connectedAccounts = await prisma.connectedAccount.findMany({
      where: { userId },
      select: {
        provider: true,
        providerEmail: true,
        providerUsername: true,
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
          username: linkedAccount.providerUsername,
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
