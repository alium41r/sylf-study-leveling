import { createHash, randomUUID } from "node:crypto";
import { getStorageClient } from "../../../supabase-storage";
import { indexPdf } from "../../import/pdf-runtime";
import { DocumentsSchema, type DocumentMetadata } from "../intelligence/schemas/documents";
import { PlannerDatabase, clock, reject, rows, type Sql } from "./database";
import { ownedPlan } from "./intents";
import type { ResearchEvidenceV2 } from "../contracts";

export const documentContentHash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const bucket = "planner-documents";
export interface PrivateDocumentStore { write(path: string, bytes: Uint8Array, mime: string): Promise<void>; read(path: string): Promise<Uint8Array>; remove(path: string): Promise<void> }
/** Uses the existing server credential owner; no signed/public URLs are returned. */
export const supabaseDocumentStore: PrivateDocumentStore = {
  async write(path, bytes, mime) {
    const client = await getStorageClient(); const current = await client.storage.getBucket(bucket);
    if (current.error) {
      const created = await client.storage.createBucket(bucket, { public: false, fileSizeLimit: 3 * 1024 * 1024, allowedMimeTypes: ["application/pdf", "text/plain"] });
      if (created.error && created.error.message !== "The resource already exists") reject("SAVE_FAILED", "Private document storage is unavailable.", "RESEARCH");
    }
    const verified = await client.storage.getBucket(bucket);
    if (verified.error || verified.data.public) reject("SAVE_FAILED", "Document storage must be private.", "RESEARCH");
    const uploaded = await client.storage.from(bucket).upload(path, bytes, { contentType: mime, upsert: false });
    if (uploaded.error) reject("SAVE_FAILED", "The private document could not be saved.", "RESEARCH");
  },
  async read(path) {
    const client = await getStorageClient(); const info = await client.storage.getBucket(bucket);
    if (info.error || info.data.public) reject("REFERENCE_NOT_OWNED", "Private document storage is unavailable.", "RESEARCH");
    const result = await client.storage.from(bucket).download(path);
    if (result.error || !result.data || result.data.size > 3 * 1024 * 1024) reject("REFERENCE_NOT_OWNED", "The owned document is unavailable.", "RESEARCH");
    return new Uint8Array(await result.data.arrayBuffer());
  },
  async remove(path) { const result = await (await getStorageClient()).storage.from(bucket).remove([path]); if (result.error) reject("SAVE_FAILED", "Private document removal failed."); },
};
function verifyPath(ownerId: number, metadata: DocumentMetadata) {
  if (metadata.storagePath !== `${ownerId}/${metadata.documentId}`) reject("REFERENCE_NOT_OWNED", "The document location does not belong to this student.", "RESEARCH");
}
export async function ownedDocumentMetadata(sql: Sql, ownerId: number, documentId: string): Promise<DocumentMetadata> {
  const plans = await rows<{ researchDocuments: unknown }>(sql, 'SELECT "researchDocuments" FROM "PlannerPlan" WHERE "userId"=$1 AND "contractVersion"=2 AND "researchDocuments" @> $2::jsonb',
    [ownerId, JSON.stringify([{ documentId }])]);
  const documents = plans.flatMap(p => DocumentsSchema.parse(p.researchDocuments));
  const matches = documents.filter(d => d.documentId === documentId);
  if (matches.length !== 1) reject("REFERENCE_NOT_OWNED", "The owned document is unavailable.", "RESEARCH");
  verifyPath(ownerId, matches[0]); return matches[0];
}
/** Caller-supplied ownership/hash is never an upload receipt. Public intent APIs
 * also retain their independent prohibition on minting research attestations. */
export async function verifyOwnedResearchDocuments(sql: Sql, ownerId: number, evidence: ResearchEvidenceV2) {
  for (const source of evidence.sources) if (source.location.kind === "OWNED_DOCUMENT") {
    if (source.location.ownerId !== ownerId) reject("REFERENCE_NOT_OWNED", "The document does not belong to this student.", "RESEARCH");
    const metadata = await ownedDocumentMetadata(sql, ownerId, source.location.documentId);
    if (metadata.contentHash !== source.contentHash) reject("STALE_CONTEXT", "The document content differs from the verified upload.", "RESEARCH");
  }
}
export class DocumentRepository {
  constructor(readonly db: PlannerDatabase, readonly store: PrivateDocumentStore = supabaseDocumentStore) {}
  async upload(ownerId: number, planId: string, key: string, title: string, mimeType: "application/pdf" | "text/plain", bytes: Uint8Array) {
    title=title.trim();
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(key) || !title.trim() || title.length > 200 || bytes.length < 1 || bytes.length > 3 * 1024 * 1024)
      reject("PAYLOAD_TOO_LARGE", "Invalid bounded document upload.", "RESEARCH");
    if (mimeType === "application/pdf") { try { indexPdf(Buffer.from(bytes)); } catch { reject("INVALID_OUTPUT", "This PDF cannot be safely indexed.", "RESEARCH"); } }
    else if (mimeType === "text/plain") {
      try { const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); if (text.includes("\0") || !text.trim()) throw new Error(); }
      catch { reject("INVALID_OUTPUT", "The document must contain valid UTF-8 text.", "RESEARCH"); }
    } else reject("INVALID_OUTPUT", "Unsupported document type.", "RESEARCH");
    if(mimeType!=="application/pdf" && Buffer.from(bytes).subarray(0,1024).toString("latin1").includes("%PDF-")) reject("INVALID_OUTPUT","PDF content must use the PDF reader.","RESEARCH");
    const contentHash = documentContentHash(bytes);
    const inspect = async (sql: Sql) => {
      const plan = await ownedPlan(sql, ownerId, planId);
      if (plan.contractVersion !== 2 || plan.state === "ARCHIVED") reject("INTENT_CONFLICT", "Choose an active owned V2 Plan.");
      const docs = DocumentsSchema.parse(plan.researchDocuments ?? []); const old = docs.find(d=>d.key===key);
      if (old && (old.contentHash !== contentHash || old.title !== title || old.mimeType !== mimeType)) reject("IDEMPOTENCY_MISMATCH", "The document key belongs to different content.");
      if (!old && docs.length >= 9) reject("PAYLOAD_TOO_LARGE", "The Plan already retains nine documents.", "RESEARCH");
      return { docs, old };
    };
    const before = await this.db.coordinated(ownerId,inspect); if (before.old) return before.old;
    const documentId = randomUUID(); const storagePath = `${ownerId}/${documentId}`;
    await this.store.write(storagePath,bytes,mimeType);
    let adopted = false;
    try {
      const result = await this.db.coordinated(ownerId, async sql => {
        const { docs, old } = await inspect(sql); if (old) return old;
        const metadata: DocumentMetadata = { documentId,key,title,mimeType,bytes:bytes.length,contentHash,storagePath,verifiedAt:(await clock(sql)).toISOString() };
        const next = DocumentsSchema.parse([...docs,metadata]);
        await sql.query('UPDATE "PlannerPlan" SET "researchDocuments"=$2 WHERE id=$1', [planId,JSON.stringify(next)]); return metadata;
      });
      adopted = result.documentId === documentId; return result;
    } finally { if (!adopted) await this.store.remove(storagePath); }
  }
  async read(ownerId: number, documentId: string) {
    const metadata = await this.db.coordinated(ownerId,sql=>ownedDocumentMetadata(sql,ownerId,documentId));
    const bytes = await this.store.read(metadata.storagePath);
    if (bytes.length !== metadata.bytes || documentContentHash(bytes) !== metadata.contentHash) reject("STALE_CONTEXT", "The stored document failed content verification.", "RESEARCH");
    return { metadata,bytes };
  }
}
