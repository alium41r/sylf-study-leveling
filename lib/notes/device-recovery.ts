import Dexie from "dexie";
import { z } from "zod";
import { createBrowserNotesSession } from "./session";
import { notesRequest } from "./drive-transport";
import { NotesError } from "./errors";

/** Read-only forensic preservation when a damaged header prevents normal portable export.
 * This is an encrypted device snapshot, NOT an interchangeable document archive or a key backup.
 */
export async function exportLockedNotesDevice(
  ownerId: string,
  libraryId: string,
  isCurrentOwner: () => boolean
) {
  z.uuid().parse(libraryId);
  const session = createBrowserNotesSession(ownerId, isCurrentOwner);
  const db = new Dexie(`sylf-notes-vault-v1:${ownerId}:${libraryId}`);
  try {
    const current = await (
      await notesRequest("/api/notes/connection", { signal: session.signal })
    ).json();
    session.assert();
    if (
      current.connection?.descriptor?.ownerRef !== ownerId ||
      current.connection?.descriptor?.libraryId !== libraryId
    )
      throw new NotesError(
        "OWNERSHIP",
        "Reopen the original signed-in owner to preserve this device library."
      );
    await db.open(); // No schema declaration: Dexie opens existing databases only.
    const pieces: string[] = [];
    let bytes = 0;
    await db.transaction("r", db.tables, async () => {
      for (const table of db.tables) {
        session.assert();
        await table.each((row) => {
          const line = JSON.stringify(
            { table: table.name, row },
            (_key, value) => {
              if (value instanceof Uint8Array) {
                let binary = "";
                for (let offset = 0; offset < value.length; offset += 8192)
                  binary += String.fromCharCode(
                    ...value.subarray(offset, offset + 8192)
                  );
                return { $sylfType: "bytes", base64: btoa(binary) };
              }
              return value;
            }
          );
          bytes += new TextEncoder().encode(line).length;
          if (bytes > 256 * 1024 * 1024)
            throw new NotesError(
              "LIMIT",
              "Device preservation exceeds this browser export limit. Keep the database intact for recovery."
            );
          pieces.push(line);
        });
      }
      session.assert();
    });
    session.assert();
    const header = JSON.stringify({
      format: "sylf-device-recovery",
      version: 1,
      ownerId,
      libraryId,
      databaseVersion: db.verno,
      createdAt: new Date().toISOString(),
      encrypted: true,
    });
    return new TextEncoder().encode(
      header.slice(0, -1) + ',"records":[' + pieces.join(",") + "]}"
    );
  } finally {
    db.close();
    session.close();
  }
}
