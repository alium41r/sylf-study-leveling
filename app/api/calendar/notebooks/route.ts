import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth-server";
import { CalendarError } from "@/lib/calendar/personal-service";
import {
  readNoteRecognitions,
  saveNoteRecognition,
  deleteNoteRecognition,
  searchNotebooks,
} from "@/lib/calendar/notebook-service";
export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
async function handle(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return json({ error: "Unauthorized" }, 401);
  try {
    if (req.method === "GET") {
      const note = req.nextUrl.searchParams.get("noteId");
      if (note)
        return json({
          recognitions: await readNoteRecognitions(
            session.userId,
            z.uuid().parse(note)
          ),
        });
      const params = req.nextUrl.searchParams;
      return json(
        await searchNotebooks(session.userId, {
          query: params.get("query") || "",
          start: params.get("start") || undefined,
          end: params.get("end") || undefined,
          recognizedOnly: params.get("recognizedOnly") === "true",
          cursor: params.get("cursor") || undefined,
        })
      );
    }
    if (req.headers.get("sec-fetch-site") === "cross-site")
      return json({ error: "Cross-site request rejected." }, 403);
    const text = await req.text();
    if (text.length > 100000)
      return json({ error: "Recognition result is too large." }, 413);
    const raw = JSON.parse(text);
    if (req.method === "DELETE") {
      const body = z
        .strictObject({ id: z.uuid(), revision: z.number().int().positive() })
        .parse(raw);
      return json(
        await deleteNoteRecognition(session.userId, body.id, body.revision)
      );
    }
    return json({
      recognition: await saveNoteRecognition(session.userId, raw),
    });
  } catch (error) {
    return json(
      {
        error:
          error instanceof CalendarError
            ? error.message
            : error instanceof z.ZodError
              ? "Check the notebook search or recognition details."
              : "Notebook search could not be completed. Your original ink is safe.",
      },
      error instanceof CalendarError
        ? error.status
        : error instanceof z.ZodError || error instanceof SyntaxError
          ? 400
          : 503
    );
  }
}
export { handle as GET, handle as POST, handle as DELETE };
