import { z } from "zod";
import { dateKeySchema } from "./contracts";
export const RECOGNITION_ENGINE = "trocr-small-en-2432e24-q8";
export const recognitionWriteSchema = z.strictObject({
  id: z.uuid(),
  revision: z.number().int().nonnegative(),
  noteId: z.uuid(),
  noteRevision: z.number().int().positive(),
  strokeIds: z
    .array(z.uuid())
    .min(1)
    .max(1000)
    .refine((v) => new Set(v).size === v.length),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  text: z.string().trim().min(1).max(4000),
  engine: z.literal(RECOGNITION_ENGINE),
});
export const noteSearchSchema = z
  .strictObject({
    query: z.string().trim().max(160).default(""),
    start: dateKeySchema.optional(),
    end: dateKeySchema.optional(),
    recognizedOnly: z.boolean().default(false),
    cursor: z.string().max(180).optional(),
  })
  .refine(
    (v) => !v.start || !v.end || v.end >= v.start,
    "End date must not precede start date."
  );
export interface RecognitionResult {
  id: string;
  revision: number;
  noteId: string;
  strokeIds: string[];
  sourceHash: string;
  text: string;
  engine: string;
}
export interface NoteSearchResult {
  id: string;
  dateKey: string;
  title: string;
  excerpt: string;
  recognized: boolean;
  revision: number;
}
