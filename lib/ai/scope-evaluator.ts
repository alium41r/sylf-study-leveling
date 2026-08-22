import { GoogleGenAI } from "@google/genai";
import { extractJson } from "./json-extractor";
import { z } from "zod";

/** Zod shape for the AI scope evaluation JSON output. */
const ScopeEvalSchema = z.object({
  chapterPortionPercent: z.coerce.number().min(0).max(100),
  scopeWeight: z.coerce.number().min(0).max(1),
  rationale: z.string().optional(),
});

export interface ScopeEvaluationInput {
  nodeTitle: string;
  nodeDescription: string;
  nodeTier?: number;
  questTitle: string;
  planDescription: string;
  targetMinutes: number;
}

export interface ScopeEvaluationResult {
  chapterPortionPercent: number; // 10 to 100
  scopeWeight: number; // 0.10 to 1.00
  estimatedMasteryBoost: number; // 10 to 100
  rationale: string;
  isFullChapter: boolean;
}

/**
 * High-precision semantic NLP syllabus scope evaluator.
 * Accurately analyzes what fraction of the chapter syllabus is planned by the student.
 */
export function calculateSemanticScopeWeight(
  input: ScopeEvaluationInput
): ScopeEvaluationResult {
  const targetMinutes = Number(input.targetMinutes) > 0 ? Number(input.targetMinutes) : 45;
  const plan = (input.planDescription || "").trim();
  const planLower = plan.toLowerCase();
  const title = (input.questTitle || "").trim().toLowerCase();
  const syllabusDesc = (input.nodeDescription || "").toLowerCase();

  // If plan is completely empty, estimate purely by duration and default quest scope
  if (plan.length === 0) {
    let durationPortion = Math.min(80, Math.round((targetMinutes / 90) * 60));
    if (targetMinutes <= 25) durationPortion = 25;
    else if (targetMinutes === 45) durationPortion = 40;
    else if (targetMinutes === 60) durationPortion = 55;
    else if (targetMinutes >= 90) durationPortion = 75;

    const weight = Math.min(1.0, Math.max(0.1, durationPortion / 100));
    return {
      chapterPortionPercent: durationPortion,
      scopeWeight: weight,
      estimatedMasteryBoost: durationPortion,
      rationale: `Standard ${targetMinutes}m study session (~${durationPortion}% estimated chapter progress).`,
      isFullChapter: false,
    };
  }

  // ─── 1. FULL CHAPTER / COMPREHENSIVE COVERAGE PATTERNS ────────
  // Check against plan text ONLY, avoiding false positives from auto-filled quest titles
  const fullChapterPatterns = [
    /\b(complete|entire|whole|all|finish|master|full)\s+(chapter|syllabus|unit|topic|node|module|material|content|sections?|parts?)\b/i,
    /\b(everything|all\s+topics|all\s+subtopics|full\s+coverage|100%|full\s+past\s+paper|all\s+past\s+papers)\b/i,
    /\b(cover|study|review|do|finish)\s+(all|everything|the\s+entire|the\s+whole)\b/i,
    /^complete\s+chapter$/i,
    /^all$/i,
    /^full$/i,
    /^everything$/i,
  ];

  const hasRestrictiveConstraint = /\b(only|just|solely|part\s+of|some|first\s+part|second\s+part|intro|basics?|selected)\b/i.test(planLower);
  const isFullChapter = !hasRestrictiveConstraint && fullChapterPatterns.some((pattern) => pattern.test(planLower));

  if (isFullChapter) {
    let portion = 100;
    if (targetMinutes < 30) {
      portion = 85;
    }
    const weight = Math.min(1.0, portion / 100);
    return {
      chapterPortionPercent: portion,
      scopeWeight: weight,
      estimatedMasteryBoost: portion,
      rationale: "Full chapter comprehensive mastery plan covering all syllabus learning objectives.",
      isFullChapter: true,
    };
  }

  // ─── 2. EXPLICIT FRACTIONAL / NUMERIC QUANTIFIERS ───────────────
  if (/\b(half|50%|half\s+the\s+chapter|1\/2|first\s+half|second\s+half)\b/i.test(planLower)) {
    return {
      chapterPortionPercent: 50,
      scopeWeight: 0.5,
      estimatedMasteryBoost: 50,
      rationale: "Targeting 50% (half) of chapter syllabus content.",
      isFullChapter: false,
    };
  }

  if (/\b(three\s+quarters?|75%|3\/4)\b/i.test(planLower)) {
    return {
      chapterPortionPercent: 75,
      scopeWeight: 0.75,
      estimatedMasteryBoost: 75,
      rationale: "Targeting 75% of chapter syllabus content.",
      isFullChapter: false,
    };
  }

  if (/\b(one\s+third|33%|1\/3|third\s+of)\b/i.test(planLower)) {
    return {
      chapterPortionPercent: 35,
      scopeWeight: 0.35,
      estimatedMasteryBoost: 35,
      rationale: "Targeting ~1/3 of chapter syllabus content.",
      isFullChapter: false,
    };
  }

  if (/\b(quarter|25%|1\/4|one\s+quarter)\b/i.test(planLower)) {
    return {
      chapterPortionPercent: 25,
      scopeWeight: 0.25,
      estimatedMasteryBoost: 25,
      rationale: "Targeting 25% (one quarter) of chapter syllabus content.",
      isFullChapter: false,
    };
  }

  // ─── 3. SYLLABUS LEARNING OBJECTIVES OVERLAP ANALYSIS ──────────
  // Extract discrete learning objective concepts from node description
  const rawClauses = syllabusDesc
    .split(/[.;•\n]|(?:,\s*(?:and|as well as)\s*)|,\s*/i)
    .map((c) => c.trim())
    .filter((c) => c.length > 4);

  const totalObjectives = Math.max(1, rawClauses.length);
  let matchedObjectives = 0;
  const matchedConcepts: string[] = [];

  for (const clause of rawClauses) {
    const words = clause
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(
        (w) =>
          w.length > 3 &&
          ![
            "with",
            "from",
            "that",
            "this",
            "have",
            "understand",
            "competently",
            "apply",
            "assess",
            "using",
            "calculate",
            "define",
            "explain",
            "describe",
            "analyze",
            "outline",
            "evaluate",
            "straightforward",
            "physical",
            "scenarios",
          ].includes(w)
      );

    const matchesClause = words.length > 0 && words.some((w) => planLower.includes(w));
    if (matchesClause) {
      matchedObjectives++;
      matchedConcepts.push(clause.slice(0, 30));
    }
  }

  let portion = 35;
  if (matchedObjectives > 0 && totalObjectives > 0) {
    const overlapRatio = matchedObjectives / totalObjectives;
    portion = Math.round(overlapRatio * 100);

    // If user explicitly stated "only", cap the portion strictly below full
    if (hasRestrictiveConstraint && portion >= 90) {
      portion = Math.round(Math.min(80, (matchedObjectives / totalObjectives) * 85));
    }

    if (targetMinutes >= 60 && !hasRestrictiveConstraint) portion = Math.min(100, portion + 10);
    else if (targetMinutes <= 25) portion = Math.max(15, portion - 10);
  } else {
    // Keyword fallback analysis
    if (
      planLower.includes("past paper") ||
      planLower.includes("questions") ||
      planLower.includes("problems") ||
      planLower.includes("exercises") ||
      planLower.includes("solve") ||
      planLower.includes("deriv")
    ) {
      portion = targetMinutes >= 60 ? 60 : 40;
    } else if (
      planLower.includes("quick") ||
      planLower.includes("flashcard") ||
      planLower.includes("summary") ||
      planLower.includes("recap") ||
      planLower.includes("read")
    ) {
      portion = 20;
    } else {
      portion = Math.min(75, Math.max(25, Math.round((targetMinutes / 60) * 45)));
    }
  }

  // Clamp strictly between 10% and 100%
  portion = Math.min(100, Math.max(10, portion));
  const finalWeight = Math.round((portion / 100) * 100) / 100;

  const rationale =
    matchedObjectives > 0
      ? `Covers ${matchedObjectives} of ${totalObjectives} syllabus learning objectives (${portion}% of chapter).`
      : `Focused study session covering ~${portion}% of chapter syllabus.`;

  return {
    chapterPortionPercent: portion,
    scopeWeight: finalWeight,
    estimatedMasteryBoost: portion,
    rationale,
    isFullChapter: portion >= 95,
  };
}

/**
 * Evaluates syllabus scope using Google Gemini with structured output,
 * falling back gracefully to the deterministic semantic parser.
 */
export async function evaluateSyllabusScopeWithAI(
  input: ScopeEvaluationInput
): Promise<ScopeEvaluationResult> {
  const fallback = calculateSemanticScopeWeight(input);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !input.planDescription || input.planDescription.trim().length === 0) {
    return fallback;
  }

  const candidateModels = [
    process.env.GEMINI_REASONING_MODEL,
    "gemini-3.7-flash",
    "gemini-3.6-flash",
  ].filter(Boolean) as string[];

  const prompt = `
You are an expert academic curriculum evaluator. Analyze what percentage of the chapter's official syllabus learning objectives the student's practice plan covers.

Chapter Topic: "${input.nodeTitle}"
Official Syllabus Objectives:
"${input.nodeDescription}"

Student Practice Plan / Scope: "${input.planDescription}"
Planned Focus Duration: ${input.targetMinutes} minutes

Evaluation Rules:
1. Compare the student's practice plan against each learning objective in the chapter syllabus.
2. If the student specifies "only" or focuses on a specific subtopic (e.g. "studying work and different types of energy only" for a chapter covering work, kinetic/potential energy, power, and efficiency), calculate the fraction of objectives covered (e.g. 50%).
3. If the student specifies "complete chapter", "all topics", "whole unit", "all past papers", return 100.
4. If the student is doing a quick recap or flashcards, return 15 to 25.
5. Return realistic integer percentage between 10 and 100.

Output JSON ONLY with keys:
{
  "chapterPortionPercent": number (10 to 100),
  "scopeWeight": number (0.10 to 1.00),
  "rationale": string (1 concise sentence explaining what portion of objectives is covered vs omitted)
}
`.trim();

  const ai = new GoogleGenAI({ apiKey });

  for (const modelName of candidateModels) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      });

      const text = response.text?.trim() || "";

      // Shared resilient extractor: fences/fluff-proof, Zod-validated.
      const parsed = extractJson(text, ScopeEvalSchema);

      if (parsed && typeof parsed.chapterPortionPercent === "number") {
        const percent = Math.min(100, Math.max(10, Math.round(parsed.chapterPortionPercent)));
        const weight = Math.min(1.0, Math.max(0.1, Math.round((percent / 100) * 100) / 100));
        return {
          chapterPortionPercent: percent,
          scopeWeight: weight,
          estimatedMasteryBoost: percent,
          rationale: typeof parsed.rationale === "string" ? parsed.rationale : fallback.rationale,
          isFullChapter: percent >= 95,
        };
      }
    } catch (err) {
      console.warn(`[ScopeEvaluator] Model ${modelName} evaluation failed, trying fallback:`, err);
    }
  }

  return fallback;
}
