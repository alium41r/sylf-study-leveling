import "server-only";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { NotesServerError, limitedRequest } from "./security";

export const json = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
export async function owner(req: Request) {
  const session = await getSession(req);
  if (!session)
    throw new NotesServerError("Sign in to unlock Notes.", 401, "AUTH");
  return session.userId;
}
export async function connectionFor(userId: number) {
  const connection = await prisma.notesConnection.findUnique({
    where: { userId },
  });
  if (!connection?.rootId || !connection.verifiedAt)
    throw new NotesServerError(
      "Connect Google Drive and verify your library first.",
      409,
      "AUTH"
    );
  return connection;
}
export async function body(req: Request) {
  return JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(await limitedRequest(req))
  );
}
export function failure(error: unknown) {
  const known = error instanceof NotesServerError;
  return NextResponse.json(
    {
      error: known
        ? error.message
        : "Notes could not complete this operation. Local data was retained; check server setup and try again.",
      code: known ? error.code : "NOTES_ERROR",
    },
    {
      status: known ? error.status : 503,
      headers: {
        "Cache-Control": "private, no-store",
        ...(known && error.retryAfter
          ? { "Retry-After": String(error.retryAfter) }
          : {}),
      },
    }
  );
}
