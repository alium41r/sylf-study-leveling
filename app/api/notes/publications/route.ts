import { z } from "zod";
import { connectionToken } from "@/lib/notes/server/connections";
import { GoogleDrive } from "@/lib/notes/server/google-drive";
import {
  publicationSchema,
  findPublication,
  finishPublication,
  checkedLocation,
  listPublications,
  publicationHeads,
  verifyPublicationFile,
} from "@/lib/notes/server/publications";
import {
  requireOrigin,
  seal,
  unseal,
  limitedRequest,
  NotesServerError,
} from "@/lib/notes/server/security";
import {
  owner,
  connectionFor,
  body,
  json,
  failure,
} from "@/lib/notes/server/http";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const uploadSchema = z
  .object({
    expires: z.number(),
    fileId: z.string().regex(/^[\w-]{1,200}$/),
    location: z.string(),
    publication: publicationSchema,
  })
  .strict();
export async function POST(req: Request) {
  try {
    requireOrigin(req);
    const connection = await connectionFor(await owner(req));
    const drive = new GoogleDrive(
      await connectionToken(connection),
      fetch,
      req.signal
    );
    const root = connection.rootId!,
      libraryId = connection.libraryId;
    await drive.checkedRoot(root, libraryId);
    const purpose = `notes-publication:${connection.id}:${connection.bindingGeneration}`;
    const url = new URL(req.url);
    if (url.searchParams.get("action") === "inspect") {
      const { documentId } = z
        .object({ documentId: z.uuid() })
        .strict()
        .parse(await body(req));
      const files = await listPublications(drive, libraryId, documentId);
      return json({
        copies: files
          .filter((f) => f.appProperties?.publicationFormat === "pdf")
          .map((f) => ({
            fingerprint: f.appProperties!.fingerprint,
            heads: publicationHeads(f),
          })),
      });
    }
    if (url.searchParams.get("action") === "chunk") {
      const token = z
        .string()
        .min(1)
        .max(20000)
        .parse(req.headers.get("x-sylf-upload"));
      let upload;
      try {
        upload = uploadSchema.parse(unseal(token, purpose));
      } catch {
        throw new NotesServerError(
          "Archive upload belongs to another connection or is damaged.",
          403,
          "AUTH"
        );
      }
      if (upload.expires < Date.now())
        throw new NotesServerError(
          "Archive upload expired. Retry; original work is retained.",
          409,
          "NETWORK"
        );
      const offset = z.coerce
        .number()
        .int()
        .min(0)
        .parse(url.searchParams.get("offset"));
      const bytes = await limitedRequest(req, 4 * 1024 * 1024);
      const total = upload.publication.size;
      if (
        !bytes.length ||
        offset % (256 * 1024) ||
        offset + bytes.length > total ||
        (offset + bytes.length < total && bytes.length % (256 * 1024))
      )
        throw new NotesServerError("Invalid archive chunk boundary.");
      if (
        upload.publication.format === "pdf" &&
        offset === 0 &&
        new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-"
      )
        throw new NotesServerError(
          "The readable copy is not a PDF. Originals are retained."
        );
      const result = await drive.archiveChunk(
        upload.location,
        bytes,
        offset,
        total,
        upload.fileId
      );
      if (result.offset < offset || result.offset > total)
        throw new NotesServerError(
          "Unexpected Drive acknowledgement.",
          409,
          "CORRUPT"
        );
      if (result.file) {
        if (result.file.id !== upload.fileId)
          throw new NotesServerError(
            "Archive identity changed.",
            409,
            "CORRUPT"
          );
        if (upload.publication.deferPromotion) {
          await checkedLocation(drive, root, libraryId, result.file);
          verifyPublicationFile(upload.publication, result.file);
          return json({ complete: true, offset: total });
        }
        const completed = await finishPublication(
          drive,
          root,
          libraryId,
          upload.publication,
          result.file
        );
        return json({
          complete: true,
          offset: total,
          ...(completed.maintenancePending ? { maintenancePending: true } : {}),
        });
      }
      return json({ complete: false, offset: result.offset });
    }
    const input = publicationSchema.parse(await body(req, 50000));
    const candidates = await findPublication(drive, libraryId, input);
    for (const file of candidates) {
      // A complete accepted upload with a lost response is reconciled by exact
      // provider checksum, not by an optimistic local receipt or display name.
      if (
        file.sha256Checksum === input.hash &&
        Number(file.size) === input.size
      ) {
        const result = await finishPublication(
          drive,
          root,
          libraryId,
          input,
          file
        );
        return json({
          complete: true,
          ...(result.maintenancePending ? { maintenancePending: true } : {}),
        });
      }
    }
    const system = await drive.systemFolder(root, libraryId, true);
    let file = candidates.find(
      (candidate) =>
        candidate.parents?.includes(system!.id) &&
        Number(candidate.size) === 0 &&
        candidate.appProperties?.sha256 === input.hash
    );
    if (file) await checkedLocation(drive, root, libraryId, file);
    file ||= await drive.create(
      system!.id,
      "Pending archive " + input.documentId,
      new Uint8Array(),
      {
        sylfNotes: "publication-v1",
        libraryId,
        documentId: input.documentId,
        fingerprint: input.fingerprint,
        sha256: input.hash,
        publicationFormat: input.format,
        ...(input.predecessor ? { predecessor: input.predecessor } : {}),
        ...(input.heads
          ? {
              sourceCount: String(input.heads.length),
              ...Object.fromEntries(
                input.heads.map((h, i) => [`source${i}`, h])
              ),
            }
          : {}),
      },
      input.format === "pdf" ? "application/pdf" : "application/octet-stream"
    );
    const location = await drive.startArchive(
      file.id,
      input.size,
      input.format === "pdf" ? "application/pdf" : "application/octet-stream"
    );
    return json({
      complete: false,
      token: seal(
        {
          expires: Date.now() + 60 * 60 * 1000,
          fileId: file.id,
          location,
          // Cleanup hints are sent in the final JSON reconciliation request,
          // not inflated into an HTTP upload header. Source heads are already
          // persisted on the app-owned staging file.
          publication: {
            ...input,
            supersedes: undefined,
            heads: undefined,
            recoveryVerified: false,
            ...(input.deferPromotion
              ? { title: "Pending", folders: [], predecessor: undefined }
              : {}),
          },
        },
        purpose
      ),
    });
  } catch (error) {
    return failure(error);
  }
}
