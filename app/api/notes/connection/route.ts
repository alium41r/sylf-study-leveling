import { prisma } from "@/lib/prisma";
import { beginOAuth, publicBinding } from "@/lib/notes/server/connections";
import {
  configured,
  requireOrigin,
  NotesServerError,
} from "@/lib/notes/server/security";
import { owner, body, json, failure } from "@/lib/notes/server/http";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const userId = await owner(req);
    const connection = await prisma.notesConnection.findUnique({
      where: { userId },
    });
    return json({
      configured: configured(),
      connection: connection?.verifiedAt ? publicBinding(connection) : null,
    });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(req: Request) {
  try {
    requireOrigin(req);
    const userId = await owner(req);
    const input = await body(req);
    if (input.action !== "connect" || Object.keys(input).length !== 1)
      throw new NotesServerError("Unknown Notes connection command.");
    return json({ url: await beginOAuth(userId, req) });
  } catch (error) {
    return failure(error);
  }
}
