import "server-only";
import type { NotesConnection } from "@prisma/client";
import { GoogleDrive, escapeQuery } from "./google-drive";
import { publicBinding } from "./connections";
import { sha, NotesServerError } from "./security";
import { encodeJson } from "../bytes";
import { decodePack } from "../pack";

/** Only byte-identical physical packs are redundant. No revision, attachment,
 * checkpoint or ancestry is discarded, and there is no history-expiry policy. */
export async function cleanDuplicatePacks(
  drive: GoogleDrive,
  connection: NotesConnection,
  hashes: string[] = []
) {
  if (!hashes.length) return 0;
  const root = connection.rootId!,
    library = connection.libraryId;
  const system = await drive.systemFolder(root, library);
  const parents = [root, ...(system ? [system.id] : [])]
    .map((id) => `'${escapeQuery(id)}' in parents`)
    .join(" or ");
  const query = `(${parents}) and trashed = false and appProperties has { key='sylfNotes' and value='pack-v1' } and appProperties has { key='libraryId' and value='${library}' }`;
  let cleaned = 0;
  // Hints come from the already complete sync listing. Recheck them here;
  // never perform an extra per-pack scan or trust client physical file IDs.
  for (const hash of new Set(hashes.slice(0, 4))) {
    if (!/^[a-f0-9]{64}$/.test(hash)) continue;
    const result = await drive.list(
      `${query} and appProperties has { key='sha256' and value='${hash}' }`
    );
    if (result.nextPageToken || result.files.length > 32) continue;
    const copies = result.files.sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    );
    if (copies.length < 2) continue;
    const survivor = copies[0];
    const bytes = await drive.checkedPack(root, library, survivor.id);
    if (sha(bytes) !== hash)
      throw new NotesServerError(
        "Unexpected recovery batch identity. Originals were kept.",
        409,
        "CORRUPT"
      );
    await decodePack(bytes, library);
    for (const duplicate of copies.slice(1)) {
      if (cleaned >= 4) return cleaned;
      if (sha(await drive.checkedPack(root, library, duplicate.id)) !== hash)
        throw new NotesServerError(
          "Unexpected duplicate batch identity. Originals were kept.",
          409,
          "CORRUPT"
        );
      const current = await drive.metadata(survivor.id);
      if (
        current.trashed ||
        current.version !== survivor.version ||
        current.sha256Checksum !== hash ||
        Number(current.size) !== bytes.length
      )
        throw new NotesServerError(
          "A recovery copy changed during cleanup. Originals were kept.",
          409,
          "CORRUPT"
        );
      if (await drive.trashUnchanged(duplicate)) cleaned++;
    }
  }
  return cleaned;
}

/** Bounded, restartable metadata moves. Originals are verified first; IDs,
 * content, app properties and all historical packs remain unchanged. */
export async function organizeDrive(
  drive: GoogleDrive,
  connection: NotesConnection
) {
  const root = connection.rootId!,
    library = connection.libraryId;
  const system = await drive.systemFolder(root, library, true);
  let moved = 0;
  for (const [kind, budget] of [
    ["pack-v1", 4],
    ["descriptor-v1", 2],
    ["probe-v1", 1],
  ] as const) {
    const result = await drive.list(
      `'${escapeQuery(root)}' in parents and trashed = false and appProperties has { key='sylfNotes' and value='${kind}' } and appProperties has { key='libraryId' and value='${library}' }`,
      undefined,
      budget
    );
    for (const file of result.files.slice(0, budget)) {
      if (
        !file.parents?.includes(root) ||
        file.appProperties?.sylfNotes !== kind ||
        file.appProperties.libraryId !== library
      )
        throw new NotesServerError(
          "Unexpected cloud file during organization. Originals were kept.",
          409,
          "CORRUPT"
        );
      if (kind === "pack-v1") await drive.checkedPack(root, library, file.id);
      else {
        const bytes = await drive.read(file.id, 100000);
        if (
          (kind === "descriptor-v1" &&
            sha(bytes) !==
              sha(encodeJson(publicBinding(connection).descriptor))) ||
          (kind === "probe-v1" && bytes.length !== 48)
        )
          throw new NotesServerError(
            "Cloud library metadata needs recovery before organization.",
            409,
            "CORRUPT"
          );
      }
      await drive.renameAndMove(file, file.name, system!.id);
      moved++;
    }
  }
  return moved;
}
