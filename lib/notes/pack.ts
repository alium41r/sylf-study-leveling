import { z } from "zod";
import { digest, encodeJson, equalBytes } from "./bytes";
import {
  hashSchema,
  idSchema,
  objectRefSchema,
  type PreparedObject,
} from "./contracts";
import { NotesError } from "./errors";

// Below the deployment's 4.5 MB function payload ceiling, including a full 4 MiB object.
export const PACK_BYTES = 4_400_000;
export const PACK_HEADER_BYTES = 128 * 1024;
const MAGIC = new TextEncoder().encode("SYLFPAK1");
const schema = z
  .object({
    version: z.literal(1),
    libraryId: idSchema,
    objects: z.array(objectRefSchema).max(500),
    revisions: z.array(hashSchema).max(500),
  })
  .strict();
export async function encodePack(
  libraryId: string,
  objects: PreparedObject[],
  revisions: string[]
): Promise<Uint8Array> {
  const header = encodeJson(
    schema.parse({
      version: 1,
      libraryId,
      objects: objects.map((o) => ({ hash: o.hash, size: o.bytes.length })),
      revisions,
    }),
    PACK_HEADER_BYTES
  );
  const length =
    12 + header.length + objects.reduce((n, o) => n + o.bytes.length, 0);
  if (length > PACK_BYTES)
    throw new NotesError("LIMIT", "Cloud batch exceeds its transfer limit.");
  const bytes = new Uint8Array(length);
  bytes.set(MAGIC);
  new DataView(bytes.buffer).setUint32(8, header.length, true);
  bytes.set(header, 12);
  let offset = 12 + header.length;
  for (const object of objects) {
    if ((await digest(object.bytes)) !== object.hash)
      throw new NotesError(
        "CORRUPT",
        "Cloud batch object failed verification."
      );
    bytes.set(object.bytes, offset);
    offset += object.bytes.length;
  }
  return bytes;
}
export async function decodePack(bytes: Uint8Array, libraryId: string) {
  if (
    bytes.length < 12 ||
    bytes.length > PACK_BYTES ||
    !equalBytes(bytes.subarray(0, 8), MAGIC)
  )
    throw new NotesError("CORRUPT", "Invalid cloud batch.");
  const headerSize = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength
  ).getUint32(8, true);
  if (headerSize > PACK_HEADER_BYTES || headerSize + 12 > bytes.length)
    throw new NotesError("LIMIT", "Invalid cloud batch header.");
  const parsed = schema.safeParse(
    JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        bytes.subarray(12, 12 + headerSize)
      )
    )
  );
  if (!parsed.success || parsed.data.libraryId !== libraryId)
    throw new NotesError("CORRUPT", "Cloud batch identity mismatch.");
  const header = parsed.data,
    objects = new Map<string, Uint8Array>();
  let offset = 12 + headerSize;
  for (const ref of header.objects) {
    const data = bytes.slice(offset, offset + ref.size);
    offset += ref.size;
    if (
      objects.has(ref.hash) ||
      data.length !== ref.size ||
      (await digest(data)) !== ref.hash
    )
      throw new NotesError("CORRUPT", "Cloud batch checksum failed.");
    objects.set(ref.hash, data);
  }
  if (
    offset !== bytes.length ||
    new Set(header.revisions).size !== header.revisions.length ||
    header.revisions.some((id) => !objects.has(id))
  )
    throw new NotesError("CORRUPT", "Cloud batch dependencies are invalid.");
  return { objects, revisions: header.revisions };
}
