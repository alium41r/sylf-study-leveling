import { NotesError } from "./errors";
import type { NotesSession } from "./session";

export interface NotesObjectCipher {
  seal(bytes: Uint8Array, identity: string): Promise<Uint8Array>;
  open(bytes: Uint8Array, identity: string): Promise<Uint8Array>;
}

/** Device storage encryption only. Cloud objects and portable exports remain provider-readable. */
export async function createNotesVault(
  secret: Uint8Array,
  scope: string,
  session: NotesSession
): Promise<NotesObjectCipher> {
  if (secret.length !== 32)
    throw new NotesError("CORRUPT", "Invalid device vault key.");
  let key: CryptoKey | undefined = await crypto.subtle.importKey(
    "raw",
    secret.slice().buffer,
    "AES-GCM",
    false,
    ["encrypt", "decrypt"]
  );
  secret.fill(0);
  session.assert();
  session.onClose(() => {
    key = undefined;
  });
  const aad = (identity: string) =>
    new TextEncoder().encode(
      JSON.stringify(["sylf-device-vault", 1, scope, identity])
    );
  return {
    async seal(bytes, identity) {
      session.assert();
      if (!key) throw new NotesError("SESSION_ENDED", "Unlock Notes again.");
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const body = new Uint8Array(
        await crypto.subtle.encrypt(
          { name: "AES-GCM", iv, additionalData: aad(identity) },
          key,
          bytes.slice().buffer
        )
      );
      session.assert();
      const result = new Uint8Array(13 + body.length);
      result[0] = 1;
      result.set(iv, 1);
      result.set(body, 13);
      return result;
    },
    async open(bytes, identity) {
      session.assert();
      if (!key) throw new NotesError("SESSION_ENDED", "Unlock Notes again.");
      if (bytes.length < 29 || bytes[0] !== 1)
        throw new NotesError(
          "CORRUPT",
          "The encrypted local object is invalid. Original bytes were retained."
        );
      try {
        const plain = new Uint8Array(
          await crypto.subtle.decrypt(
            {
              name: "AES-GCM",
              iv: bytes.slice(1, 13),
              additionalData: aad(identity),
            },
            key,
            bytes.slice(13).buffer
          )
        );
        session.assert();
        return plain;
      } catch (cause) {
        session.assert();
        throw new NotesError(
          "CORRUPT",
          "The local object could not be unlocked. Keep this device's data and recover a verified copy.",
          { cause }
        );
      }
    },
  };
}
