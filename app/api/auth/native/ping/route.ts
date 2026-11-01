import { NextResponse } from "next/server";

/** The smallest answer that proves this server is reachable. A native client asks while it believes it is offline. Touches no database. */
export function GET() {
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
