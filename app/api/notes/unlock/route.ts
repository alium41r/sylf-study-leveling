import { publicBinding } from "@/lib/notes/server/connections";
import { connectionToken } from "@/lib/notes/server/connections";
import { GoogleDrive, escapeQuery } from "@/lib/notes/server/google-drive";
import { encodeJson } from "@/lib/notes/bytes";
import { sha, NotesServerError } from "@/lib/notes/server/security";
import { requireOrigin, unseal } from "@/lib/notes/server/security";
import { owner, connectionFor, json, failure } from "@/lib/notes/server/http";
import { prisma } from "@/lib/prisma";
import {
  configured,
  publicOrigin,
  notesRequestOrigin,
} from "@/lib/notes/server/security";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try {
    const bootstrap = new URL(req.url).searchParams.get("bootstrap") === "1";
    if (!bootstrap) requireOrigin(req);
    const userId = await owner(req);
    const connection = bootstrap
      ? await prisma.notesConnection.findUnique({ where: { userId } })
      : await connectionFor(userId);
    const ready = configured();
    const access = bootstrap
      ? {
          configured: ready,
          notesUrl: ready ? `${publicOrigin()}/notes` : null,
          localAccess: ready && !!notesRequestOrigin(req),
          connection: connection?.verifiedAt ? publicBinding(connection) : null,
        }
      : undefined;
    // Metadata-only onboarding may be read like the existing connection GET.
    // Keys still require exact same-origin validation and the current owner.
    if (
      access &&
      (!access.configured || !access.localAccess || !access.connection)
    )
      return json({ access });
    requireOrigin(req);
    if (!connection?.rootId || !connection.verifiedAt)
      throw new NotesServerError(
        "Connect Google Drive before opening Notes.",
        409,
        "AUTH"
      );
    const verify = new URL(req.url).searchParams.get("verify") === "1";
    if (verify) {
      const drive = new GoogleDrive(
        await connectionToken(connection),
        fetch,
        req.signal
      );
      await drive.checkedRoot(connection.rootId!, connection.libraryId);
      const system = await drive.systemFolder(
        connection.rootId!,
        connection.libraryId
      );
      const parents = [connection.rootId!, ...(system ? [system.id] : [])]
        .map((id) => `'${escapeQuery(id)}' in parents`)
        .join(" or ");
      const descriptors = await drive.list(
        `(${parents}) and trashed = false and appProperties has { key='sylfNotes' and value='descriptor-v1' }`
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
      ...(access ? { access } : {}),
    });
  } catch (error) {
    return failure(error);
  }
}
