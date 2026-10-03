import "server-only";
import { createHash } from "node:crypto";
import { parseOutline } from "./outline";
import type { ScopeNode } from "../intake/brief";
import type {
  ExtractionResult,
  ImportErrorCode,
  ResearchSource,
  ScopeCandidate,
} from "../research/contracts";

/**
 * Turn an `ExtractionResult` into the `ScopeCandidate` a student reviews.
 *
 * This is the step between "we read your file" and "here is a scope you can confirm":
 * the extracted text is parsed back into nodes, every node is marked selected, and the
 * candidate reports — honestly — whether anything was left unread. A candidate is never
 * authority; only `confirmScope` writes to the brief, and this function writes nothing.
 */

/** A private upload has no public publisher, so the source is built, not classified. */
function buildUploadSource(
  source: { url: string; title: string | null },
  nodes: ScopeNode[],
  retrievedAt: string
): ResearchSource {
  return {
    // Deterministic so rebuilding the same candidate does not mint a new source id.
    sourceId: `upload-${digest(source.url).slice(0, 16)}`,
    // For USER_UPLOAD this is the signed delivery URL (or a private reference rendered
    // as one); it is never a public syllabus URL and never classified OFFICIAL.
    url: source.url,
    title: source.title,
    // The storage host is where Sylf stashed the student's file, not who wrote the
    // syllabus, so it is never shown as the publisher.
    publisherOrDomain: null,
    sourceType: "USER_UPLOAD",
    retrievedAt,
    documentDate: null,
    nodeIds: nodes.map((node) => node.nodeId),
    // The nodes were extracted from this very document, so the mapping is certain.
    mappingConfidence: "HIGH",
  };
}

/** A short, stable digest; sha256 so two different inputs never share an id by accident. */
function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * A content-free, display-ready sentence for each bounded partial reason. The caller may
 * show these verbatim, so they name the gap, never a file title or extracted wording.
 */
function questionForReason(reason: string): string {
  switch (reason) {
    case "PAGES_UNREADABLE":
      return "Some pages could not be read; check the list below for gaps.";
    case "PAGE_LIMIT":
      return "The file had more pages than were read; the rest were not examined.";
    case "TEXT_LIMIT":
      return "The extracted text was cut off at the size limit; the rest was not read.";
    case "ENCRYPTED":
      return "The file is encrypted and could not be read.";
    case "NO_TEXT_LAYER":
      return "The file has no readable text; a photograph or scan of it may work better.";
    case "UNPARSEABLE":
      return "The file could not be read.";
    case "VISION_UNAVAILABLE":
      return "Image reading is unavailable right now.";
    case "NO_OUTLINE_DETECTED":
      return "No outline could be detected in the image.";
    default:
      return "Part of the document could not be read.";
  }
}

export function candidateFromImport(input: {
  extraction: ExtractionResult;
  origin: "IMPORT" | "PASTE";
  briefDigest: string;
  retrievedAt: string;
  source: { url: string; title: string | null } | null;
}): ScopeCandidate {
  const { extraction, origin, briefDigest, retrievedAt, source } = input;
  const parsed = parseOutline(extraction.text);
  const nodes: ScopeNode[] = parsed.nodes.map((node) => ({ ...node, selected: true }));

  // Status: UNAVAILABLE when nothing parsed; WEAK when something parsed but the
  // extraction was partial or the outline had to be truncated; OK only when both are clean.
  let status: ScopeCandidate["status"];
  if (nodes.length === 0) status = "UNAVAILABLE";
  else if (extraction.partial || parsed.issue !== null) status = "WEAK";
  else status = "OK";

  // Confidence thresholds:
  //   HIGH   — complete extraction, no parse issue, and at least two nodes.
  //   MEDIUM — the extraction was partial, but the parse itself succeeded.
  //   LOW    — the parse reported an issue (e.g. OUTLINE_TOO_LARGE) or produced fewer
  //            than two nodes, which is never a credible scope regardless of text length.
  let confidence: ScopeCandidate["confidence"];
  if (nodes.length === 0) confidence = "LOW";
  else if (parsed.issue !== null || nodes.length < 2) confidence = "LOW";
  else if (extraction.partial) confidence = "MEDIUM";
  else confidence = "HIGH";

  // The student's own text is not a public source; only an uploaded file is recorded,
  // and then as USER_UPLOAD, never OFFICIAL.
  const sources: ResearchSource[] =
    origin === "IMPORT" && source ? [buildUploadSource(source, nodes, retrievedAt)] : [];

  const openQuestions: string[] = [];
  if (extraction.partial && extraction.partialReason) {
    openQuestions.push(questionForReason(extraction.partialReason));
  }
  if (parsed.issue === "OUTLINE_TOO_LARGE") {
    openQuestions.push("The outline had more items than fit; only the first part was kept.");
  }

  const noun = origin === "PASTE" ? "the text you pasted" : "the file you uploaded";
  const unitWord = nodes.length === 1 ? "unit" : "units";
  let summary: string;
  if (nodes.length === 0) {
    summary = `I could not find any units in ${noun}.`;
  } else if (extraction.partial) {
    // Never claim completeness when the extraction admits it left something unread.
    summary = `I found ${nodes.length} ${unitWord} in ${noun}, but part of it was not read.`;
  } else {
    summary = `I read ${nodes.length} ${unitWord} from ${noun}.`;
  }

  return {
    version: 1,
    origin,
    status,
    confidence,
    briefDigest,
    retrievedAt,
    provider: "planner-import",
    // The question an import answers is "what is in this text against this brief", so the
    // cache key digests the text and the brief together — two different pastes stay distinct.
    cacheKey: `import-${digest(`${origin}\n${briefDigest}\n${extraction.text}`).slice(0, 48)}`,
    // A candidate is only "failed" when nothing parsed; partial work is WEAK, not failed.
    failureCode: nodes.length === 0 ? importErrorFor(extraction.partialReason ?? "") : null,
    nodes,
    sources,
    openQuestions: openQuestions.slice(0, 5),
    summary,
  };
}

/**
 * Map an extraction reason to the failure code the caller reports to the student, so a
 * scanned PDF and a missing vision key lead to different next actions instead of one
 * catch-all "something went wrong". An empty string stands for "empty text".
 */
export function importErrorFor(reason: string | null): ImportErrorCode {
  switch (reason) {
    case "NO_TEXT_LAYER":
    case "ENCRYPTED":
      return "IMPORT_UNSUPPORTED";
    case "UNPARSEABLE":
    case "VISION_UNAVAILABLE":
      return "IMPORT_FAILED";
    case "PAGE_LIMIT":
    case "TEXT_LIMIT":
    case "PAGES_UNREADABLE":
      return "IMPORT_PARTIAL";
    case "NO_OUTLINE_DETECTED":
    case "":
      return "IMPORT_EMPTY";
    default:
      return "IMPORT_FAILED";
  }
}
