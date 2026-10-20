import { zipSync } from "fflate";
import { z } from "zod";
import {
  CONTENT_BYTES,
  contentRefSchema,
  hashSchema,
  idSchema,
  librarySchema,
  objectRefSchema,
  type PreparedObject,
  commitSchema,
  newId,
  type ObjectRef,
} from "./contracts";
import {
  decodeJson,
  digest,
  encodeJson,
  joinContent,
  prepareContent,
} from "./bytes";
import { NotesError } from "./errors";
import type { NotesRepository } from "./repository";
import { projectStream } from "./interchange";
import { frontier } from "./graph";

const MAX_ARCHIVE_BYTES = 256 * 1024 * 1024;
const MAX_ENTRIES = 60000; // classic ZIP only; bounded before allocating an entry table
const manifestSchema = z
  .object({
    format: z.literal("sylf-notes-archive"),
    formatVersion: z.literal(1),
    minimumReaderVersion: z.literal(1),
    library: librarySchema,
    documents: z.array(idSchema).max(10000),
    revisions: z.array(hashSchema).max(50000),
    objects: z.array(objectRefSchema).max(MAX_ENTRIES - 1),
    interchange: z
      .array(
        z
          .object({
            documentId: idSchema,
            streamId: idSchema,
            epoch: z.number().int().positive(),
            sourceHeads: z.array(hashSchema),
            content: contentRefSchema,
          })
          .strict()
      )
      .max(10000)
      .default([]),
  })
  .passthrough();
const PATH = /^(manifest\.json|objects\/[a-f0-9]{64})$/;

// STORE-only v1 deliberately has no decompression path. This bounds actual bytes,
// rejects ZIP bombs/ambiguous headers, and permits zero-copy entry views on import.
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = crcTable[(c ^ byte) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function readStoredZip(input: Uint8Array): Map<string, Uint8Array> {
  if (input.length > MAX_ARCHIVE_BYTES || input.length < 22)
    throw new NotesError("LIMIT", "Archive size is unsupported.");
  const bytes = input,
    view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    entries = new Map<string, Uint8Array>();
  const bad = () => {
    throw new NotesError(
      "CORRUPT",
      "Ambiguous, damaged or unsupported portable archive."
    );
  };
  const end = bytes.length - 22;
  if (
    view.getUint32(end, true) !== 0x06054b50 ||
    view.getUint16(end + 20, true) !== 0 ||
    view.getUint16(end + 4, true) !== 0 ||
    view.getUint16(end + 6, true) !== 0
  )
    bad();
  const count = view.getUint16(end + 10, true),
    centralSize = view.getUint32(end + 12, true),
    centralStart = view.getUint32(end + 16, true);
  if (
    count < 1 ||
    count > MAX_ENTRIES ||
    count !== view.getUint16(end + 8, true) ||
    centralStart + centralSize !== end
  )
    bad();
  let central = centralStart,
    expectedLocal = 0;
  for (let i = 0; i < count; i++) {
    if (central + 46 > end || view.getUint32(central, true) !== 0x02014b50)
      bad();
    const flags = view.getUint16(central + 8, true),
      method = view.getUint16(central + 10, true),
      crc = view.getUint32(central + 16, true);
    const size = view.getUint32(central + 24, true),
      compressed = view.getUint32(central + 20, true),
      nameLength = view.getUint16(central + 28, true);
    const extra = view.getUint16(central + 30, true),
      comment = view.getUint16(central + 32, true),
      local = view.getUint32(central + 42, true);
    if (
      flags & ~0x800 ||
      method !== 0 ||
      compressed !== size ||
      extra ||
      comment ||
      view.getUint16(central + 34, true) ||
      local !== expectedLocal ||
      central + 46 + nameLength > end ||
      local + 30 > centralStart
    )
      bad();
    let name: string;
    try {
      name = new TextDecoder("utf-8", { fatal: true }).decode(
        bytes.subarray(central + 46, central + 46 + nameLength)
      );
    } catch {
      return bad();
    }
    if (!PATH.test(name) || entries.has(name) || name.length !== nameLength)
      bad();
    if (
      view.getUint32(local, true) !== 0x04034b50 ||
      view.getUint16(local + 6, true) !== flags ||
      view.getUint16(local + 8, true) !== method ||
      view.getUint32(local + 14, true) !== crc ||
      view.getUint32(local + 18, true) !== size ||
      view.getUint32(local + 22, true) !== size ||
      view.getUint16(local + 26, true) !== nameLength ||
      view.getUint16(local + 28, true)
    )
      bad();
    const dataStart = local + 30 + nameLength,
      dataEnd = dataStart + size;
    if (
      dataEnd > centralStart ||
      new TextDecoder().decode(bytes.subarray(local + 30, dataStart)) !== name
    )
      bad();
    const data = bytes.subarray(dataStart, dataEnd);
    if (crc32(data) !== crc) bad();
    entries.set(name, data);
    expectedLocal = dataEnd;
    central += 46 + nameLength;
  }
  if (
    central !== end ||
    expectedLocal !== centralStart ||
    !entries.has("manifest.json")
  )
    bad();
  return entries;
}

export async function exportNotes(
  repository: NotesRepository,
  documentIds?: string[],
  options: { nativeOnly?: boolean } = {}
): Promise<{ bytes: Uint8Array; revisionIds: string[] }> {
  const { descriptor: library } = await repository.library();
  const revisions = (await repository.listRevisions()).filter(
    (r) => !documentIds || documentIds.includes(r.commit.documentId)
  );
  if (
    documentIds?.some(
      (id) => !revisions.some((r) => r.commit.documentId === id)
    )
  )
    throw new NotesError("NOT_FOUND", "An export selection is unavailable.");
  const originals = await repository.closure(revisions.map((r) => r.id)),
    objectMap = new Map(originals.map((o) => [o.hash, o]));
  const interchange: z.infer<typeof manifestSchema>["interchange"] = [],
    seenStreams = new Set<string>(),
    seenDescriptors = new Set<string>();
  for (const revision of options.nativeOnly ? [] : revisions) {
    if (seenDescriptors.has(revision.commit.descriptor.hash)) continue;
    seenDescriptors.add(revision.commit.descriptor.hash);
    const descriptor = await repository.descriptor(revision.commit.descriptor);
    const heads = frontier(
      revisions.filter((r) => r.commit.documentId === descriptor.documentId)
    );
    for (const stream of descriptor.streams) {
      const key =
        descriptor.documentId + ":" + stream.streamId + ":" + stream.epoch;
      if (seenStreams.has(key)) continue;
      seenStreams.add(key);
      const loaded = await repository.loadStream(
        descriptor.documentId,
        stream.streamId,
        stream.epoch,
        heads
      );
      try {
        const prepared = await prepareContent(
          encodeJson(projectStream(loaded.doc, stream), CONTENT_BYTES)
        );
        for (const object of prepared.objects)
          objectMap.set(object.hash, object);
        interchange.push({
          documentId: descriptor.documentId,
          streamId: stream.streamId,
          epoch: stream.epoch,
          sourceHeads: heads,
          content: prepared.content,
        });
      } finally {
        loaded.doc.destroy();
      }
    }
  }
  const objects = [...objectMap.values()];
  const manifest = manifestSchema.parse({
    format: "sylf-notes-archive",
    formatVersion: 1,
    minimumReaderVersion: 1,
    library,
    documents: [...new Set(revisions.map((r) => r.commit.documentId))].sort(),
    revisions: revisions.map((r) => r.id).sort(),
    objects: objects
      .map((o) => ({ hash: o.hash, size: o.bytes.length }))
      .sort((a, b) => (a.hash < b.hash ? -1 : 1)),
    interchange,
  });
  const files: Record<string, Uint8Array> = {
    "manifest.json": encodeJson(manifest),
  };
  for (const object of objects) files["objects/" + object.hash] = object.bytes;
  if (
    Object.values(files).reduce((sum, bytes) => sum + bytes.length, 0) +
      Object.keys(files).length * 256 >
    MAX_ARCHIVE_BYTES
  )
    throw new NotesError(
      "LIMIT",
      "Export exceeds this version's in-memory archive limit; export a smaller selection."
    );
  const bytes = zipSync(files, { level: 0 });
  repository.session.assert();
  return { bytes, revisionIds: manifest.revisions };
}

/** Emergency native archive assembled from memory + durable originals, without a successful local write. */
export async function exportNotesRecovery(
  repository: NotesRepository,
  pending:
    | {
        documentId: string;
        streamId: string;
        epoch: number;
        heads: string[];
        descriptor: ObjectRef;
        bytes: Uint8Array;
      }
    | {
        documentId: string;
        streamId: string;
        epoch: number;
        heads: string[];
        descriptor: ObjectRef;
        bytes: Uint8Array;
      }[]
) {
  repository.session.assert();
  const snapshots = Array.isArray(pending) ? pending : [pending];
  if (!snapshots.length)
    throw new NotesError("NOT_FOUND", "No unacknowledged memory needs export.");
  const base = await exportNotes(
    repository,
    [...new Set(snapshots.map((s) => s.documentId))],
    {
      nativeOnly: true,
    }
  );
  const files = readStoredZip(base.bytes),
    manifest = manifestSchema.parse(decodeJson(files.get("manifest.json")!));
  for (const pending of snapshots) {
    const parents = (await repository.listRevisions(pending.documentId)).filter(
      (r) => pending.heads.includes(r.id)
    );
    if (parents.length !== pending.heads.length)
      throw new NotesError(
        "CORRUPT",
        "Recovery ancestry is incomplete; retain the memory buffer."
      );
    const prepared = await prepareContent(pending.bytes);
    const commit = commitSchema.parse({
      format: "sylf-notes-commit",
      formatVersion: 1,
      minimumReaderVersion: 1,
      libraryId: repository.libraryId,
      documentId: pending.documentId,
      operationId: newId(),
      writerId: newId(),
      sequence: Math.max(0, ...parents.map((p) => p.commit.sequence)) + 1,
      parents: pending.heads,
      kind: "edit",
      descriptor: pending.descriptor,
      updates: [
        {
          streamId: pending.streamId,
          epoch: pending.epoch,
          codec: "yjs13-update-v1",
          role: "update",
          content: prepared.content,
          covers: [],
        },
      ],
      createdAt: new Date().toISOString(),
      extensions: { recoveryExport: true },
    });
    const bytes = encodeJson(commit),
      id = await digest(bytes),
      objects = [...prepared.objects, { hash: id, bytes }];
    for (const object of objects) {
      files.set("objects/" + object.hash, object.bytes);
      if (!manifest.objects.some((ref) => ref.hash === object.hash))
        manifest.objects.push({ hash: object.hash, size: object.bytes.length });
    }
    manifest.revisions.push(id);
  }
  files.set("manifest.json", encodeJson(manifest));
  if (
    [...files.values()].reduce((n, b) => n + b.length, 0) + files.size * 256 >
    MAX_ARCHIVE_BYTES
  )
    throw new NotesError(
      "LIMIT",
      "Recovery archive exceeds its memory limit. Keep this editor open."
    );
  const archive = zipSync(Object.fromEntries(files), { level: 0 });
  repository.session.assert();
  return archive;
}

export type ArchiveInspection =
  | { state: "read-only"; reason: string; original: Uint8Array }
  | {
      state: "supported";
      manifest: z.infer<typeof manifestSchema>;
      objects: PreparedObject[];
    };
export async function inspectNotesArchive(
  input: Uint8Array
): Promise<ArchiveInspection> {
  const original = input.slice(),
    entries = readStoredZip(original),
    raw = decodeJson(entries.get("manifest.json")!);
  if (
    !raw ||
    typeof raw !== "object" ||
    !("format" in raw) ||
    raw.format !== "sylf-notes-archive"
  )
    throw new NotesError("CORRUPT", "This is not a Sylf Notes archive.");
  if (
    !("formatVersion" in raw) ||
    raw.formatVersion !== 1 ||
    !("minimumReaderVersion" in raw) ||
    raw.minimumReaderVersion !== 1
  )
    return {
      state: "read-only",
      reason: "A compatible reader is required; original archive retained.",
      original,
    };
  const parsed = manifestSchema.safeParse(raw);
  if (!parsed.success)
    throw new NotesError("CORRUPT", "Invalid archive manifest.");
  const manifest = parsed.data,
    expected = new Set(manifest.objects.map((o) => "objects/" + o.hash));
  if (
    expected.size !== manifest.objects.length ||
    new Set(manifest.revisions).size !== manifest.revisions.length ||
    new Set(manifest.documents).size !== manifest.documents.length ||
    entries.size !== expected.size + 1
  )
    throw new NotesError("CORRUPT", "Duplicate or undeclared archive objects.");
  const objects: PreparedObject[] = [];
  for (const ref of manifest.objects) {
    const bytes = entries.get("objects/" + ref.hash);
    if (
      !bytes ||
      bytes.length !== ref.size ||
      (await digest(bytes)) !== ref.hash
    )
      throw new NotesError("CORRUPT", "Archive object failed verification.");
    objects.push({ hash: ref.hash, bytes });
  }
  for (const id of manifest.revisions)
    if (!expected.has("objects/" + id))
      throw new NotesError("CORRUPT", "Archive revision bytes are absent.");
  const revisionSet = new Set(manifest.revisions),
    objectMap = new Map(objects.map((o) => [o.hash, o.bytes]));
  for (const projection of manifest.interchange) {
    if (
      !manifest.documents.includes(projection.documentId) ||
      projection.sourceHeads.some((id) => !revisionSet.has(id))
    )
      throw new NotesError("CORRUPT", "Interchange source identity mismatch.");
    await joinContent(projection.content, async (hash) => {
      const bytes = objectMap.get(hash);
      if (!bytes)
        throw new NotesError("CORRUPT", "Interchange bytes are missing.");
      return bytes;
    });
  }
  return { state: "supported", manifest, objects };
}

export async function importNotes(
  repository: NotesRepository,
  input: Uint8Array
): Promise<
  | { state: "imported"; revisions: number }
  | Extract<ArchiveInspection, { state: "read-only" }>
> {
  repository.session.assert();
  const inspected = await inspectNotesArchive(input);
  repository.session.assert();
  if (inspected.state === "read-only") return inspected;
  const { descriptor } = await repository.library();
  if (
    inspected.manifest.library.libraryId !== descriptor.libraryId ||
    inspected.manifest.library.ownerRef !== descriptor.ownerRef
  )
    throw new NotesError(
      "OWNERSHIP",
      "Import requires the original owner's enrolled library. Copy/remap is a separate operation."
    );
  await repository.installBatch(
    inspected.objects,
    inspected.manifest.revisions,
    "archive"
  );
  return { state: "imported", revisions: inspected.manifest.revisions.length };
}
