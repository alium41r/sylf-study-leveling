import {
  CONTENT_BYTES,
  OBJECT_BYTES,
  type ContentRef,
  type PreparedObject,
} from "./contracts";
import { NotesError } from "./errors";

export function encodeJson(
  value: unknown,
  maximumBytes = OBJECT_BYTES
): Uint8Array {
  let nodes = 0;
  function encode(v: unknown, depth: number): string {
    if (++nodes > 1000000 || depth > 64)
      throw new NotesError("LIMIT", "JSON structure exceeds supported limits.");
    if (v === null || typeof v === "string" || typeof v === "boolean")
      return JSON.stringify(v);
    if (typeof v === "number" && Number.isFinite(v)) return JSON.stringify(v);
    if (Array.isArray(v))
      return "[" + v.map((item) => encode(item, depth + 1)).join(",") + "]";
    if (v && Object.getPrototypeOf(v) === Object.prototype) {
      return (
        "{" +
        Object.keys(v)
          .sort()
          .map(
            (key) =>
              JSON.stringify(key) +
              ":" +
              encode((v as Record<string, unknown>)[key], depth + 1)
          )
          .join(",") +
        "}"
      );
    }
    throw new NotesError("CORRUPT", "Unsupported JSON value.");
  }
  const bytes = new TextEncoder().encode(encode(value, 0));
  if (bytes.length > maximumBytes)
    throw new NotesError("LIMIT", "JSON object is too large.");
  return bytes;
}
export function decodeJson(bytes: Uint8Array): unknown {
  if (bytes.length > OBJECT_BYTES)
    throw new NotesError("LIMIT", "Metadata object is too large.");
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (cause) {
    throw new NotesError("CORRUPT", "Invalid metadata encoding.", { cause });
  }
}
export async function digest(bytes: Uint8Array): Promise<string> {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes.slice().buffer))
  )
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
export const equalBytes = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((v, i) => v === b[i]);
export async function prepareContent(
  input: Uint8Array
): Promise<{ content: ContentRef; objects: PreparedObject[] }> {
  if (input.length > CONTENT_BYTES)
    throw new NotesError("LIMIT", "Content exceeds the supported byte limit.");
  const bytes = input.slice(),
    objects: PreparedObject[] = [];
  for (
    let offset = 0;
    offset < bytes.length || !objects.length;
    offset += OBJECT_BYTES
  ) {
    const part = bytes.slice(offset, offset + OBJECT_BYTES);
    objects.push({ hash: await digest(part), bytes: part });
  }
  return {
    content: {
      hash: await digest(bytes),
      size: bytes.length,
      parts: objects.map((p) => ({ hash: p.hash, size: p.bytes.length })),
    },
    objects,
  };
}
export async function joinContent(
  ref: ContentRef,
  read: (hash: string) => Promise<Uint8Array>
): Promise<Uint8Array> {
  const bytes = new Uint8Array(ref.size);
  let offset = 0;
  for (const part of ref.parts) {
    const data = await read(part.hash);
    if (data.length !== part.size || (await digest(data)) !== part.hash)
      throw new NotesError("CORRUPT", "Content chunk failed verification.");
    bytes.set(data, offset);
    offset += data.length;
  }
  if (offset !== ref.size || (await digest(bytes)) !== ref.hash)
    throw new NotesError("CORRUPT", "Original content failed verification.");
  return bytes;
}
