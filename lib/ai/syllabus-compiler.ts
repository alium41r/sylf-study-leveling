import { SKELETON_NODES, type SkeletonNode } from "@/lib/skill-tree-skeleton";
import { LLMFactory } from "./providers/factory";
import { DEEPSEEK_MODELS, GEMINI_MODELS } from "./config";
import { NormalizedMessage } from "./providers/types";
import { extractJson } from "./json-extractor";
import { z } from "zod";

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
 * Main Service: Compiles a syllabus using multi-engine router (DeepSeek primary with Gemini research fallback).
 */
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

export async function compileSyllabus(
  input: CompileSyllabusInput,
  signal?: AbortSignal
): Promise<SyllabusCompilationResult> {
  const subjectName = input.name.trim();
  const code = input.code.trim().toUpperCase();
  const examBoard = (input.examBoard || "CAIE").trim().toUpperCase();
  const level = (input.level || "A-Level").trim();

  const userPrompt = `Decompose syllabus ${examBoard} ${code} (${subjectName}, ${level}) into the 48-node constellation graph. Output JSON only.`;
  const systemInstruction = `
You are an expert academic curriculum architect and syllabus compiler for premier international examination boards (e.g. CAIE Cambridge International, Edexcel Pearson, AQA, AP College Board, International Baccalaureate IB, University level).

Your task is to decompose the official syllabus into an exact 48-node academic progression graph.

Target Syllabus:
- Subject Name: "${subjectName}"
- Syllabus Code: "${code}"
- Examination Board: "${examBoard}"
- Academic Level: "${level}"

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
- Return ONLY a valid, parseable JSON array of 48 objects with properties:
  - "nodeId": string (e.g. "N1_1")
  - "tier": number (1 to 10)
  - "title": string (3-7 words, concrete academic topic name, NO generic placeholders)
  - "description": string (1-2 clear sentences outlining the learning objectives and past-paper competencies)
  - "difficulty": number (integer between 1 and 5)
`.trim();

  const messages: NormalizedMessage[] = [
    { role: "user", content: userPrompt },
  ];

  // Attempt 1: DeepSeek Primary Engine (deepseek-v4-pro)
  if (process.env.DEEPSEEK_API_KEY) {
    try {
      const deepseekAdapter = LLMFactory.getAdapter("deepseek", DEEPSEEK_MODELS.compiler);
      const res = await deepseekAdapter.generateResponse(messages, systemInstruction, [], {
        responseFormat: "json_object",
        signal,
      });

      const rawArray = parseSyllabusPayload(res.text || "");
      if (rawArray.length > 0) {
        const nodes = validateAndSanitizeCompiledNodes(rawArray, input);
        return {
          subjectName,
          code,
          examBoard,
          level,
          nodes,
          modelUsed: `DeepSeek (${DEEPSEEK_MODELS.compiler})`,
        };
      }
    } catch (err: any) {
      console.warn("[SyllabusCompiler] Primary DeepSeek engine failed, attempting Gemini research fallback:", err.message);
    }
  }

  // Attempt 2: Gemini Research Fallback Engine (gemini-3.1-pro / gemini-2.5-flash)
  const geminiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GENAI_API_KEY ||
    process.env.GOOGLE_API_KEY;

  if (geminiKey) {
    const candidateModels = [GEMINI_MODELS.research, "gemini-3.7-flash", "gemini-3.6-flash"];
    for (const modelName of candidateModels) {
      try {
        const geminiAdapter = LLMFactory.getAdapter("gemini", modelName);
        const res = await geminiAdapter.generateResponse(messages, systemInstruction, [], {
          signal,
        });

        const rawArray = parseSyllabusPayload(res.text || "");
        if (rawArray.length > 0) {
          const nodes = validateAndSanitizeCompiledNodes(rawArray, input);
          return {
            subjectName,
            code,
            examBoard,
            level,
            nodes,
            modelUsed: `Gemini (${modelName})`,
          };
        }
      } catch (geminiErr: any) {
        console.warn(`[SyllabusCompiler] Gemini ${modelName} fallback failed:`, geminiErr.message);
      }
    }
  }

  // Attempt 3: Deterministic Skeleton Engine
  console.warn("[SyllabusCompiler] All LLM endpoints offline, generating deterministic syllabus.");
  return generateFallbackSyllabus(input);
}

