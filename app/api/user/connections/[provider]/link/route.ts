import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-server";
import { AuthProviderType } from "@/lib/provider-types";

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ provider: string }> }
) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const params = await props.params;
    const providerStr = params.provider.toUpperCase();

    if (!Object.values(AuthProviderType).includes(providerStr as AuthProviderType)) {
      return NextResponse.json({ error: "Invalid provider specified" }, { status: 400 });
    }

    const provider = providerStr as AuthProviderType;

    // TODO: Implement actual OAuth linking flow.
    // This would typically involve generating a state parameter, storing it in a secure HTTP-only cookie or session,
    // and returning an authorization URL for the client to redirect to.

    return NextResponse.json(
      { 
        message: "OAuth flow placeholder. Future implementation will return an authorization URL.",
        provider
      },
      { status: 501 } // Not Implemented
    );
  } catch (error) {
    console.error("Link Provider Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
