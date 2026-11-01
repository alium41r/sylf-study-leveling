import { digest, encodeJson } from "./bytes";
import { notesRequest } from "./drive-transport";
import type { NotesRepository } from "./repository";
import type { NoteSummary, NotesFolder } from "./library";
import { NotesError } from "./errors";
import { z } from "zod";

const startSchema = z.object({
  complete: z.boolean(),
  token: z.string().max(20000).optional(),
  maintenancePending: z.boolean().optional(),
});
const chunkSchema = z.object({
  complete: z.boolean(),
  maintenancePending: z.boolean().optional(),
  offset: z
    .number()
    .int()
    .nonnegative()
    .max(256 * 1024 * 1024),
});

export function publicationPath(
  folderId: string | null | undefined,
  folders: NotesFolder[]
) {
  const path: { id: string; name: string }[] = [],
    seen = new Set<string>();
  let folder = folders.find((f) => f.id === folderId);
  while (folder) {
    if (seen.has(folder.id) || path.length >= 32)
      throw new NotesError(
        "CONFLICT",
        "Folder hierarchy needs review before publishing a Drive copy."
      );
    seen.add(folder.id);
    path.unshift({ id: folder.id, name: folder.name });
    folder = folders.find((f) => f.id === folder!.parentId);
  }
  return path;
}
/** Readable, derived PDFs; immutable packs retain editable source and history. */
export class DrivePublications {
  private readonly published = new Map<string, string>();
  constructor(
    private readonly repository: NotesRepository,
    private readonly renderPdf: (
      repository: NotesRepository,
      documentId: string
    ) => Promise<Uint8Array> = async (repository, documentId) =>
      (await import("./drive-pdf")).renderDrivePdf(repository, documentId)
  ) {}
  clear() {
    this.published.clear();
  }
  async publish(
    note: NoteSummary,
    folders: NotesFolder[],
    context?: { documentId: string; heads: string[] },
    recoveryVerified = false
  ) {
    const repository = this.repository;
    const view = await repository.document(note.id);
    if (view.state === "trashed") return; // never turn UI trash into provider deletion
    const path = publicationPath(view.descriptor.folderId, folders);
    const fingerprint = await digest(
      encodeJson({
        heads: [...view.heads].sort(),
        title: view.descriptor.title,
        path,
        renderer: "sylf-drive-pdf/1",
      })
    );
    const format = "pdf",
      version = fingerprint,
      key = note.id;
    if (this.published.get(key) === version) return;
    // A durable receipt supplies the predecessor after reopening, but is not
    // trusted as current provider presence: cold opens still reconcile it.
    const predecessor = await repository.publicationReceipt(note.id, format);
    const sourceHeads = [
      ...new Set([...view.heads, ...(context?.heads || [])]),
    ].sort();
    const inventory = z
      .object({
        copies: z
          .array(
            z.object({
              fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
              heads: z
                .array(z.string().regex(/^[a-f0-9]{64}$/))
                .min(1)
                .max(16)
                .optional(),
            })
          )
          .max(1000),
      })
      .parse(
        await (
          await notesRequest("/api/notes/publications?action=inspect", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ documentId: note.id }),
            signal: repository.session.signal,
          })
        ).json()
      );
    const ancestors = new Set<string>();
    const history = await repository.listRevisions(note.id);
    if (context)
      history.push(...(await repository.listRevisions(context.documentId)));
    const revisions = new Map(history.map((r) => [r.id, r.commit]));
    const pending = [...sourceHeads];
    while (pending.length) {
      const id = pending.pop()!;
      if (ancestors.has(id)) continue;
      const commit = revisions.get(id);
      if (!commit)
        throw new NotesError(
          "CORRUPT",
          "Notes history needs recovery before copy cleanup."
        );
      ancestors.add(id);
      pending.push(...commit.parents);
    }
    const supersededCopies = inventory.copies.filter(
      (copy) =>
        copy.heads &&
        copy.heads.every((h) => ancestors.has(h)) &&
        sourceHeads.some((h) => !copy.heads!.includes(h))
    );
    const supersedes = await Promise.all(
      supersededCopies.slice(0, 100).map(async (copy) => ({
        fingerprint: copy.fingerprint,
        source: await digest(encodeJson([...copy.heads!].sort())),
      }))
    );
    const bytes = await this.renderPdf(repository, note.id);
    repository.session.assert();
    // Never promote a derived copy built from a moving snapshot.
    if (
      (await repository.document(note.id)).heads.join(":") !==
        view.heads.join(":") ||
      (context &&
        (await repository.document(context.documentId)).heads.join(":") !==
          context.heads.join(":"))
    )
      return;
    const maintenancePending = await this.upload(
      {
        documentId: note.id,
        fingerprint: version,
        format,
        title: view.descriptor.title,
        folders: path,
        hash: await digest(bytes),
        size: bytes.length,
        ...(predecessor ? { predecessor } : {}),
        ...(sourceHeads.length <= 16 ? { heads: sourceHeads } : {}),
        supersedes,
        recoveryVerified,
        deferPromotion: true,
      },
      bytes
    );
    await repository.rememberPublication(note.id, format, version);
    if (!maintenancePending) this.published.set(key, version);
  }
  private async upload(
    metadata: {
      documentId: string;
      fingerprint: string;
      format: "archive" | "pdf";
      title: string;
      folders: { id: string; name: string }[];
      hash: string;
      size: number;
      predecessor?: string;
      heads?: string[];
      supersedes?: { fingerprint: string; source: string }[];
      recoveryVerified?: boolean;
      deferPromotion?: boolean;
    },
    bytes: Uint8Array
  ) {
    const repository = this.repository,
      signal = repository.session.signal;
    let result: {
      complete: boolean;
      token?: string;
      offset?: number;
      maintenancePending?: boolean;
    } = startSchema.parse(
      await (
        await notesRequest("/api/notes/publications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(metadata),
          signal,
        })
      ).json()
    );
    const token = result.token;
    const uploaded = !result.complete;
    let offset = 0;
    while (!result.complete) {
      if (typeof token !== "string")
        throw new NotesError(
          "CORRUPT",
          "Drive did not establish a Notes archive upload."
        );
      const end = Math.min(offset + 4 * 1024 * 1024, bytes.length);
      const next = chunkSchema.parse(
        await (
          await notesRequest(
            `/api/notes/publications?action=chunk&offset=${offset}`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/octet-stream",
                "x-sylf-upload": token,
              },
              body: bytes.slice(offset, end).buffer,
              signal,
            }
          )
        ).json()
      );
      repository.session.assert();
      if (next.offset <= offset || next.offset > bytes.length)
        throw new NotesError(
          "CORRUPT",
          "Drive did not confirm archive progress. Original notes are retained."
        );
      offset = next.offset;
      result = next;
      if (offset === bytes.length && !result.complete)
        throw new NotesError(
          "CORRUPT",
          "Drive archive is not confirmed complete."
        );
    }
    if (uploaded) {
      result = startSchema.parse(
        await (
          await notesRequest("/api/notes/publications", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(metadata),
            signal,
          })
        ).json()
      );
      if (!result.complete)
        throw new NotesError(
          "CORRUPT",
          "Drive did not reconcile the complete readable copy. Originals were retained."
        );
    }
    repository.session.assert();
    return !!result.maintenancePending;
  }
}
