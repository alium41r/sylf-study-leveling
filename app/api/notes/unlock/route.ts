import { publicBinding } from "@/lib/notes/server/connections";
import { connectionToken } from "@/lib/notes/server/connections";
import { GoogleDrive, escapeQuery } from "@/lib/notes/server/google-drive";
import { encodeJson } from "@/lib/notes/bytes";
import { sha, NotesServerError } from "@/lib/notes/server/security";
import { requireOrigin, unseal } from "@/lib/notes/server/security";
import { owner, connectionFor, json, failure } from "@/lib/notes/server/http";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try {
    requireOrigin(req);
    const connection = await connectionFor(await owner(req));
    const verify = new URL(req.url).searchParams.get("verify") === "1";
    if (verify) {
      const drive = new GoogleDrive(
        await connectionToken(connection),
        fetch,
        req.signal
      );
      await drive.checkedRoot(connection.rootId!, connection.libraryId);
      const descriptors = await drive.list(
        `'${escapeQuery(connection.rootId!)}' in parents and trashed = false and appProperties has { key='sylfNotes' and value='descriptor-v1' }`
      );
      if (
        !descriptors.files.length ||
        descriptors.nextPageToken ||
        descriptors.files.length > 8
      )
        throw new NotesServerError(
          "Restore the original cloud descriptor before repairing the device header.",
          409,
          "CORRUPT"
        );
      const expected = sha(encodeJson(publicBinding(connection).descriptor));
      for (const file of descriptors.files)
        if (sha(await drive.read(file.id, 100000)) !== expected)
          throw new NotesServerError(
            "Cloud library identity needs recovery. Local data was retained.",
            409,
            "CORRUPT"
          );
    }
    return json({
      ...publicBinding(connection),
      vaultKey: unseal<string>(
        connection.vaultKey,
        `notes-vault:${connection.id}`
      ),
      headerVerified: verify,
    });
  } catch (error) {
    return failure(error);
  }
}
