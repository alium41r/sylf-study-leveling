import { z } from "zod";
import { DigestV2Schema, DurableIdV2Schema, InstantV2Schema, TitleV2Schema, withPlannerEnvelope, unique } from "../../contracts";
export const DocumentMetadataSchema = z.strictObject({ documentId: DurableIdV2Schema, key: z.string().regex(/^[A-Za-z0-9_-]{8,100}$/),
  title: TitleV2Schema, storagePath: z.string().max(200), mimeType: z.enum(["application/pdf", "text/plain"]),
  bytes: z.number().int().min(1).max(3 * 1024 * 1024), contentHash: DigestV2Schema, verifiedAt: InstantV2Schema });
export const DocumentsSchema = withPlannerEnvelope(z.array(DocumentMetadataSchema).max(9).superRefine((docs,ctx) => {
  unique(docs.map(d=>d.documentId),ctx,[]); unique(docs.map(d=>d.key),ctx,[]);
}),32 * 1024);
export type DocumentMetadata = z.infer<typeof DocumentMetadataSchema>;
