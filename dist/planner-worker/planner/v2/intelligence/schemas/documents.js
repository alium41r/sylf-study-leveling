"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentsSchema = exports.DocumentMetadataSchema = void 0;
const zod_1 = require("zod");
const contracts_1 = require("../../contracts");
exports.DocumentMetadataSchema = zod_1.z.strictObject({ documentId: contracts_1.DurableIdV2Schema, key: zod_1.z.string().regex(/^[A-Za-z0-9_-]{8,100}$/),
    title: contracts_1.TitleV2Schema, storagePath: zod_1.z.string().max(200), mimeType: zod_1.z.enum(["application/pdf", "text/plain"]),
    bytes: zod_1.z.number().int().min(1).max(3 * 1024 * 1024), contentHash: contracts_1.DigestV2Schema, verifiedAt: contracts_1.InstantV2Schema });
exports.DocumentsSchema = (0, contracts_1.withPlannerEnvelope)(zod_1.z.array(exports.DocumentMetadataSchema).max(9).superRefine((docs, ctx) => {
    (0, contracts_1.unique)(docs.map(d => d.documentId), ctx, []);
    (0, contracts_1.unique)(docs.map(d => d.key), ctx, []);
}), 32 * 1024);
