"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentRepository = exports.supabaseDocumentStore = exports.documentContentHash = void 0;
exports.ownedDocumentMetadata = ownedDocumentMetadata;
exports.verifyOwnedResearchDocuments = verifyOwnedResearchDocuments;
const node_crypto_1 = require("node:crypto");
const supabase_storage_1 = require("../../../supabase-storage");
const pdf_runtime_1 = require("../../import/pdf-runtime");
const documents_1 = require("../intelligence/schemas/documents");
const database_1 = require("./database");
const intents_1 = require("./intents");
const documentContentHash = (bytes) => (0, node_crypto_1.createHash)("sha256").update(bytes).digest("hex");
exports.documentContentHash = documentContentHash;
const bucket = "planner-documents";
/** Uses the existing server credential owner; no signed/public URLs are returned. */
exports.supabaseDocumentStore = {
    async write(path, bytes, mime) {
        const client = await (0, supabase_storage_1.getStorageClient)();
        const current = await client.storage.getBucket(bucket);
        if (current.error) {
            const created = await client.storage.createBucket(bucket, { public: false, fileSizeLimit: 3 * 1024 * 1024, allowedMimeTypes: ["application/pdf", "text/plain"] });
            if (created.error && created.error.message !== "The resource already exists")
                (0, database_1.reject)("SAVE_FAILED", "Private document storage is unavailable.", "RESEARCH");
        }
        const verified = await client.storage.getBucket(bucket);
        if (verified.error || verified.data.public)
            (0, database_1.reject)("SAVE_FAILED", "Document storage must be private.", "RESEARCH");
        const uploaded = await client.storage.from(bucket).upload(path, bytes, { contentType: mime, upsert: false });
        if (uploaded.error)
            (0, database_1.reject)("SAVE_FAILED", "The private document could not be saved.", "RESEARCH");
    },
    async read(path) {
        const client = await (0, supabase_storage_1.getStorageClient)();
        const info = await client.storage.getBucket(bucket);
        if (info.error || info.data.public)
            (0, database_1.reject)("REFERENCE_NOT_OWNED", "Private document storage is unavailable.", "RESEARCH");
        const result = await client.storage.from(bucket).download(path);
        if (result.error || !result.data || result.data.size > 3 * 1024 * 1024)
            (0, database_1.reject)("REFERENCE_NOT_OWNED", "The owned document is unavailable.", "RESEARCH");
        return new Uint8Array(await result.data.arrayBuffer());
    },
    async remove(path) { const result = await (await (0, supabase_storage_1.getStorageClient)()).storage.from(bucket).remove([path]); if (result.error)
        (0, database_1.reject)("SAVE_FAILED", "Private document removal failed."); },
};
function verifyPath(ownerId, metadata) {
    if (metadata.storagePath !== `${ownerId}/${metadata.documentId}`)
        (0, database_1.reject)("REFERENCE_NOT_OWNED", "The document location does not belong to this student.", "RESEARCH");
}
async function ownedDocumentMetadata(sql, ownerId, documentId) {
    const plans = await (0, database_1.rows)(sql, 'SELECT "researchDocuments" FROM "PlannerPlan" WHERE "userId"=$1 AND "contractVersion"=2 AND "researchDocuments" @> $2::jsonb', [ownerId, JSON.stringify([{ documentId }])]);
    const documents = plans.flatMap(p => documents_1.DocumentsSchema.parse(p.researchDocuments));
    const matches = documents.filter(d => d.documentId === documentId);
    if (matches.length !== 1)
        (0, database_1.reject)("REFERENCE_NOT_OWNED", "The owned document is unavailable.", "RESEARCH");
    verifyPath(ownerId, matches[0]);
    return matches[0];
}
/** Caller-supplied ownership/hash is never an upload receipt. Public intent APIs
 * also retain their independent prohibition on minting research attestations. */
async function verifyOwnedResearchDocuments(sql, ownerId, evidence) {
    for (const source of evidence.sources)
        if (source.location.kind === "OWNED_DOCUMENT") {
            if (source.location.ownerId !== ownerId)
                (0, database_1.reject)("REFERENCE_NOT_OWNED", "The document does not belong to this student.", "RESEARCH");
            const metadata = await ownedDocumentMetadata(sql, ownerId, source.location.documentId);
            if (metadata.contentHash !== source.contentHash)
                (0, database_1.reject)("STALE_CONTEXT", "The document content differs from the verified upload.", "RESEARCH");
        }
}
class DocumentRepository {
    db;
    store;
    constructor(db, store = exports.supabaseDocumentStore) {
        this.db = db;
        this.store = store;
    }
    async upload(ownerId, planId, key, title, mimeType, bytes) {
        title = title.trim();
        if (!/^[A-Za-z0-9_-]{8,100}$/.test(key) || !title.trim() || title.length > 200 || bytes.length < 1 || bytes.length > 3 * 1024 * 1024)
            (0, database_1.reject)("PAYLOAD_TOO_LARGE", "Invalid bounded document upload.", "RESEARCH");
        if (mimeType === "application/pdf") {
            try {
                (0, pdf_runtime_1.indexPdf)(Buffer.from(bytes));
            }
            catch {
                (0, database_1.reject)("INVALID_OUTPUT", "This PDF cannot be safely indexed.", "RESEARCH");
            }
        }
        else if (mimeType === "text/plain") {
            try {
                const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
                if (text.includes("\0") || !text.trim())
                    throw new Error();
            }
            catch {
                (0, database_1.reject)("INVALID_OUTPUT", "The document must contain valid UTF-8 text.", "RESEARCH");
            }
        }
        else
            (0, database_1.reject)("INVALID_OUTPUT", "Unsupported document type.", "RESEARCH");
        if (mimeType !== "application/pdf" && Buffer.from(bytes).subarray(0, 1024).toString("latin1").includes("%PDF-"))
            (0, database_1.reject)("INVALID_OUTPUT", "PDF content must use the PDF reader.", "RESEARCH");
        const contentHash = (0, exports.documentContentHash)(bytes);
        const inspect = async (sql) => {
            const plan = await (0, intents_1.ownedPlan)(sql, ownerId, planId);
            if (plan.contractVersion !== 2 || plan.state === "ARCHIVED")
                (0, database_1.reject)("INTENT_CONFLICT", "Choose an active owned V2 Plan.");
            const docs = documents_1.DocumentsSchema.parse(plan.researchDocuments ?? []);
            const old = docs.find(d => d.key === key);
            if (old && (old.contentHash !== contentHash || old.title !== title || old.mimeType !== mimeType))
                (0, database_1.reject)("IDEMPOTENCY_MISMATCH", "The document key belongs to different content.");
            if (!old && docs.length >= 9)
                (0, database_1.reject)("PAYLOAD_TOO_LARGE", "The Plan already retains nine documents.", "RESEARCH");
            return { docs, old };
        };
        const before = await this.db.coordinated(ownerId, inspect);
        if (before.old)
            return before.old;
        const documentId = (0, node_crypto_1.randomUUID)();
        const storagePath = `${ownerId}/${documentId}`;
        await this.store.write(storagePath, bytes, mimeType);
        let adopted = false;
        try {
            const result = await this.db.coordinated(ownerId, async (sql) => {
                const { docs, old } = await inspect(sql);
                if (old)
                    return old;
                const metadata = { documentId, key, title, mimeType, bytes: bytes.length, contentHash, storagePath, verifiedAt: (await (0, database_1.clock)(sql)).toISOString() };
                const next = documents_1.DocumentsSchema.parse([...docs, metadata]);
                await sql.query('UPDATE "PlannerPlan" SET "researchDocuments"=$2 WHERE id=$1', [planId, JSON.stringify(next)]);
                return metadata;
            });
            adopted = result.documentId === documentId;
            return result;
        }
        finally {
            if (!adopted)
                await this.store.remove(storagePath);
        }
    }
    async read(ownerId, documentId) {
        const metadata = await this.db.coordinated(ownerId, sql => ownedDocumentMetadata(sql, ownerId, documentId));
        const bytes = await this.store.read(metadata.storagePath);
        if (bytes.length !== metadata.bytes || (0, exports.documentContentHash)(bytes) !== metadata.contentHash)
            (0, database_1.reject)("STALE_CONTEXT", "The stored document failed content verification.", "RESEARCH");
        return { metadata, bytes };
    }
}
exports.DocumentRepository = DocumentRepository;
