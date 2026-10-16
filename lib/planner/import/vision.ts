import "server-only";
import { generateGeminiContent } from "@/lib/ai/providers/gemini-dispatch";
import { z } from "zod";
import { GEMINI_MODELS } from "@/lib/ai/config";
import { extractJsonValue } from "@/lib/ai/json-extractor";
import type { ExtractionResult } from "../research/contracts";

/**
 * Read a syllabus outline out of a photograph or scan, via the vision model.
 *
 * The only thing this function may extract is *structure*: the section → chapter →
 * topic hierarchy. It never asks for, and never returns, any preparedness,
 * confidence, priority, difficulty or mastery signal — those are student facts and
 * belong nowhere near an image of someone's syllabus.
 *
 * The model answers as strict JSON; the response is stripped of fences and validated
 * before anything is trusted, and every failure collapses to "nothing usable" rather
 * than a guess. Missing credentials are reported as unavailable, never thrown, so a
 * caller can offer the paste path instead.
 */

const VISION_TIMEOUT_MS = 20_000;

type OutlineNode = { label: string; level?: number; children?: OutlineNode[] };

/** The shape the prompt documents: an array of nodes, or a flat `{ nodes: [...] }`. */
const OutlineNodeSchema: z.ZodType<OutlineNode> = z.lazy(() =>
  z.object({
    label: z.string().trim().min(1).max(200),
    level: z.coerce.number().int().min(1).max(3).optional(),
    children: z.array(OutlineNodeSchema).optional(),
  })
);

const OutlinePayloadSchema = z.union([
  z.array(OutlineNodeSchema),
  z.object({ nodes: z.array(OutlineNodeSchema) }),
]);

const PROMPT = `You are reading a photograph or scan of a syllabus or course outline.

Return ONLY the scope structure — the section/chapter/topic hierarchy — as strict JSON.
Do not describe anything else, and do NOT infer any readiness, confidence, priority,
difficulty or mastery signal; those are never part of your answer.

Use exactly this shape, an array of nodes:
[
  { "label": "Section title", "level": 1, "children": [
      { "label": "Chapter title", "level": 2, "children": [
          { "label": "Topic title", "level": 3 }
      ]}
  ]}
]
- "label" is the wording exactly as printed; do not rewrite it.
- "level" is 1 (section), 2 (chapter) or 3 (topic).
- Omit "children" when a node has none.
Return an empty array [] when no outline is visible.`.trim();

const empty = (reason: string): ExtractionResult => ({
  text: "",
  pages: [{ from: 1, to: 1 }],
  partial: true,
  partialReason: reason,
  method: "VISION",
});

function clampLevel(level: number): number {
  return Math.min(Math.max(Math.floor(level), 1), 3);
}

/** Walk the model's nodes into two-space-indented text lines for `parseOutline`. */
function flatten(items: OutlineNode[], baseLevel: number, out: string[]): void {
  for (const item of items) {
    const level = clampLevel(item.level ?? baseLevel);
    const label = (item.label ?? "").trim().replace(/\s+/g, " ").slice(0, 200);
    if (!label) continue;
    out.push("  ".repeat(level - 1) + label);
    if (item.children?.length) flatten(item.children, level + 1, out);
  }
}

export async function extractOutlineFromImage(input: {
  buffer: Buffer;
  mime: string;
  signal?: AbortSignal;
}): Promise<ExtractionResult> {
  const apiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GENAI_API_KEY ||
    process.env.GOOGLE_API_KEY;
  if (!apiKey) return empty("VISION_UNAVAILABLE");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("vision timeout")), VISION_TIMEOUT_MS);
  const onExternalAbort = (): void => controller.abort(input.signal?.reason);
  if (input.signal) {
    if (input.signal.aborted) {
      clearTimeout(timer);
      return empty("NO_OUTLINE_DETECTED");
    }
    input.signal.addEventListener("abort", onExternalAbort, { once: true });
  }

  try {
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey });
    const response = await generateGeminiContent(ai, {
      model: GEMINI_MODELS.vision,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: input.mime, data: input.buffer.toString("base64") } },
            { text: PROMPT },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        temperature: 0.1,
        maxOutputTokens: 16384,
        abortSignal: controller.signal,
      },
    });

    if (response.candidates?.[0]?.finishReason === "MAX_TOKENS") return empty("NO_OUTLINE_DETECTED");
    const raw = response.text ?? "";
    const parsed = OutlinePayloadSchema.safeParse(extractJsonValue(raw));
    if (!parsed.success) return empty("NO_OUTLINE_DETECTED");

    const items = Array.isArray(parsed.data) ? parsed.data : parsed.data.nodes;
    const lines: string[] = [];
    flatten(items, 1, lines);

    const text = lines.join("\n");
    if (!text.trim()) return empty("NO_OUTLINE_DETECTED");

    return { text, pages: [{ from: 1, to: 1 }], partial: false, partialReason: null, method: "VISION" };
  } catch {
    return empty("NO_OUTLINE_DETECTED");
  } finally {
    clearTimeout(timer);
    if (input.signal) input.signal.removeEventListener("abort", onExternalAbort);
  }
}
