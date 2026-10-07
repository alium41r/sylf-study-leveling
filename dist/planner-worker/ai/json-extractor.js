"use strict";
// ============================================================
// Shared Resilient JSON Extractor
// ============================================================
// Single choke point for parsing LLM structured outputs. Handles
// markdown code fences, leading conversational fluff, trailing
// commentary, and shape validation via Zod — so every caller gets
// identical, defensive parsing instead of ad-hoc `.replace()` chains.
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.JsonExtractionError = void 0;
exports.extractJsonValue = extractJsonValue;
exports.extractJson = extractJson;
class JsonExtractionError extends Error {
    stage;
    constructor(stage, message) {
        super(message);
        this.name = "JsonExtractionError";
        this.stage = stage;
    }
}
exports.JsonExtractionError = JsonExtractionError;
/**
 * Strip optional markdown code fences surrounding the payload.
 * Only leading/trailing fences are removed — fence characters inside
 * JSON string values are never touched.
 */
function stripFences(text) {
    let out = text.trim();
    out = out.replace(/^```(?:json)?\s*/i, "");
    out = out.replace(/\s*```\s*$/i, "");
    return out;
}
/**
 * Locate the JSON substring between the first opening bracket/brace
 * and its last matching closing bracket/brace, discarding any
 * surrounding prose or commentary.
 */
function extractJsonValue(rawText) {
    if (!rawText || typeof rawText !== "string") {
        throw new JsonExtractionError("empty", "LLM returned no text to parse as JSON");
    }
    const text = stripFences(rawText);
    if (text.length === 0) {
        throw new JsonExtractionError("empty", "LLM response was empty after stripping fences");
    }
    const firstBrace = text.indexOf("{");
    const firstBracket = text.indexOf("[");
    const first = firstBrace === -1
        ? firstBracket
        : firstBracket === -1
            ? firstBrace
            : Math.min(firstBrace, firstBracket);
    if (first === -1) {
        throw new JsonExtractionError("no-json", "No JSON object or array found in LLM response");
    }
    const opensWithBrace = text[first] === "{";
    const closeChar = opensWithBrace ? "}" : "]";
    const last = text.lastIndexOf(closeChar);
    if (last <= first) {
        throw new JsonExtractionError("no-json", `Unterminated JSON ${opensWithBrace ? "object" : "array"} in LLM response`);
    }
    const candidate = text.slice(first, last + 1);
    try {
        return JSON.parse(candidate);
    }
    catch (initialErr) {
        try {
            // LLMs frequently output unescaped backslashes in math/LaTeX (e.g. \frac, \lim, \alpha)
            const sanitized = candidate.replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, "\\\\");
            return JSON.parse(sanitized);
        }
        catch {
            throw new JsonExtractionError("parse", `JSON.parse failed on extracted LLM payload: ${initialErr?.message || String(initialErr)}`);
        }
    }
}
/**
 * Extract and validate an LLM structured output in one step.
 *
 * @param rawText  Raw model completion text (may contain fences/fluff).
 * @param schema   Zod schema defining the expected shape.
 * @returns        The validated, typed payload.
 * @throws         JsonExtractionError with a stage-tagged message on
 *                 empty / no-JSON / parse / schema failures so callers
 *                 can decide whether to retry or fall back.
 */
function extractJson(rawText, schema) {
    const value = extractJsonValue(rawText);
    const result = schema.safeParse(value);
    if (!result.success) {
        const details = result.error.issues
            .slice(0, 5)
            .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
            .join(" | ");
        throw new JsonExtractionError("schema", `LLM JSON failed schema validation: ${details}`);
    }
    return result.data;
}
