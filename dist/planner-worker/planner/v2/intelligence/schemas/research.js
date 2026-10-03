"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResearchProcessingSchema = void 0;
const zod_1 = require("zod");
const evidence_1 = require("../../contracts/evidence");
const envelope_1 = require("../../contracts/envelope");
const primitives_1 = require("../../contracts/primitives");
/** Extraction receipts describe what was actually selected, including partial coverage. */
exports.ResearchProcessingSchema = (0, envelope_1.withPlannerEnvelope)(zod_1.z.strictObject({
    schemaVersion: primitives_1.VersionV2Schema,
    queries: zod_1.z.array(primitives_1.SummaryV2Schema).max(envelope_1.PLANNER_V2_ENVELOPE.researchQueries),
    fetchAttempts: zod_1.z.number().int().min(0).max(envelope_1.PLANNER_V2_ENVELOPE.fetchAttempts),
    elapsedMs: zod_1.z.number().int().nonnegative(),
    followUps: zod_1.z.number().int().min(0).max(envelope_1.PLANNER_V2_ENVELOPE.followUps),
    selectedSources: zod_1.z.array(zod_1.z.strictObject({
        sourceId: primitives_1.LocalIdV2Schema, contentHash: primitives_1.DigestV2Schema,
        selectedCharacters: zod_1.z.number().int().min(0).max(envelope_1.PLANNER_V2_ENVELOPE.sourceCharacters),
        selectedPages: zod_1.z.array(zod_1.z.number().int().positive()).max(envelope_1.PLANNER_V2_ENVELOPE.extractedPages),
        ocrPages: zod_1.z.array(zod_1.z.number().int().positive()).max(envelope_1.PLANNER_V2_ENVELOPE.ocrPages),
    })).max(envelope_1.PLANNER_V2_ENVELOPE.sources),
    evidence: evidence_1.ResearchEvidenceV2Schema.nullable(),
}).superRefine((research, ctx) => {
    (0, primitives_1.unique)(research.selectedSources.map(source => source.sourceId), ctx, ["selectedSources"]);
    let characters = 0;
    let pages = 0;
    let ocr = 0;
    research.selectedSources.forEach((source, i) => {
        (0, primitives_1.unique)(source.selectedPages.map(String), ctx, ["selectedSources", i, "selectedPages"]);
        (0, primitives_1.unique)(source.ocrPages.map(String), ctx, ["selectedSources", i, "ocrPages"]);
        if (source.ocrPages.some(page => !source.selectedPages.includes(page)))
            (0, primitives_1.issue)(ctx, ["selectedSources", i], "OCR_PAGE_NOT_SELECTED");
        characters += source.selectedCharacters;
        pages += source.selectedPages.length;
        ocr += source.ocrPages.length;
    });
    if (characters > envelope_1.PLANNER_V2_ENVELOPE.sourceCharacters || pages > envelope_1.PLANNER_V2_ENVELOPE.extractedPages || ocr > envelope_1.PLANNER_V2_ENVELOPE.ocrPages)
        (0, primitives_1.issue)(ctx, ["selectedSources"], "ROOT_RESEARCH_EXTRACTION_BOUND");
    if (research.evidence) {
        const selected = new Map(research.selectedSources.map(source => [source.sourceId, source]));
        research.evidence.sources.forEach((source, i) => {
            const receipt = selected.get(source.sourceId);
            if (!receipt || receipt.contentHash !== source.contentHash ||
                JSON.stringify([...receipt.selectedPages].sort((a, b) => a - b)) !== JSON.stringify([...source.extraction.selectedPages].sort((a, b) => a - b)) ||
                JSON.stringify([...receipt.ocrPages].sort((a, b) => a - b)) !== JSON.stringify([...source.extraction.ocrPages].sort((a, b) => a - b))) {
                (0, primitives_1.issue)(ctx, ["evidence", "sources", i], "EXTRACTION_RECEIPT_MISMATCH");
            }
        });
    }
}));
