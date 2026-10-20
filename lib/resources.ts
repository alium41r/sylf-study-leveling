import { z } from "zod";
import { idSchema } from "./notes/contracts";

/** Shared references only. Workspaces/Sessions own relationships, never document bytes. */
export const notesResourceSchema = z
  .object({
    version: z.literal(1),
    type: z.literal("sylf-note"),
    libraryId: idSchema,
    documentId: idSchema,
    pageId: idSchema.optional(),
  })
  .strict();
export type NotesResourceReference = z.infer<typeof notesResourceSchema>;
export interface ResourceCapabilities {
  open: boolean;
  edit: boolean;
  resume: boolean;
  offline: boolean;
  export: boolean;
}
export const notesResumeSchema = z
  .object({
    version: z.literal(1),
    pageId: idSchema.optional(),
    blockId: z.string().max(200).optional(),
    scrollRatio: z.number().min(0).max(1).default(0),
    inkViewport: z
      .object({
        zoom: z.number().min(0.1).max(8),
        x: z.number().finite().min(-100000).max(100000),
        y: z.number().finite().min(-100000).max(100000),
      })
      .strict()
      .optional(),
  })
  .strict();
export type NotesResumePosition = z.infer<typeof notesResumeSchema>;
export function notesResourceId(raw: NotesResourceReference) {
  const ref = notesResourceSchema.parse(raw);
  return `sylf-note:${ref.libraryId}:${ref.documentId}${ref.pageId ? `:${ref.pageId}` : ""}`;
}
export function notesResourceURL(raw: NotesResourceReference) {
  const ref = notesResourceSchema.parse(raw);
  return `/notes?${new URLSearchParams({ library: ref.libraryId, document: ref.documentId, ...(ref.pageId ? { page: ref.pageId } : {}) })}`;
}
export interface NotesResourceOpener {
  open(
    ref: NotesResourceReference,
    position?: NotesResumePosition
  ): Promise<void>;
}
