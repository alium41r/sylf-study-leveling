import { z } from "zod";
import { connectionToken } from "@/lib/notes/server/connections";
import { GoogleDrive, escapeQuery } from "@/lib/notes/server/google-drive";
import {
  requireOrigin,
  NotesServerError,
  limitedRequest,
  sha,
} from "@/lib/notes/server/security";
import {
  owner,
  connectionFor,
  body,
  json,
  failure,
} from "@/lib/notes/server/http";
import { PACK_BYTES, decodePack } from "@/lib/notes/pack";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
const command = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("list"),
      cursor: z.string().max(4000).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("read"),
      fileId: z.string().regex(/^[\w-]{1,200}$/),
    })
    .strict(),
]);
export async function POST(req: Request) {
  try {
    requireOrigin(req);
    const connection = await connectionFor(await owner(req));
    const drive = new GoogleDrive(
      await connectionToken(connection),
      fetch,
      req.signal
    );
    await drive.checkedRoot(connection.rootId!, connection.libraryId);
    if (new URL(req.url).searchParams.get("action") === "upload") {
      const hash = z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .parse(new URL(req.url).searchParams.get("hash"));
      const bytes = await limitedRequest(req, PACK_BYTES);
      if (sha(bytes) !== hash)
        throw new NotesServerError("Upload checksum mismatch.", 409, "CORRUPT");
      await decodePack(bytes, connection.libraryId);
      const file = await drive.create(
        connection.rootId!,
        hash + ".sylfpack",
        bytes,
        { sylfNotes: "pack-v1", libraryId: connection.libraryId, sha256: hash }
      );
      return json({ file: { id: file.id, hash, version: file.version || "" } });
    }
    const input = command.parse(await body(req));
    if (input.action === "read")
      return new Response(
        (
          await drive.checkedPack(
            connection.rootId!,
            connection.libraryId,
            input.fileId
          )
        ).slice().buffer,
        {
          headers: {
            "Content-Type": "application/octet-stream",
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
          },
        }
      );
    const result = await drive.list(
      `'${escapeQuery(connection.rootId!)}' in parents and trashed = false and appProperties has { key='sylfNotes' and value='pack-v1' } and appProperties has { key='libraryId' and value='${connection.libraryId}' }`,
      input.cursor
    );
    return json({
      files: result.files.map((f) => ({
        id: f.id,
        version: f.version || "",
        hash: f.appProperties?.sha256,
      })),
      cursor: result.nextPageToken,
    });
  } catch (error) {
    return failure(error);
  }
}
