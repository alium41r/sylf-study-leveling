import { NextResponse } from "next/server";
import { owner } from "@/lib/notes/server/http";
import { finishOAuth } from "@/lib/notes/server/connections";
import { publicOrigin } from "@/lib/notes/server/security";
export const maxDuration = 60;
export async function GET(req: Request) {
  try {
    const userId = await owner(req),
      params = new URL(req.url).searchParams,
      state = params.get("state"),
      code = params.get("code");
    if (!state || !code || state.length > 200 || code.length > 6000)
      throw new Error("Consent not completed");
    await finishOAuth(userId, req, state, code);
    return NextResponse.redirect(`${publicOrigin()}/notes?drive=connected`);
  } catch {
    return NextResponse.redirect(new URL("/notes?drive=failed", req.url));
  }
}
