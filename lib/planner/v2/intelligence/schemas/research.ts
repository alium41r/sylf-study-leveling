import { z } from "zod";
import { ResearchEvidenceV2Schema } from "../../contracts/evidence";
import { PLANNER_V2_ENVELOPE as E, withPlannerEnvelope } from "../../contracts/envelope";
import { DigestV2Schema, LocalIdV2Schema, SummaryV2Schema, VersionV2Schema, issue, unique } from "../../contracts/primitives";

/** Extraction receipts describe what was actually selected, including partial coverage. */
export const ResearchProcessingSchema = withPlannerEnvelope(z.strictObject({
  schemaVersion: VersionV2Schema,
  queries: z.array(SummaryV2Schema).max(E.researchQueries),
  fetchAttempts: z.number().int().min(0).max(E.fetchAttempts),
  elapsedMs: z.number().int().nonnegative(),
  followUps: z.number().int().min(0).max(E.followUps),
  selectedSources: z.array(z.strictObject({
    sourceId: LocalIdV2Schema, contentHash: DigestV2Schema,
    selectedCharacters: z.number().int().min(0).max(E.sourceCharacters),
    selectedPages: z.array(z.number().int().positive()).max(E.extractedPages),
    ocrPages: z.array(z.number().int().positive()).max(E.ocrPages),
  })).max(E.sources),
  evidence: ResearchEvidenceV2Schema.nullable(),
}).superRefine((research, ctx) => {
  unique(research.selectedSources.map(source => source.sourceId), ctx, ["selectedSources"]);
  let characters = 0; let pages = 0; let ocr = 0;
  research.selectedSources.forEach((source, i) => {
    unique(source.selectedPages.map(String), ctx, ["selectedSources", i, "selectedPages"]);
    unique(source.ocrPages.map(String), ctx, ["selectedSources", i, "ocrPages"]);
    if (source.ocrPages.some(page => !source.selectedPages.includes(page))) issue(ctx, ["selectedSources", i], "OCR_PAGE_NOT_SELECTED");
    characters += source.selectedCharacters; pages += source.selectedPages.length; ocr += source.ocrPages.length;
  });
  if (characters > E.sourceCharacters || pages > E.extractedPages || ocr > E.ocrPages) issue(ctx, ["selectedSources"], "ROOT_RESEARCH_EXTRACTION_BOUND");
  if (research.evidence) {
    const selected = new Map(research.selectedSources.map(source => [source.sourceId, source]));
    research.evidence.sources.forEach((source, i) => {
      const receipt = selected.get(source.sourceId);
      if (!receipt || receipt.contentHash !== source.contentHash ||
        JSON.stringify([...receipt.selectedPages].sort((a, b) => a - b)) !== JSON.stringify([...source.extraction.selectedPages].sort((a, b) => a - b)) ||
        JSON.stringify([...receipt.ocrPages].sort((a, b) => a - b)) !== JSON.stringify([...source.extraction.ocrPages].sort((a, b) => a - b))) {
        issue(ctx, ["evidence", "sources", i], "EXTRACTION_RECEIPT_MISMATCH");
      }
    });
  }
}));

export type ResearchProcessing = z.infer<typeof ResearchProcessingSchema>;
