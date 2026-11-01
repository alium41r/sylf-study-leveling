import "server-only";
import { z } from "zod";
import { GoogleDrive, type DriveFile } from "./google-drive";
import { NotesServerError, sha } from "./security";
import { encodeJson } from "../bytes";

export const publicationSchema = z
  .object({
    format: z.enum(["archive", "pdf"]).default("archive"),
    documentId: z.uuid(),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    hash: z.string().regex(/^[a-f0-9]{64}$/),
    size: z
      .number()
      .int()
      .min(22)
      .max(256 * 1024 * 1024),
    title: z.string().min(1).max(500),
    predecessor: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    // At most 16 heads keeps Drive private properties below its 30-property limit.
    heads: z
      .array(z.string().regex(/^[a-f0-9]{64}$/))
      .min(1)
      .max(16)
      .optional(),
    supersedes: z
      .array(
        z
          .object({
            fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
            source: z.string().regex(/^[a-f0-9]{64}$/),
          })
          .strict()
      )
      .max(100)
      .optional(),
    recoveryVerified: z.boolean().default(false),
    deferPromotion: z.boolean().default(false),
    folders: z
      .array(
        z.object({ id: z.uuid(), name: z.string().min(1).max(160) }).strict()
      )
      .max(32),
  })
  .strict();
export type Publication = z.infer<typeof publicationSchema>;
export const driveName = (name: string) =>
  name
    .replace(/[\u0000-\u001f/\\]/g, "_")
    .trim()
    .slice(0, 180) || "Note";

export function publicationHeads(file: DriveFile): string[] | undefined {
  const count = Number(file.appProperties?.sourceCount);
  if (!Number.isInteger(count) || count < 1 || count > 16) return;
  const heads = Array.from(
    { length: count },
    (_, i) => file.appProperties?.[`source${i}`] || ""
  );
  if (heads.every((h) => /^[a-f0-9]{64}$/.test(h))) return heads;
}
export function publicationSource(file: DriveFile) {
  const heads = publicationHeads(file);
  return heads ? sha(encodeJson([...heads].sort())) : undefined;
}

export async function listPublications(
  drive: GoogleDrive,
  libraryId: string,
  documentId: string,
  fingerprint?: string
) {
  const files: DriveFile[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await drive.list(
      `trashed = false and appProperties has { key='sylfNotes' and value='publication-v1' } and appProperties has { key='libraryId' and value='${libraryId}' } and appProperties has { key='documentId' and value='${documentId}' }${fingerprint ? ` and appProperties has { key='fingerprint' and value='${fingerprint}' }` : ""}`,
      cursor
    );
    for (const file of page.files) {
      if (
        file.trashed ||
        file.appProperties?.sylfNotes !== "publication-v1" ||
        file.appProperties.libraryId !== libraryId ||
        file.appProperties.documentId !== documentId
      )
        throw new NotesServerError(
          "Unexpected Drive copy identity. Originals were retained.",
          409,
          "CORRUPT"
        );
      if (!seen.has(file.id)) {
        seen.add(file.id);
        files.push(file);
      }
    }
    cursor = page.nextPageToken;
    if (files.length > 1000 || (cursor && seen.has(`cursor:${cursor}`)))
      throw new NotesServerError(
        "Notes copy cleanup needs review; all originals were retained.",
        409,
        "LIMIT"
      );
    if (cursor) seen.add(`cursor:${cursor}`);
  } while (cursor);
  return files;
}

function validCopy(file: DriveFile) {
  return (
    !file.trashed &&
    /^[a-f0-9]{64}$/.test(file.appProperties?.sha256 || "") &&
    file.sha256Checksum === file.appProperties?.sha256 &&
    Number(file.size) >= 22
  );
}

/** Only app-owned IDs under the connected root are eligible. Names grant no authority. */
export async function publicationFolder(
  drive: GoogleDrive,
  root: string,
  libraryId: string,
  folders: Publication["folders"]
) {
  let parent = root;
  const seen = new Set<string>();
  for (const folder of folders) {
    if (seen.has(folder.id)) throw new NotesServerError("Cyclic folder path.");
    seen.add(folder.id);
    const result = await drive.list(
      `trashed = false and appProperties has { key='sylfNotes' and value='folder-v1' } and appProperties has { key='libraryId' and value='${libraryId}' } and appProperties has { key='folderId' and value='${folder.id}' }`
    );
    if (result.nextPageToken || result.files.length > 1)
      throw new NotesServerError(
        "Duplicate Drive folders need review; originals were kept.",
        409,
        "CORRUPT"
      );
    let file = result.files[0];
    if (file) {
      await checkedLocation(drive, root, libraryId, file);
      if (file.mimeType !== "application/vnd.google-apps.folder")
        throw new NotesServerError(
          "Drive folder identity changed.",
          409,
          "CORRUPT"
        );
      if (
        file.name !== driveName(folder.name) ||
        !file.parents?.includes(parent)
      )
        file = await drive.renameAndMove(file, driveName(folder.name), parent);
    } else
      file = await drive.folder(
        driveName(folder.name),
        { sylfNotes: "folder-v1", libraryId, folderId: folder.id },
        parent
      );
    parent = file.id;
  }
  return parent;
}
export async function checkedLocation(
  drive: GoogleDrive,
  root: string,
  libraryId: string,
  file: DriveFile
) {
  const seen = new Set<string>();
  let current = file;
  for (let depth = 0; depth < 34; depth++) {
    if (
      current.trashed ||
      current.appProperties?.libraryId !== libraryId ||
      seen.has(current.id)
    )
      break;
    seen.add(current.id);
    if (current.parents?.includes(root)) return;
    if (current.parents?.length !== 1) break;
    current = await drive.metadata(current.parents[0]);
    if (
      !["folder-v1", "system-v1"].includes(
        current.appProperties?.sylfNotes || ""
      )
    )
      break;
  }
  throw new NotesServerError(
    "This Drive file is outside the connected Notes folders. It was kept intact.",
    409,
    "CORRUPT"
  );
}
export async function findPublication(
  drive: GoogleDrive,
  libraryId: string,
  p: Publication
) {
  return (
    await listPublications(drive, libraryId, p.documentId, p.fingerprint)
  ).filter(
    (file) => (file.appProperties?.publicationFormat || "archive") === p.format
  );
}
export function verifyPublicationFile(p: Publication, file: DriveFile) {
  if (
    file.appProperties?.sylfNotes !== "publication-v1" ||
    file.appProperties.documentId !== p.documentId ||
    file.appProperties.fingerprint !== p.fingerprint ||
    file.appProperties.sha256 !== p.hash ||
    file.sha256Checksum !== p.hash ||
    Number(file.size) !== p.size
  )
    throw new NotesServerError(
      "Drive archive checksum failed. Native originals and prior copies were kept.",
      409,
      "CORRUPT"
    );
  if (
    p.format === "pdf" &&
    (file.mimeType !== "application/pdf" ||
      file.appProperties?.publicationFormat !== "pdf")
  )
    throw new NotesServerError(
      "Drive did not preserve the PDF format.",
      409,
      "CORRUPT"
    );
}
export async function finishPublication(
  drive: GoogleDrive,
  root: string,
  libraryId: string,
  p: Publication,
  file: DriveFile
) {
  await checkedLocation(drive, root, libraryId, file);
  verifyPublicationFile(p, file);
  const system = await drive.systemFolder(root, libraryId, true);
  const copies = await listPublications(drive, libraryId, p.documentId);
  // Concurrent identical uploads choose the same survivor, so two cleaners cannot
  // remove one another's only copy. Different snapshots require ancestry proof.
  const identical = copies
    .filter(
      (candidate) =>
        candidate.appProperties?.fingerprint === p.fingerprint &&
        (candidate.appProperties?.publicationFormat || "archive") ===
          p.format &&
        (p.format !== "pdf" || candidate.mimeType === "application/pdf") &&
        candidate.sha256Checksum === p.hash &&
        Number(candidate.size) === p.size &&
        validCopy(candidate)
    )
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (identical.length) {
    file = identical[0];
    await checkedLocation(drive, root, libraryId, file);
  }
  const parent =
    p.format === "pdf"
      ? await publicationFolder(drive, root, libraryId, p.folders)
      : system!.id;
  const name = driveName(p.title) + (p.format === "pdf" ? ".pdf" : ".sylfnote");
  if (file.name !== name || !file.parents?.includes(parent))
    file = await drive.renameAndMove(file, name, parent);
  const source = p.heads ? sha(encodeJson([...p.heads].sort())) : undefined;
  const oldSource = publicationSource(file);
  // A reused rendering may acquire a newer, causally covering catalog context.
  // Bind retirement claims to the exact inspected source stamp, then advance
  // this stamp conditionally before cleanup. An older in-flight client cannot
  // retire a copy whose source context has advanced in another request.
  if (
    p.recoveryVerified &&
    p.heads &&
    source !== oldSource &&
    (file.appProperties?.sourceCount === undefined ||
      p.supersedes?.some(
        (proof) =>
          proof.fingerprint === p.fingerprint && proof.source === oldSource
      ))
  ) {
    const updated = await drive.updateUnchanged(file, {
      appProperties: {
        ...file.appProperties,
        sourceCount: String(p.heads.length),
        ...Object.fromEntries(p.heads.map((h, i) => [`source${i}`, h])),
      },
    });
    if (updated) file = updated;
  }
  const canRetire =
    p.recoveryVerified && !!source && publicationSource(file) === source;
  let cleaned = 0,
    maintenancePending = p.recoveryVerified && !!source && !canRetire;
  for (const prior of copies) {
    if (prior.id === file.id) continue;
    const sameSnapshot =
      prior.appProperties?.fingerprint === p.fingerprint &&
      prior.appProperties?.sha256 === p.hash;
    const format = prior.appProperties?.publicationFormat || "archive";
    const priorHeads = publicationHeads(prior);
    const legacy = prior.appProperties?.sourceCount === undefined;
    if (format !== p.format) continue;
    // Only derived PDFs are retired by ancestry. Portable source archives and
    // native packs are not interchangeable with a readable rendering.
    const superseded =
      canRetire &&
      p.format === "pdf" &&
      ((legacy && prior.appProperties?.fingerprint === p.predecessor) ||
        (!!priorHeads &&
          p.supersedes?.some(
            (proof) =>
              proof.fingerprint === prior.appProperties!.fingerprint &&
              proof.source === publicationSource(prior)
          )) ||
        // Legacy complete PDFs were moved here only after replacement was verified.
        (legacy &&
          prior.parents?.includes(system!.id) &&
          !prior.name.startsWith("Pending archive ")));
    if (!sameSnapshot && !superseded) continue;
    await checkedLocation(drive, root, libraryId, prior);
    const emptyDuplicate =
      Number(prior.size) === 0 &&
      (sameSnapshot || (superseded && !!priorHeads));
    if (
      (!emptyDuplicate && !validCopy(prior)) ||
      (p.format === "pdf" && prior.mimeType !== "application/pdf")
    )
      throw new NotesServerError(
        "A Drive copy changed externally; originals were kept.",
        409,
        "CORRUPT"
      );
    if (cleaned >= 8) {
      maintenancePending = true;
      continue;
    }
    // The replacement must still be present, complete and correctly placed at
    // the moment cleanup starts. A receipt from an earlier request is insufficient.
    const replacement = await drive.metadata(file.id);
    if (
      !validCopy(replacement) ||
      replacement.sha256Checksum !== p.hash ||
      replacement.appProperties?.fingerprint !== p.fingerprint ||
      replacement.appProperties.libraryId !== libraryId ||
      replacement.appProperties.documentId !== p.documentId ||
      !replacement.parents?.includes(parent)
    )
      throw new NotesServerError(
        "The current Drive copy needs recovery before cleanup.",
        409,
        "CORRUPT"
      );
    if (canRetire && publicationSource(replacement) !== source) {
      maintenancePending = true;
      break;
    }
    if (!(await drive.trashUnchanged(prior))) maintenancePending = true;
    cleaned++;
  }
  return { file, maintenancePending };
}
