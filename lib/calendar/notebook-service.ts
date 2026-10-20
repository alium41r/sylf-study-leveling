import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { CalendarError } from "./personal-service";
import { editableDocument } from "./ink";
import { noteDocumentSchema } from "./contracts";
import { inkSource } from "./recognition-geometry";
import {
  recognitionWriteSchema,
  noteSearchSchema,
  type RecognitionResult,
  type NoteSearchResult,
} from "./recognition-contracts";
const recognitionSelect = {
  id: true,
  revision: true,
  noteId: true,
  strokeIds: true,
  sourceHash: true,
  text: true,
  engine: true,
} as const;
const recognitionDTO = (r: RecognitionResult): RecognitionResult => ({
  id: r.id,
  revision: r.revision,
  noteId: r.noteId,
  strokeIds: r.strokeIds,
  sourceHash: r.sourceHash,
  text: r.text,
  engine: r.engine,
});
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export async function pruneNoteRecognitions(
  tx: Prisma.TransactionClient,
  noteId: string,
  document: unknown
) {
  const doc = editableDocument(noteDocumentSchema.parse(document));
  const records = await tx.calendarNoteRecognition.findMany({
    where: { noteId },
  });
  const invalid = records.filter((r) => {
    const ids = r.strokeIds as string[];
    return (
      !ids.every((id) => doc.ink.strokes.some((s) => s.id === id)) ||
      hash(inkSource(doc.ink.strokes, ids)) !== r.sourceHash
    );
  });
  if (invalid.length)
    await tx.calendarNoteRecognition.deleteMany({
      where: { id: { in: invalid.map((r) => r.id) } },
    });
}
export async function readNoteRecognitions(userId: number, noteId: string) {
  const note = await prisma.calendarNote.findFirst({
    where: { id: noteId, userId },
    select: { id: true },
  });
  if (!note) throw new CalendarError("Notebook not found.", 404);
  return prisma.calendarNoteRecognition.findMany({
    where: { noteId },
    orderBy: { updatedAt: "desc" },
    select: recognitionSelect,
    take: 20,
  }) as unknown as Promise<RecognitionResult[]>;
}
export async function saveNoteRecognition(userId: number, raw: unknown) {
  const input = recognitionWriteSchema.parse(raw);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "CalendarNote" WHERE "id"=${input.noteId} AND "userId"=${userId} FOR UPDATE`;
    const note = await tx.calendarNote.findFirst({
      where: { id: input.noteId, userId },
    });
    if (!note) throw new CalendarError("Notebook not found.", 404);
    const doc = editableDocument(noteDocumentSchema.parse(note.document));
    if (doc.mode !== "note" || note.revision !== input.noteRevision)
      throw new CalendarError(
        "The notebook changed. Save and review the current ink before indexing this result.",
        409
      );
    if (
      !input.strokeIds.every((id) =>
        doc.ink.strokes.some((s) => s.id === id)
      ) ||
      hash(inkSource(doc.ink.strokes, input.strokeIds)) !== input.sourceHash
    )
      throw new CalendarError(
        "Selected handwriting changed. Recognize the current selection again.",
        409
      );
    const selectionKey = hash([...input.strokeIds].sort().join(":"));
    const existing = await tx.calendarNoteRecognition.findFirst({
      where: { OR: [{ id: input.id }, { noteId: input.noteId, selectionKey }] },
    });
    if (existing) {
      if (existing.noteId !== input.noteId || existing.id !== input.id)
        throw new CalendarError(
          "This selection already has a result. Reload its recognized text before editing.",
          409
        );
      if (
        existing.text === input.text &&
        existing.sourceHash === input.sourceHash &&
        existing.engine === input.engine
      )
        return recognitionDTO(existing as unknown as RecognitionResult);
      if (existing.revision !== input.revision)
        throw new CalendarError(
          "Recognized text changed in another tab. Copy your correction before reloading.",
          409
        );
    } else if (input.revision !== 0)
      throw new CalendarError("Recognition result no longer exists.", 409);
    const others = await tx.calendarNoteRecognition.findMany({
      where: { noteId: input.noteId, id: { not: input.id } },
      select: { text: true },
    });
    if (
      others.length >= 20 ||
      others.reduce((n, r) => n + r.text.length, 0) + input.text.length > 16000
    )
      throw new CalendarError(
        "This page has reached its recognized-text limit. Remove an older result or use another note.",
        422
      );
    const data = {
      noteId: input.noteId,
      selectionKey,
      sourceHash: input.sourceHash,
      strokeIds: input.strokeIds,
      text: input.text,
      engine: input.engine,
    };
    return tx.calendarNoteRecognition.upsert({
      where: { id: input.id },
      select: recognitionSelect,
      create: { id: input.id, ...data },
      update: { ...data, revision: { increment: 1 } },
    });
  });
}
export async function deleteNoteRecognition(
  userId: number,
  id: string,
  revision: number
) {
  return prisma.$transaction(async (tx) => {
    const row = await tx.calendarNoteRecognition.findFirst({
      where: { id, note: { userId } },
    });
    if (!row) return { deleted: true };
    await tx.$queryRaw`SELECT "id" FROM "CalendarNote" WHERE "id"=${row.noteId} AND "userId"=${userId} FOR UPDATE`;
    const deleted = await tx.calendarNoteRecognition.deleteMany({
      where: { id, revision, note: { userId } },
    });
    if (!deleted.count)
      throw new CalendarError(
        "Recognized text changed. Reload before removing it.",
        409
      );
    return { deleted: true };
  });
}
export async function searchNotebooks(userId: number, raw: unknown) {
  const input = noteSearchSchema.parse(raw),
    terms = [
      ...new Set(input.query.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []),
    ].slice(0, 10),
    query = terms.map((t) => `'${t}':*`).join(" & ");
  if (input.query && !terms.length) return { notes: [], nextCursor: null };
  let cursor: { date: string; id: string } | null = null;
  try {
    if (input.cursor)
      cursor = JSON.parse(
        Buffer.from(input.cursor, "base64url").toString("utf8")
      );
  } catch {
    throw new CalendarError("Invalid search cursor.", 400);
  }
  if (
    cursor &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(cursor.date) ||
      !/^[a-f0-9-]{36}$/.test(cursor.id))
  )
    throw new CalendarError("Invalid search cursor.", 400);
  const rows = await prisma.$queryRaw<Array<NoteSearchResult>>(Prisma.sql`
 SELECT n."id",n."dateKey",n."title",n."revision",coalesce(r."text",substring(coalesce(n."document"->>'text','') FROM greatest(1,strpos(lower(coalesce(n."document"->>'text','')),${terms[0] || ""})-80) FOR 1000)) AS "excerpt",(r."text" IS NOT NULL) AS "recognized"
 FROM "CalendarNote" n LEFT JOIN LATERAL (SELECT substring(x."text" FROM greatest(1,strpos(lower(x."text"),${terms[0] || ""})-80) FOR 1000) AS "text" FROM "CalendarNoteRecognition" x WHERE x."noteId"=n."id" AND (${query}='' OR to_tsvector('simple',x."text") @@ to_tsquery('simple',${query})) ORDER BY x."updatedAt" DESC LIMIT 1) r ON true
 WHERE n."userId"=${userId} AND n."document"->>'mode' IS DISTINCT FROM 'annotation'
 AND (${input.start || null}::text IS NULL OR n."dateKey">=${input.start || null}) AND (${input.end || null}::text IS NULL OR n."dateKey"<=${input.end || null})
 AND (${query}='' OR n."searchVector" @@ to_tsquery('simple',${query})) AND (${input.recognizedOnly}=false OR r."text" IS NOT NULL)
 AND (${cursor?.date || null}::text IS NULL OR n."dateKey"<${cursor?.date || null} OR (n."dateKey"=${cursor?.date || null} AND n."id">${cursor?.id || null}))
 ORDER BY n."dateKey" DESC,n."id" ASC LIMIT 21`);
  const notes = rows.slice(0, 20),
    last = notes.at(-1);
  return {
    notes,
    nextCursor:
      rows.length > 20 && last
        ? Buffer.from(
            JSON.stringify({ date: last.dateKey, id: last.id })
          ).toString("base64url")
        : null,
  };
}
