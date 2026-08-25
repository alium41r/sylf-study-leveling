import { SKELETON_NODES, type SkeletonNode } from "@/lib/skill-tree-skeleton";
import { LLMFactory } from "./providers/factory";
import { DEEPSEEK_MODELS, GEMINI_MODELS } from "./config";
import { NormalizedMessage } from "./providers/types";
import { extractJson } from "./json-extractor";
import { z } from "zod";
import { executeGoogleSearch } from "./chat-tool-executor";
import { logAiUsage } from "./usage-logger";

export interface CompiledSyllabusNode {
  nodeId: string; // "N1_1" through "N10_1"
  tier: number;
  title: string;
  description: string;
  difficulty: number; // 1 to 5
}

export interface SyllabusCompilationResult {
  subjectName: string;
  code: string;
  examBoard: string;
  level: string;
  nodes: CompiledSyllabusNode[];
  modelUsed?: string;
}

export interface CompileSyllabusInput {
  name: string;
  code: string;
  examBoard?: string;
  level?: string;
  /**
   * Free-text book / syllabus / class details the user entered when adding
   * the subject (onboarding or timer page). This is what lets the compiler
   * research the user's EXACT syllabus — textbook, exam-spec name, class year.
   */
  syllabusNote?: string;
  /** Optional — enables AI usage telemetry (AiUsageLog) for this compile. */
  userId?: number;
}

/**
 * Hard caps against runaway generations: 48 nodes ≈ 3–4k output tokens, so an
 * 8k ceiling keeps the compile fast without ever truncating the full payload.
 */
const COMPILE_SYNTHESIS_TIMEOUT_MS = 120_000;
const COMPILE_RESEARCH_TIMEOUT_MS = 30_000;
const COMPILE_MAX_OUTPUT_TOKENS = 8192;

/** Abort a promise (best-effort) after ms — used for the grounded search. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Syllabus compile step timed out after ${ms}ms`)),
      ms
    );
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

/** Timeout-aware AbortSignal: fires when either the caller or the timer aborts. */
function timeoutSignal(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`timed out after ${ms}ms`)), ms);
  const onParentAbort = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener("abort", onParentAbort, { once: true });
  }
  controller.signal.addEventListener(
    "abort",
    () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onParentAbort);
    },
    { once: true }
  );
  return controller.signal;
}

const GENERIC_SEARCH_FALLBACK_SOURCE = "Academic Curriculum Knowledge Engine";

/**
 * Grounded curriculum research via Gemini's Google Search grounding. The
 * search runs FIRST and ALWAYS (deterministically) — the model only ever
 * SYNTHESIZES real findings, it is never trusted to research from memory
 * (DeepSeek's tool calling routinely skips Google Search and hallucinates).
 */
async function runGroundedResearch(input: {
  name: string;
  code: string;
  examBoard: string;
  level: string;
  syllabusNote?: string;
}): Promise<{ findings: string; source: string }> {
  const qualification = [
    input.level,
    input.syllabusNote ? `User book/class details: ${input.syllabusNote}` : "",
  ]
    .filter(Boolean)
    .join(" — ");

  try {
    const searchResult = await withTimeout(
      executeGoogleSearch({
        query: `${input.name} (${input.code}) — ${input.examBoard} official syllabus`,
        qualification: qualification || undefined,
      }),
      COMPILE_RESEARCH_TIMEOUT_MS
    );
    // Only trust REAL grounded findings — the executor's generic placeholder
    // snippet (no API key / search unavailable) is junk for the compiler, so
    // treat it as "no research" instead of feeding the model boilerplate.
    if (
      searchResult?.summary &&
      String(searchResult.summary).trim().length > 0 &&
      searchResult.source !== GENERIC_SEARCH_FALLBACK_SOURCE
    ) {
      return {
        findings: String(searchResult.summary).trim(),
        source: searchResult.source || "grounded search",
      };
    }
  } catch (searchErr: any) {
    console.warn("[SyllabusCompiler] Grounded research unavailable:", searchErr?.message);
  }
  return { findings: "", source: "no live research (compiling from official curriculum knowledge)" };
}

/**
 * Deterministic fallback curriculum generator when external LLM is offline or rate-limited.
 */
export function generateFallbackSyllabus(
  input: CompileSyllabusInput
): SyllabusCompilationResult {
  const subjectName = input.name.trim();
  const code = input.code.trim().toUpperCase();
  const examBoard = (input.examBoard || "CAIE").trim().toUpperCase();
  const level = (input.level || "A-Level").trim();

  const nodes: CompiledSyllabusNode[] = SKELETON_NODES.map((skeleton) => {
    let title = `${subjectName}: ${skeleton.label}`;
    let description = `${skeleton.description} for ${examBoard} ${code} (${level}).`;
    let difficulty = Math.min(5, Math.max(1, Math.ceil(skeleton.tier / 2)));

    if (skeleton.tier === 1) {
      title = `${subjectName} Foundational Axioms & Core Definitions`;
      description = `Master baseline concepts, notation conventions, and fundamental axioms required for ${code}.`;
      difficulty = 1;
    } else if (skeleton.tier === 10) {
      title = `${subjectName} Apex Mastery Capstone`;
      description = `Comprehensive synoptic past-paper mastery and cross-topic theoretical synthesis for ${code}.`;
      difficulty = 5;
    } else if (skeleton.tier <= 3) {
      title = `${subjectName} ${skeleton.label} - Core Mechanics`;
      description = `Essential algebraic operations, standard methodologies, and elementary derivations for ${code}.`;
      difficulty = 2;
    } else if (skeleton.tier <= 5) {
      title = `${subjectName} ${skeleton.label} - Applied Theorems`;
      description = `Structured multi-step problem solving, standard theorem proofs, and component applications.`;
      difficulty = 3;
    } else if (skeleton.tier <= 7) {
      title = `${subjectName} ${skeleton.label} - Advanced Analysis`;
      description = `Complex multi-topic questions, edge-case theorems, and rigorous analytical investigations.`;
      difficulty = 4;
    } else {
      title = `${subjectName} ${skeleton.label} - Past-Paper Synthesis`;
      description = `High-yield past examination problems, non-standard scenario modelling, and speed accuracy drills.`;
      difficulty = 5;
    }

    return {
      nodeId: skeleton.id,
      tier: skeleton.tier,
      title,
      description,
      difficulty,
    };
  });

  return {
    subjectName,
    code,
    examBoard,
    level,
    nodes,
    modelUsed: "Deterministic Skeleton Engine",
  };
}

/**
 * Validates and sanitizes raw LLM output against the 48-node constellation invariant.
 */
export function validateAndSanitizeCompiledNodes(
  rawNodes: any[],
  input: CompileSyllabusInput
): CompiledSyllabusNode[] {
  const fallback = generateFallbackSyllabus(input);
  const fallbackMap = new Map(fallback.nodes.map((n) => [n.nodeId, n]));

  const rawMap = new Map<string, any>();
  if (Array.isArray(rawNodes)) {
    for (const item of rawNodes) {
      if (item && typeof item === "object" && typeof item.nodeId === "string") {
        rawMap.set(item.nodeId.trim(), item);
      }
    }
  }

  // Ensure every single skeleton node from N1_1 to N10_1 is populated accurately
  return SKELETON_NODES.map((skeleton) => {
    const raw = rawMap.get(skeleton.id);
    const fb = fallbackMap.get(skeleton.id)!;

    if (!raw) return fb;

    const rawTitle = typeof raw.title === "string" ? raw.title.trim() : "";
    const rawDesc = typeof raw.description === "string" ? raw.description.trim() : "";
    const rawDiff = typeof raw.difficulty === "number" ? raw.difficulty : parseInt(raw.difficulty, 10);

    const title = rawTitle && rawTitle.length >= 3 ? rawTitle.slice(0, 120) : fb.title;
    const description = rawDesc && rawDesc.length >= 5 ? rawDesc.slice(0, 300) : fb.description;
    const difficulty = isNaN(rawDiff)
      ? fb.difficulty
      : Math.min(5, Math.max(1, Math.round(rawDiff)));

    return {
      nodeId: skeleton.id,
      tier: skeleton.tier,
      title,
      description,
      difficulty,
    };
  });
}

/**
 * Raw LLM node shape — deliberately loose; validateAndSanitizeCompiledNodes
 * enforces the strict 48-node invariant downstream.
 */
const CompiledNodeRawSchema = z.object({
  nodeId: z.string().min(1),
  tier: z.coerce.number().int().min(1).max(10).optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  difficulty: z.coerce.number().optional(),
});

const SyllabusPayloadSchema = z.union([
  z.array(CompiledNodeRawSchema),
  z.object({ nodes: z.array(CompiledNodeRawSchema) }),
]);

/**
 * Extract the LLM syllabus payload via the shared resilient extractor,
 * normalizing either the bare-array or { nodes: [...] } wrapper shape.
 */
function parseSyllabusPayload(responseText: string): any[] {
  const parsed = extractJson(responseText, SyllabusPayloadSchema);
  const rawArray = Array.isArray(parsed) ? parsed : parsed.nodes;
  return rawArray.length > 0 ? rawArray : [];
}

/**
 * Main Service: Compiles a syllabus from GROUNDED research (Gemini Google
 * Search grounding) synthesized by Gemini. DeepSeek is only an offline
 * fallback — it can't use the Google Search tool and is never asked to
 * research. Exactly ONE LLM synthesis attempt per provider (plus one
 * deterministic search), each under a hard timeout and an output-token cap,
 * so a compile never cascades into hours of redundant generations.
 */
export async function compileSyllabus(
  input: CompileSyllabusInput,
  signal?: AbortSignal
): Promise<SyllabusCompilationResult> {
  const subjectName = input.name.trim();
  const code = input.code.trim().toUpperCase();
  const examBoard = (input.examBoard || "CAIE").trim().toUpperCase();
  const level = (input.level || "A-Level").trim();
  const syllabusNote = (input.syllabusNote || "").trim();
  const userId = input.userId;

  // ── 0. GROUNDED RESEARCH (deterministic, Gemini Google Search) ──────
  // Always runs first so the compile is based on the user's EXACT syllabus
  // (board + code + the book/class details they entered), never memory.
  const { findings, source } = await runGroundedResearch({
    name: subjectName,
    code,
    examBoard,
    level,
    syllabusNote: syllabusNote || undefined,
  });

  const userPrompt = `Decompose syllabus ${examBoard} ${code} (${subjectName}, ${level}) into the 48-node constellation graph. Output JSON only.`;
  const systemInstruction = `
You are an expert academic curriculum architect and syllabus compiler for premier international examination boards (e.g. CAIE Cambridge International, Edexcel Pearson, AQA, AP College Board, International Baccalaureate IB, University level).

Your task is to decompose the official syllabus into an exact 48-node academic progression graph.

Target Syllabus:
- Subject Name: "${subjectName}"
- Syllabus Code: "${code}"
- Examination Board: "${examBoard}"
- Academic Level: "${level}"
${syllabusNote ? `- User Book / Syllabus / Class Details: "${syllabusNote}"` : ""}

GROUNDED RESEARCH FINDINGS (${source}):
${findings || "No live research available — use only well-established official curriculum knowledge for this qualification and mark anything uncertain."}

FIDELITY RULES:
- Base every node on the LIVE RESEARCH FINDINGS when present. Use the exact chapter titles, topic names and exam-board conventions they contain (e.g. "Pure Mathematics 1", "Mechanics", "Organic Chemistry").
- When the user gave book/class details, honor that textbook/specifier (e.g. Which book, which chapters the class covers).
- NEVER invent chapters that contradict the findings; if findings don't cover this syllabus, fall back to official curriculum knowledge and keep nodes generic-safe.
- No markdown, no commentary — JSON only.

Structural Node Invariant (Exact 48 Nodes):
You must output an array of exactly 48 objects corresponding to Node IDs 'N1_1' through 'N10_1':
- Tiers 1-3 (N1_1 to N3_6, 10 nodes): Foundational Principles, Definitions, Core Formulas, Elementary Techniques (Difficulty 1-2).
- Tiers 4-5 (N4_1 to N5_6, 14 nodes): Mid-Level Problem Solving, Essential Theorems, Applied Concepts, Standard Exam Methods (Difficulty 2-3).
- Tiers 6-7 (N6_1 to N7_7, 15 nodes): Advanced Analytical Vectors, Multi-Step Problem Solving, Proofs, Deep Conceptual Subtopics (Difficulty 3-4).
- Tiers 8-9 (N8_1 to N9_3, 8 nodes): High-Yield Past-Paper Synthesis, Tricky Edge Cases, Full-Scope Examination Problems (Difficulty 4-5).
- Tier 10 (N10_1, 1 node): '${subjectName} Apex Mastery Capstone' - Comprehensive Synoptic Mastery and Final Past-Paper Synthesis (Difficulty 5).

Node IDs to provide in order:
${SKELETON_NODES.map((n) => `${n.id} (Tier ${n.tier})`).join(", ")}

Output Requirements:
- Return ONLY a valid, parseable JSON array of exactly 48 objects with properties:
  - "nodeId": string (e.g. "N1_1")
  - "tier": number (1 to 10)
  - "title": string (2-4 words, the concrete topic name from the syllabus — NO generic placeholders like "Advanced Concepts")
  - "description": ONE sentence (≤220 chars) stating the learning objective and past-paper competency
  - "difficulty": number (integer between 1 and 5)
`.trim();

  const messages: NormalizedMessage[] = [
    { role: "user", content: userPrompt },
  ];

  const geminiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GENAI_API_KEY ||
    process.env.GOOGLE_API_KEY;

  // ── Attempt 1: GEMINI PRIMARY ENGINE — grounded research synthesis ──
  if (geminiKey) {
    try {
      const geminiAdapter = LLMFactory.getAdapter("gemini", GEMINI_MODELS.compiler);
      const res = await geminiAdapter.generateResponse(messages, systemInstruction, [], {
        responseFormat: "json_object",
        temperature: 0.3,
        maxTokens: COMPILE_MAX_OUTPUT_TOKENS,
        signal: timeoutSignal(signal, COMPILE_SYNTHESIS_TIMEOUT_MS),
      });

      const rawArray = parseSyllabusPayload(res.text || "");
      if (rawArray.length > 0) {
        const nodes = validateAndSanitizeCompiledNodes(rawArray, input);
        await logAiUsage({
          userId: userId ?? 0,
          feature: "syllabus",
          workload: `${examBoard} ${code} — ${subjectName}`,
          provider: "gemini",
          model: GEMINI_MODELS.compiler,
          promptTokens: res.usage?.promptTokens ?? 0,
          completionTokens: res.usage?.completionTokens ?? 0,
        });
        return {
          subjectName,
          code,
          examBoard,
          level,
          nodes,
          modelUsed: `Gemini (${GEMINI_MODELS.compiler}) + ${source}`,
        };
      }
    } catch (err: any) {
      console.warn("[SyllabusCompiler] Gemini primary engine failed, attempting DeepSeek fallback:", err.message);
    }
  }

  // ── Attempt 2: DEEPSEEK FALLBACK — pure synthesis of the SAME findings,
  //    NO tools, thinking disabled (DeepSeek skips Google Search; it only
  //    formats the grounded findings into the 48-node JSON).
  if (process.env.DEEPSEEK_API_KEY) {
    try {
      const deepseekAdapter = LLMFactory.getAdapter("deepseek", DEEPSEEK_MODELS.compiler);
      const res = await deepseekAdapter.generateResponse(messages, systemInstruction, [], {
        responseFormat: "json_object",
        temperature: 0.2,
        maxTokens: 4096,
        thinking: "disabled",
        signal: timeoutSignal(signal, 60_000),
      });

      const rawArray = parseSyllabusPayload(res.text || "");
      if (rawArray.length > 0) {
        const nodes = validateAndSanitizeCompiledNodes(rawArray, input);
        await logAiUsage({
          userId: userId ?? 0,
          feature: "syllabus",
          workload: `${examBoard} ${code} — ${subjectName}`,
          provider: "deepseek",
          model: DEEPSEEK_MODELS.compiler,
          promptTokens: res.usage?.promptTokens ?? 0,
          completionTokens: res.usage?.completionTokens ?? 0,
        });
        return {
          subjectName,
          code,
          examBoard,
          level,
          nodes,
          modelUsed: `DeepSeek (${DEEPSEEK_MODELS.compiler}) + ${source}`,
        };
      }
    } catch (err: any) {
      console.warn("[SyllabusCompiler] DeepSeek fallback failed:", err.message);
    }
  }

  // ── Attempt 3: Deterministic Skeleton Engine ──
  console.warn("[SyllabusCompiler] All LLM endpoints offline, generating deterministic syllabus.");
  return generateFallbackSyllabus(input);
}

