import { GoogleGenAI, Type, Schema } from "@google/genai";
import { LLMFactory } from "./providers/factory";
import { DEEPSEEK_MODELS, GEMINI_MODELS, GROQ_MODELS } from "./config";
import { NormalizedMessage } from "./providers/types";
import { executeGoogleSearch } from "./chat-tool-executor";
import { calculateQuestRewards, calculateRecommendedDifficulty } from "@/lib/difficulty-engine";
import { extractJson } from "./json-extractor";
import { z } from "zod";

export interface StudySessionData {
  durationMinutes: number;
  focusRate: number;
  startedAt: Date;
  subject?: string;
}

export interface GeneratedQuest {
  title: string;
  description: string;
  requiredMinutes: number;
  xpReward: number;
  sylphReward: number;
}

export interface StudyPlanResult {
  goalTitle: string;
  goalDescription: string;
  quests: GeneratedQuest[];
  modelUsed?: string;
  /** Summed token usage across all agent generations (telemetry). */
  usage?: { promptTokens: number; completionTokens: number };
}

export class AiStudyOrchestrator {
  /**
   * Shared Zod schema for the Master Planner's structured output.
   * Numeric fields are coerced defensively (the model frequently emits
   * strings) and defaulted so a missing optional field never nukes the
   * whole engine chain. LLM-supplied xp/sylph values are DISCARDED by
   * deterministic post-processing regardless.
   */
  private static buildPlanSchema(topic: string) {
    const safeInt = (fallback: number, min: number, max: number) =>
      z.preprocess(
        (v) => (v === undefined || v === null || v === "" ? fallback : v),
        z.coerce.number().int().min(min).max(max)
      );

    return z.object({
      goalTitle: z.preprocess(
        (v) => (typeof v === "string" && v.trim().length > 0 ? v : topic),
        z.string().min(1).max(120)
      ),
      goalDescription: z.preprocess(
        (v) => (typeof v === "string" ? v : ""),
        z.string().max(1000)
      ),
      quests: z
        .array(
          z.object({
            title: z.preprocess(
              (v) => (typeof v === "string" ? v : "Study Quest"),
              z.string().min(1).max(200)
            ),
            description: z.preprocess(
              (v) => (typeof v === "string" ? v : ""),
              z.string().max(1000)
            ),
            requiredMinutes: safeInt(45, 1, 600),
            xpReward: safeInt(0, 0, 100_000),
            sylphReward: safeInt(0, 0, 100_000),
          })
        )
        .min(1)
        .max(60),
    });
  }

  /**
   * Parse a planner payload through the shared resilient extractor.
   * Returns null on ANY extraction/schema failure so the caller can
   * cascade to the next engine without losing the error context.
   */
  private static parsePlanPayload(rawText: string, topic: string): StudyPlanResult | null {
    try {
      return extractJson<StudyPlanResult>(rawText, this.buildPlanSchema(topic));
    } catch (err: any) {
      console.warn("[Master Planner] Payload rejected by extractJson:", err.message);
      return null;
    }
  }

  /** Never cascade on client aborts — propagate immediately. */
  private static rethrowIfAborted(err: any, signal?: AbortSignal): void {
    if (signal?.aborted || err?.name === "AbortError" || err?.code === "ABORT_ERR") {
      throw err;
    }
  }

  /** Sum LLMResponse usage objects for telemetry. */
  private static sumUsage(
    ...usages: Array<{ promptTokens?: number; completionTokens?: number } | undefined>
  ): { promptTokens: number; completionTokens: number } {
    let promptTokens = 0;
    let completionTokens = 0;
    for (const u of usages) {
      if (!u) continue;
      promptTokens += u.promptTokens || 0;
      completionTokens += u.completionTokens || 0;
    }
    return { promptTokens, completionTokens };
  }

  /** Extract usage from a GoogleGenAI raw response (usageMetadata). */
  private static geminiUsage(response: any): {
    promptTokens: number;
    completionTokens: number;
  } {
    const meta = response?.usageMetadata;
    return {
      promptTokens: meta?.promptTokenCount || 0,
      completionTokens: meta?.candidatesTokenCount || 0,
    };
  }

  /**
   * 1. Researcher Agent
   * Deterministic grounded research: live Google Search (Gemini grounding)
   * runs FIRST and ALWAYS. The LLM (DeepSeek primary) only SYNTHESIZES the
   * real search findings into the numbered chapter breakdown — it is never
   * trusted to research from memory, because DeepSeek's optional tool calling
   * routinely skipped the search and hallucinated wrong chapter lists.
   */
  private static async runResearcherAgent(
    topic: string,
    syllabus: string,
    onProgress?: (msg: string) => void,
    signal?: AbortSignal
  ): Promise<{ data: string; model: string; usage?: { promptTokens: number; completionTokens: number } }> {
    const hasSyllabus = !!syllabus && syllabus.trim().length > 0;
    const searchTarget = hasSyllabus ? `${topic} (Scope: ${syllabus})` : topic;

    onProgress?.(
      `[Researcher] Running grounded Google Search for "${searchTarget}"...`
    );

    // ── 1. DETERMINISTIC GROUNDED SEARCH ─────────────────────────
    // Fetched directly via Gemini's Google Search grounding BEFORE any
    // generative model is asked for curriculum facts.
    let groundedFindings = "";
    let searchSource = "grounded search";
    try {
      const searchResult = await executeGoogleSearch({
        query: topic,
        qualification: syllabus || undefined,
      });
      if (searchResult?.summary) {
        groundedFindings = String(searchResult.summary);
        searchSource = searchResult.source || "grounded search";
      }
    } catch (searchErr: any) {
      console.warn("[Researcher Agent] Grounded search failed, continuing with model synthesis:", searchErr?.message);
    }

    if (!groundedFindings.trim()) {
      groundedFindings =
        `Live search unavailable. Use ONLY well-established, official curriculum knowledge for "${searchTarget}" and clearly mark any uncertainty.`;
    }

    onProgress?.(
      `[Researcher] Live findings received (${searchSource}). Synthesizing official chapter breakdown...`
    );

    const synthesisSystemInstruction = `You are an elite Academic Curriculum Researcher with deep expertise in international qualifications (Cambridge CAIE AS/A-Levels, Edexcel, AQA, AP, IB, GCSE, CBSE, FBISE, BISE, AKU-EB).
Your job is to convert the provided LIVE SEARCH FINDINGS into the precise numbered chapter titles, key subtopics, and difficulty weights for the requested scope. STRICT FIDELITY: use only chapter names and facts that appear in the search findings — never invent or reorder chapters.`;

    const synthesisPrompt = `LIVE GROUNDED SEARCH FINDINGS (${searchSource}) for:
Topic/Subject: "${topic}"
${hasSyllabus ? `User Syllabus / Focus Scope: "${syllabus}"` : "No specific syllabus constraints provided."}

${groundedFindings}

TASK — produce the exact curriculum breakdown:
1. DISAMBIGUATE CODES & EXAM BOARDS:
   - Identify the qualification and exam board from the topic/syllabus and the findings (e.g., Cambridge CAIE 9702, 9709, Edexcel, AQA, AP, IB, CBSE, FBISE).
2. PRECISE SCOPE EXTRACTION:
   - If the user specifies a subset (e.g., "first 6 chapters", "chapters 1 to 5"), extract ONLY those exact sequential chapters from the findings.
   - DO NOT skip, combine, or add chapters beyond the requested range.
3. STRUCTURED OUTPUT FORMAT:
   Return a clear, numbered list for each chapter in the requested scope:
   - Chapter 1: [Exact Official Name] — Key Subtopics / Core Concepts — Difficulty Level & Content Weight %
   - Chapter 2: ...
   - Chapter N: ...
4. Include a short student difficulty analysis (which subtopics are conceptually challenging vs routine practice).
5. If the live findings do NOT contain the requested curriculum, say so explicitly and provide the closest well-established structure with a clear disclaimer instead of fabricating.`;

    // ── 2. DeepSeek SYNTHESIS (no tools — formatting + fidelity pass) ──
    if (process.env.DEEPSEEK_API_KEY) {
      try {
        const deepseek = LLMFactory.getAdapter("deepseek", DEEPSEEK_MODELS.planner);
        const messages: NormalizedMessage[] = [
          { role: "user", content: synthesisPrompt },
        ];

        onProgress?.(`[Researcher • DeepSeek v4 Pro] Synthesizing grounded findings into the official chapter list...`);
        const res = await deepseek.generateResponse(messages, synthesisSystemInstruction, [], { signal });

        if (res.text && res.text.trim().length > 50) {
          onProgress?.(`[Researcher • DeepSeek v4 Pro] Curriculum research finalized from live search findings.`);
          return {
            data: res.text,
            model: `DeepSeek (${DEEPSEEK_MODELS.planner}) + ${searchSource}`,
            usage: this.sumUsage(res.usage),
          };
        }
      } catch (deepseekErr: any) {
        this.rethrowIfAborted(deepseekErr, signal);
        console.warn("[Researcher Agent] DeepSeek synthesis failed. Falling back to Gemini research:", deepseekErr.message);
      }
    }

    // ── 3. Gemini fallback — synthesize the SAME grounded findings (with its
    //       own live googleSearch grounding as an additional safety net). ──
    const geminiKey =
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_GENAI_API_KEY ||
      process.env.GOOGLE_API_KEY;

    if (geminiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey: geminiKey });
        const response = await ai.models.generateContent({
          model: GEMINI_MODELS.research,
          contents: synthesisPrompt,
          config: {
            systemInstruction: synthesisSystemInstruction,
            tools: [{ googleSearch: {} }],
            abortSignal: signal,
          },
        });

        onProgress?.(`[Researcher • Gemini 3.1 Pro] Gathered exact curriculum data via grounded findings + live search.`);
        return {
          data: response.text || "No research data found.",
          model: `Gemini (${GEMINI_MODELS.research})`,
          usage: this.geminiUsage(response),
        };
      } catch (geminiErr: any) {
        this.rethrowIfAborted(geminiErr, signal);
        console.warn("[Researcher Agent] Gemini 3.1 Pro search failed, trying 3.7-flash:", geminiErr.message);
        try {
          const ai = new GoogleGenAI({ apiKey: geminiKey });
          const response = await ai.models.generateContent({
            model: "gemini-3.7-flash",
            contents: synthesisPrompt,
            config: {
              systemInstruction: synthesisSystemInstruction,
              tools: [{ googleSearch: {} }],
              abortSignal: signal,
            },
          });
          onProgress?.(`[Researcher • Gemini 3.7 Flash] Gathered curriculum research.`);
          return {
            data: response.text || "No research data found.",
            model: "Gemini 3.7 Flash",
            usage: this.geminiUsage(response),
          };
        } catch (e) {
          console.warn("[Researcher Agent] Gemini 3.7 Flash fallback failed, trying Groq:", e);
        }
      }
    }

    // ── 4. Groq fallback (synthesizes the grounded findings) ──
    try {
      const groqAdapter = LLMFactory.getAdapter("groq", GROQ_MODELS.default);
      const groqRes = await groqAdapter.generateResponse(
        [{ role: "user", content: synthesisPrompt }],
        synthesisSystemInstruction,
        [],
        { signal }
      );
      onProgress?.(`[Researcher • Groq (${GROQ_MODELS.default})] Synthesized curriculum data from grounded findings.`);
      return {
        data: groqRes.text || "No research data found.",
        model: `Groq (${GROQ_MODELS.default})`,
        usage: this.sumUsage(groqRes.usage),
      };
    } catch (groqErr: any) {
      this.rethrowIfAborted(groqErr, signal);
      console.error("[Researcher Agent] Groq fallback failed:", groqErr);
      onProgress?.(`[Researcher] All engines unavailable. Proceeding with the grounded findings directly.`);
      return {
        data: groundedFindings,
        model: "Grounded Search Findings",
      };
    }
  }

  /**
   * 2. Analyst Agent
   * Reviews past study sessions and determines the user's optimal study pattern.
   */
  private static async runAnalystAgent(
    pastSessions: StudySessionData[],
    onProgress?: (msg: string) => void,
    signal?: AbortSignal
  ): Promise<{ data: string; model: string; usage?: { promptTokens: number; completionTokens: number } }> {
    onProgress?.(`[Analyst • DeepSeek & Gemini] Reviewing ${pastSessions.length} past study sessions...`);
    if (!pastSessions || pastSessions.length === 0) {
      onProgress?.(`[Analyst] No past history. Recommending standard 45-min Pomodoro sessions.`);
      return {
        data: "User has no past study history. Assume standard 45-minute Pomodoro sessions.",
        model: "Standard Default",
      };
    }

    const prompt = `Analyze these past study sessions and give me a 2-sentence summary of the user's ideal study duration (in minutes) and their focus rate pattern. Sessions: ${JSON.stringify(
      pastSessions
    )}`;

    if (process.env.DEEPSEEK_API_KEY) {
      try {
        const deepseek = LLMFactory.getAdapter("deepseek", DEEPSEEK_MODELS.chat);
        const res = await deepseek.generateResponse(
          [{ role: "user", content: prompt }],
          "You are a concise study habits analyst.",
          [],
          { signal }
        );
        if (res.text) {
          onProgress?.(`[Analyst • DeepSeek] Extracted ideal study durations and focus patterns.`);
          return {
            data: res.text,
            model: `DeepSeek (${DEEPSEEK_MODELS.chat})`,
            usage: this.sumUsage(res.usage),
          };
        }
      } catch (err) {
        this.rethrowIfAborted(err, signal);
        console.warn("[Analyst Agent] DeepSeek failed, using fallback:", err);
      }
    }

    const geminiKey =
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_GENAI_API_KEY ||
      process.env.GOOGLE_API_KEY;

    if (geminiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey: geminiKey });
        const response = await ai.models.generateContent({
          model: "gemini-3.7-flash",
          contents: prompt,
          config: {
            abortSignal: signal,
          },
        });
        onProgress?.(`[Analyst • Gemini] Extracted ideal study durations and focus patterns.`);
        return {
          data: response.text || "Assume standard 45-minute sessions.",
          model: "Gemini 3.7 Flash",
          usage: this.geminiUsage(response),
        };
      } catch (e) {
        console.warn("[Analyst Agent] Gemini failed:", e);
      }
    }

    return {
      data: "Assume standard 45-minute sessions.",
      model: "Standard Default",
    };
  }

  /**
   * 3. Master Planner Agent
   * Synthesizes all information into a concrete list of Quests (tasks) to reach the goal.
   * Primary: deepseek-v4-pro. Fallback: gemini-3.1-pro / 3.7-flash.
   */
  private static async runMasterPlannerAgent(
    topic: string,
    syllabus: string,
    totalTargetMinutes: number,
    targetDate: string | null,
    researchData: string,
    analystData: string,
    onProgress?: (msg: string) => void,
    signal?: AbortSignal
  ): Promise<StudyPlanResult> {
    onProgress?.(
      `[Master Planner • DeepSeek v4 Pro] Drafting ${Math.round(
        totalTargetMinutes / 60
      )} hrs plan for "${topic}"...`
    );
    if (targetDate) {
      onProgress?.(`[Master Planner] Aligning quests to meet deadline: ${targetDate}`);
    }

    const targetDatePrompt = targetDate
      ? `The user has an absolute deadline on ${targetDate}. Ensure the quests are structured to cover the syllabus effectively before this date.`
      : `No strict deadline. Spread out the topics logically over time.`;

    const systemInstruction = `You are the Master Planner AI for a gamified Solo Leveling-themed study application.
Your mission is to transform academic curriculum research into an exquisitely structured, 100% accurate list of study "Quests".

MANDATORY RULES:
1. STRICT CHAPTER-BY-CHAPTER BREAKDOWN (NO LUMPING, NO GAPS):
   - You MUST create at least one dedicated quest for EVERY SINGLE chapter listed in the Researcher Agent Findings.
   - If the researcher identified 6 chapters (e.g. Ch 1, Ch 2, Ch 3, Ch 4, Ch 5, Ch 6), you MUST generate quests covering Chapter 1, Chapter 2, Chapter 3, Chapter 4, Chapter 5, and Chapter 6 in exact sequential order.
   - STRICTLY FORBIDDEN: NEVER combine or lump multiple chapters into a single quest.
   - STRICTLY FORBIDDEN: NEVER repeat the same chapter number with different names. Chapter numbers MUST strictly match the canonical curriculum index.
   - If a single chapter is large or difficult, split it into two sub-quests under the same chapter (e.g., 'Ch 2: Kinematics - Core Equations' and 'Ch 2: Kinematics - Projectile Motion & Past Papers').

2. NO HALLUCINATIONS / STRICT TOPIC FIDELITY:
   - Generate quests ONLY for the topics explicitly identified by the Researcher Agent.
   - NEVER add extra topics or subsequent syllabus units outside the requested scope.

3. QUEST DURATION BOUNDS & TIME SUM:
   - No single quest should exceed 240 minutes (4 hours).
   - The SUM of 'requiredMinutes' across ALL quests MUST equal approximately ${totalTargetMinutes} minutes.
   - Distribute the minutes proportionally according to the difficulty weights from the Researcher's analysis.

4. REWARDS:
   - Set "xpReward" and "sylphReward" to 0 — the system computes canonical rewards deterministically from quest duration and difficulty tier.
   - NEVER invent reward values; the backend overrides them regardless.

OUTPUT FORMAT:
Return ONLY a valid JSON object matching this exact schema:
{
  "goalTitle": "Motivating catchy goal title",
  "goalDescription": "One to two concise sentences: which chapters are covered and the total planned hours. No preamble, no filler.",
  "quests": [
    {
      "title": "Ch 1: Physical Quantities & Units",
      "description": "One concise sentence: the key concepts/formulas to master and the practice to complete.",
      "requiredMinutes": 45,
      "xpReward": 45,
      "sylphReward": 10
    }
  ]
}`;

    const prompt = `
Topic: ${topic}
User's Provided Syllabus/Topics: ${syllabus || "None provided"}
Target Total Workload: ${totalTargetMinutes} minutes.
${targetDatePrompt}

Researcher Agent Findings (Official Syllabus & Difficulty Breakdown):
${researchData}

Analyst Agent Findings (User's Study Habits):
${analystData}

Based strictly on the Researcher Agent Findings above, create the final Quest breakdown for "${topic}".
Remember:
- Cover EVERY SINGLE researched chapter with its own dedicated quest (Ch 1, Ch 2, Ch 3, ...).
- Do NOT lump multiple chapters together.
- Do NOT introduce chapters beyond the requested scope.
- Return valid JSON only.`;

    const messages: NormalizedMessage[] = [{ role: "user", content: prompt }];

    // Attempt 1: DeepSeek Primary Engine (deepseek-v4-pro)
    if (process.env.DEEPSEEK_API_KEY) {
      try {
        const deepseek = LLMFactory.getAdapter("deepseek", DEEPSEEK_MODELS.planner);
        const res = await deepseek.generateResponse(messages, systemInstruction, [], {
          responseFormat: "json_object",
          signal,
        });

        const parsed = this.parsePlanPayload(res.text || "", topic);
        if (parsed && parsed.quests.length > 0) {
          parsed.modelUsed = `DeepSeek (${DEEPSEEK_MODELS.planner})`;
          parsed.usage = this.sumUsage(res.usage);
          return parsed;
        }
      } catch (deepseekErr: any) {
        this.rethrowIfAborted(deepseekErr, signal);
        console.warn("[Master Planner Agent] DeepSeek failed, attempting Gemini fallback:", deepseekErr.message);
      }
    }

    // Attempt 2: Gemini Fallback Engine (gemini-3.1-pro / gemini-3.7-flash)
    const geminiKey =
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_GENAI_API_KEY ||
      process.env.GOOGLE_API_KEY;

    if (geminiKey) {
      try {
        const geminiAdapter = LLMFactory.getAdapter("gemini", GEMINI_MODELS.research);
        const res = await geminiAdapter.generateResponse(messages, systemInstruction, [], {
          signal,
        });

        const parsed = this.parsePlanPayload(res.text || "", topic);
        if (parsed && parsed.quests.length > 0) {
          parsed.modelUsed = `Gemini (${GEMINI_MODELS.research})`;
          parsed.usage = this.sumUsage(res.usage);
          return parsed;
        }
      } catch (geminiErr: any) {
        this.rethrowIfAborted(geminiErr, signal);
        console.warn("[Master Planner Agent] Gemini research failed, trying 3.7-flash:", geminiErr.message);
        try {
          const geminiFlash = LLMFactory.getAdapter("gemini", "gemini-3.7-flash");
          const res = await geminiFlash.generateResponse(messages, systemInstruction, [], {
            signal,
          });

          const parsed = this.parsePlanPayload(res.text || "", topic);
          if (parsed && parsed.quests.length > 0) {
            parsed.modelUsed = "Gemini 3.7 Flash";
            parsed.usage = this.sumUsage(res.usage);
            return parsed;
          }
        } catch (flashErr) {
          console.warn("[Master Planner Agent] Gemini flash failed:", flashErr);
        }
      }
    }

    // Attempt 3: Groq Fallback Engine
    try {
      const groqAdapter = LLMFactory.getAdapter("groq", GROQ_MODELS.default);
      const groqRes = await groqAdapter.generateResponse(messages, systemInstruction, [], {
        signal,
      });

      const parsed = this.parsePlanPayload(groqRes.text || "", topic);
      if (parsed && parsed.quests.length > 0) {
        parsed.modelUsed = `Groq (${GROQ_MODELS.default})`;
        parsed.usage = this.sumUsage(groqRes.usage);
        return parsed;
      }
      throw new Error("Groq planner output failed schema validation");
    } catch (groqErr: any) {
      this.rethrowIfAborted(groqErr, signal);
      console.error("[Master Planner Agent] Groq fallback failed:", groqErr);
      throw new Error("Master Planner failed across all engines: " + groqErr.message);
    }
  }


  /**
   * Main Orchestrator Entrypoint
   */
  public static async generatePlan(
    topic: string,
    syllabus: string,
    effortHours: number,
    targetDate: string | null,
    pastSessions: StudySessionData[],
    onProgress?: (msg: string) => void,
    signal?: AbortSignal
  ): Promise<StudyPlanResult> {

    // Calculate exact minutes needed
    let totalDays = 7;
    if (targetDate) {
      const diff = new Date(targetDate).getTime() - Date.now();
      if (Number.isFinite(diff)) {
        totalDays = Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)));
      }
    }
    const totalTargetMinutes = Math.round((effortHours / 7) * totalDays * 60);

    // 1 & 2: Run Researcher and Analyst in parallel for performance
    const [researchData, analystData] = await Promise.all([
      this.runResearcherAgent(topic, syllabus, onProgress, signal),
      this.runAnalystAgent(pastSessions, onProgress, signal)
    ]);

    // 3: Run Master Planner with the gathered context
    const finalPlan = await this.runMasterPlannerAgent(
      topic,
      syllabus,
      totalTargetMinutes,
      targetDate,
      researchData.data,
      analystData.data,
      onProgress,
      signal
    );

    // Sum token usage across all agents for cost telemetry.
    finalPlan.usage = this.sumUsage(researchData.usage, analystData.usage, finalPlan.usage);

    // 4: Mathematical Post-Processing to enforce exact target minutes & canonical rewards
    if (finalPlan.quests && finalPlan.quests.length > 0) {
      const target = Math.round(totalTargetMinutes);
      const isFiniteTarget = Number.isFinite(target) && target > 0;

      if (isFiniteTarget) {
        // Clamp every quest into [15, 240] first, then distribute the target
        // EXACTLY via proportional shares so the sum always equals the target.
        const weights = finalPlan.quests.map((q) =>
          Math.min(240, Math.max(15, Math.round(Number(q.requiredMinutes) || 15)))
        );
        const weightSum = weights.reduce((a, b) => a + b, 0);
        let remaining = target;

        for (let i = 0; i < finalPlan.quests.length; i++) {
          let share: number;
          if (i === finalPlan.quests.length - 1) {
            // Last quest absorbs the rounding remainder; clamp to [15, 240]
            share = Math.min(240, Math.max(15, remaining));
          } else {
            share = Math.min(240, Math.max(15, Math.round((target * weights[i]) / weightSum)));
          }
          finalPlan.quests[i].requiredMinutes = share;
          remaining -= share;
        }
      } else {
        // Degenerate target (e.g. NaN from an invalid deadline) — sanitize
        // each quest independently instead of poisoning the whole plan.
        finalPlan.quests.forEach((q) => {
          q.requiredMinutes = Math.min(
            240,
            Math.max(15, Math.round(Number(q.requiredMinutes) || 45))
          );
        });
      }

      // Synchronize rewards via the CANONICAL unified quest reward standard.
      // LLM-supplied xp/sylph values are discarded — they must never set the
      // economy; difficulty tier + duration alone do.
      finalPlan.quests.forEach((q) => {
        const difficulty = calculateRecommendedDifficulty(q.requiredMinutes);
        const rewards = calculateQuestRewards(q.requiredMinutes, difficulty);
        q.xpReward = rewards.xp;
        q.sylphReward = rewards.sylph;
      });
    }

    return finalPlan;
  }
}
