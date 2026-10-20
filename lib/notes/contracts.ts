import { z } from "zod";

export const FORMAT_VERSION = 1;
export const OBJECT_BYTES = 4 * 1024 * 1024;
export const CONTENT_BYTES = 256 * 1024 * 1024;
export const STREAM_BYTES = 64 * 1024 * 1024;
export const idSchema = z.uuid();
export const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const natural = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const positive = natural.min(1);
const extensions = z.record(z.string().max(128), z.json()).default({});
export const objectRefSchema = z
  .object({ hash: hashSchema, size: natural.max(OBJECT_BYTES) })
  .strict();
export const contentRefSchema = z
  .object({
    hash: hashSchema,
    size: natural.max(CONTENT_BYTES),
    parts: z.array(objectRefSchema).min(1).max(1024),
  })
  .strict()
  .refine(
    (v) => v.parts.reduce((sum, p) => sum + p.size, 0) === v.size,
    "Chunk lengths must match content length"
  );
export const streamSchema = z
  .object({
    streamId: idSchema,
    epoch: positive,
    codec: z.string().min(1).max(64),
    adapter: z.string().min(1).max(128),
    schemaVersion: positive.max(1),
    projection: z
      .object({
        root: z.string().min(1).max(128),
        type: z.enum(["xml", "text", "map", "array"]),
      })
      .strict()
      .optional(),
    predecessor: z
      .object({
        streamId: idSchema,
        epoch: positive,
        heads: z.array(hashSchema).max(10000),
      })
      .optional(),
  })
  .passthrough();
export const assetSchema = z
  .object({
    assetId: hashSchema,
    mediaType: z.string().min(1).max(128),
    name: z.string().max(500),
    content: contentRefSchema,
    extensions,
  })
  .passthrough()
  .refine(
    (v) => v.assetId === v.content.hash,
    "Asset identity must match original bytes"
  );
export const documentSchema = z
  .object({
    format: z.literal("sylf-notes"),
    formatVersion: z.literal(1),
    minimumReaderVersion: positive.max(1),
    libraryId: idSchema,
    documentId: idSchema,
    kind: z.enum(["flow", "notebook", "pdf"]),
    title: z.string().max(500),
    schemaVersion: positive.max(1),
    folderId: idSchema.nullable().default(null),
    subjectId: z.string().max(128).nullable().default(null),
    streams: z.array(streamSchema).max(10000),
    pages: z
      .array(
        z
          .object({
            pageId: idSchema,
            streamId: idSchema,
            width: z.number().positive().max(100000),
            height: z.number().positive().max(100000),
            originalAssetId: hashSchema.optional(),
            sourcePage: natural.optional(),
            extensions,
          })
          .passthrough()
      )
      .max(10000)
      .default([]),
    assets: z.array(assetSchema).max(10000).default([]),
    requiredFeatures: z.array(z.string().max(128)).max(128).default([]),
    extensions,
  })
  .passthrough()
  .superRefine((doc, ctx) => {
    for (const [name, values] of [
      ["stream", doc.streams.map((s) => s.streamId)],
      ["page", doc.pages.map((p) => p.pageId)],
      ["asset", doc.assets.map((a) => a.assetId)],
    ] as const) {
      if (new Set(values).size !== values.length)
        ctx.addIssue({ code: "custom", message: `Duplicate ${name} identity` });
    }
    const streams = new Set(doc.streams.map((s) => s.streamId)),
      assets = new Set(doc.assets.map((a) => a.assetId));
    if (
      doc.pages.some(
        (p) =>
          !streams.has(p.streamId) ||
          (p.originalAssetId && !assets.has(p.originalAssetId))
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "Page references an absent stream or original",
      });
  });
export const librarySchema = z
  .object({
    format: z.literal("sylf-notes"),
    formatVersion: z.literal(1),
    minimumReaderVersion: positive.max(1),
    libraryId: idSchema,
    ownerRef: z.string().min(1).max(128),
    bindingGeneration: positive,
    extensions,
  })
  .passthrough();
/** Supplied by the authenticated provisioning adapter in Phase 3, never inferred from a login grant. */
export const bindingSchema = z
  .object({
    provider: z.enum(["google-drive", "onedrive"]),
    accountId: z.string().min(1).max(512),
    rootId: z.string().min(1).max(512),
    generation: positive,
    verifiedAt: z.iso.datetime(),
    probeHash: hashSchema,
  })
  .strict();
export const updateSchema = z
  .object({
    streamId: idSchema,
    epoch: positive,
    codec: z.literal("yjs13-update-v1"),
    role: z.enum(["update", "checkpoint"]),
    content: contentRefSchema,
    covers: z.array(hashSchema).max(10000).default([]),
  })
  .strict();
export const commitSchema = z
  .object({
    format: z.literal("sylf-notes-commit"),
    formatVersion: z.literal(1),
    minimumReaderVersion: positive.max(1),
    libraryId: idSchema,
    documentId: idSchema,
    operationId: idSchema,
    writerId: idSchema,
    sequence: positive,
    parents: z.array(hashSchema).max(10000),
    kind: z.enum([
      "create",
      "edit",
      "checkpoint",
      "tombstone",
      "restore",
      "migrate",
    ]),
    descriptor: objectRefSchema,
    updates: z.array(updateSchema).max(10000),
    createdAt: z.iso.datetime(),
    extensions,
  })
  .passthrough()
  .refine(
    (c) => new Set(c.parents).size === c.parents.length,
    "Duplicate parents"
  )
  .refine(
    (c) =>
      new Set(c.updates.map((u) => u.streamId + ":" + u.epoch)).size ===
      c.updates.length,
    "Duplicate stream payloads"
  );

export type ObjectRef = z.infer<typeof objectRefSchema>;
export type ContentRef = z.infer<typeof contentRefSchema>;
export type DocumentDescriptor = z.infer<typeof documentSchema>;
export type LibraryDescriptor = z.infer<typeof librarySchema>;
export type CloudBinding = z.infer<typeof bindingSchema>;
export type AssetDescriptor = z.infer<typeof assetSchema>;
export type NotesCommit = z.infer<typeof commitSchema>;
export type StreamUpdate = z.infer<typeof updateSchema>;
export interface Revision {
  id: string;
  commit: NotesCommit;
}
export interface PreparedObject {
  hash: string;
  bytes: Uint8Array;
}
export interface SaveRequest {
  operationId: string;
  documentId: string;
  parents: string[];
  kind?: NotesCommit["kind"];
  descriptor: DocumentDescriptor | ObjectRef;
  updates?: {
    streamId: string;
    epoch: number;
    bytes: Uint8Array;
    role?: "update" | "checkpoint";
  }[];
  extensions?: Record<string, z.infer<ReturnType<typeof z.json>>>;
}
export interface SaveReceipt {
  revisionId: string;
  state: "local-durable";
  pendingCloud: boolean;
}
export interface DocumentView {
  descriptor: DocumentDescriptor;
  descriptorRef: ObjectRef;
  heads: string[];
  state: "active" | "trashed" | "conflict";
  alternatives: ObjectRef[];
}
export const newId = () => crypto.randomUUID();
