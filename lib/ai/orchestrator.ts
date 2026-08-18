import { GoogleGenAI, Type, Schema } from "@google/genai";
import Groq from "groq-sdk";

const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY || process.env.GOOGLE_API_KEY || "dummy_gemini_key";
const ai = new GoogleGenAI({ apiKey });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || "missing_groq_key", dangerouslyAllowBrowser: true });

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
}

export class AiStudyOrchestrator {

  /**
   * 1. Researcher Agent
   * Uses Gemini with Google Search grounding to find the exact official curriculum and difficulty breakdown.
   */
  private static async runResearcherAgent(
    topic: string, 
    syllabus: string, 
    onProgress?: (msg: string) => void
  ): Promise<string> {
    const hasSyllabus = !!syllabus && syllabus.trim().length > 0;
    const searchTarget = hasSyllabus ? `${topic} (Scope: ${syllabus})` : topic;
    
    onProgress?.(`[Researcher] Initiating curriculum research and web search for "${searchTarget}"...`);

    const searchPrompt = `Search and retrieve the EXACT official curriculum / syllabus chapter breakdown for:
Topic/Subject: "${topic}"
${hasSyllabus ? `User Syllabus / Focus Scope: "${syllabus}"` : "User provided no specific syllabus constraints; retrieve standard official curriculum."}

CRITICAL RESEARCH INSTRUCTIONS:
1. DISAMBIGUATE CODES & EXAM BOARDS:
   - Identify the qualification and exam board from the topic/syllabus (e.g., Cambridge CAIE AS & A Level Physics 9702, Cambridge Math 9709, Edexcel, AQA, AP, IB, GCSE, CBSE).
   - Resolve any code ambiguities (e.g., Physics 9709 -> Cambridge AS Physics 9702).
2. PRECISE SCOPE EXTRACTION:
   - If the user specifies a subset of chapters (e.g., "first 6 chapters", "chapters 1 to 5", "Mechanics units only"), look up the official syllabus specification or standard textbook Table of Contents and extract ONLY those exact sequential chapters.
   - For example, for Cambridge AS Level Physics (9702) first 6 chapters:
     1. Physical Quantities and Units
     2. Kinematics
     3. Dynamics
     4. Forces, Density and Pressure
     5. Work, Energy and Power
     6. Deforming Solids
   - DO NOT skip chapters, do NOT combine chapters, and do NOT include topics beyond the requested range (such as Thermal Physics, Waves, Optics, Electricity, or Nuclear Physics if only the first 6 chapters are requested).
3. STRUCTURED OUTPUT FORMAT:
   Return a clear, numbered list for each chapter in the requested scope:
   - Chapter 1: [Exact Official Name] — Key Subtopics / Core Concepts — Difficulty Level & Content Weight %
   - Chapter 2: [Exact Official Name] — Key Subtopics / Core Concepts — Difficulty Level & Content Weight %
   ...
   - Chapter N: [Exact Official Name] — Key Subtopics / Core Concepts — Difficulty Level & Content Weight %
4. Include student difficulty analysis (which subtopics are conceptually challenging vs routine practice).`;

    const systemInstruction = `You are an elite Academic Curriculum Researcher with real-time web search capabilities and deep expertise in international qualifications (Cambridge CAIE AS/A-Levels, Edexcel, AQA, AP, IB, GCSE, CBSE).
Your job is to search the web for the exact, canonical syllabus structure, resolve any syllabus code typos or ambiguities, and return the precise numbered chapter titles, key subtopics, and difficulty weights for the requested scope.`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: searchPrompt,
        config: {
          systemInstruction,
          tools: [{ googleSearch: {} }],
        }
      });
      onProgress?.(`[Researcher] Gathered exact curriculum and difficulty data.`);
      return response.text || "No research data found.";
    } catch (e) {
      console.warn("[Researcher Agent] Gemini Search failed. Falling back to Groq...", e);
      try {
        const groqRes = await groq.chat.completions.create({
          model: process.env.GROQ_MODEL || "qwen/qwen3.6-27b",
          messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: searchPrompt }
          ],
        });
        onProgress?.(`[Researcher (Fallback)] Gathered knowledge-base curriculum data.`);
        return groqRes.choices[0]?.message?.content || "No research data found.";
      } catch (groqErr) {
        console.error("[Researcher Agent] Groq fallback also failed:", groqErr);
        onProgress?.(`[Researcher] Web search failed. Proceeding with general knowledge.`);
        return "Could not complete web research. Proceeding with general knowledge.";
      }
    }
  }

  /**
   * 2. Analyst Agent
   * Reviews past study sessions and determines the user's optimal study pattern.
   */
  private static async runAnalystAgent(pastSessions: StudySessionData[], onProgress?: (msg: string) => void): Promise<string> {
    onProgress?.(`[Analyst] Reviewing ${pastSessions.length} past study sessions...`);
    if (!pastSessions || pastSessions.length === 0) {
      onProgress?.(`[Analyst] No past history. Recommending standard 45-min Pomodoro sessions.`);
      return "User has no past study history. Assume standard 45-minute Pomodoro sessions.";
    }

    const prompt = `Analyze these past study sessions and give me a 2-sentence summary of the user's ideal study duration (in minutes) and their focus rate pattern. Sessions: ${JSON.stringify(pastSessions)}`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });
      onProgress?.(`[Analyst] Extracted ideal study durations and focus patterns.`);
      return response.text || "Assume standard 45-minute sessions.";
    } catch (e) {
      console.warn("[Analyst Agent] Gemini failed. Falling back to Groq...", e);
      try {
        const groqRes = await groq.chat.completions.create({
          model: process.env.GROQ_MODEL || "qwen/qwen3.6-27b",
          messages: [{ role: "user", content: prompt }],
        });
        onProgress?.(`[Analyst (Fallback)] Extracted ideal study durations and focus patterns.`);
        return groqRes.choices[0]?.message?.content || "Assume standard 45-minute sessions.";
      } catch (groqErr) {
        console.error("[Analyst Agent] Groq fallback also failed:", groqErr);
        return "Assume standard 45-minute sessions.";
      }
    }
  }

  /**
   * 3. Master Planner Agent
   * Synthesizes all information into a concrete list of Quests (tasks) to reach the goal.
   */
  private static async runMasterPlannerAgent(
    topic: string,
    syllabus: string,
    totalTargetMinutes: number,
    targetDate: string | null,
    researchData: string,
    analystData: string,
    onProgress?: (msg: string) => void
  ): Promise<StudyPlanResult> {
    onProgress?.(`[Master Planner] Drafting ${Math.round(totalTargetMinutes / 60)} hrs plan for "${topic}"...`);
    if (targetDate) {
      onProgress?.(`[Master Planner] Aligning quests to meet deadline: ${targetDate}`);
    }

    const schema: Schema = {
      type: Type.OBJECT,
      properties: {
        goalTitle: { 
          type: Type.STRING, 
          description: "A motivating, catchy title for the overarching goal (e.g., 'Master AS Level Physics: First 6 Chapters')." 
        },
        goalDescription: { 
          type: Type.STRING, 
          description: "A concise summary of all chapters covered and total study hours planned." 
        },
        quests: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { 
                type: Type.STRING, 
                description: "Title of the quest. MUST start with 'Ch N: ' where N is the sequential chapter number (e.g., 'Ch 1: Physical Quantities & Units', 'Ch 2: Kinematics'). If a chapter has 2 parts, use 'Ch N: Title - Part 1' / 'Ch N: Title - Part 2'." 
              },
              description: { 
                type: Type.STRING, 
                description: "Specific summary of key theory concepts, formulas to master, and practice problems to complete." 
              },
              requiredMinutes: { 
                type: Type.INTEGER, 
                description: "Duration in minutes allocated to this quest (between 30 and 180 minutes). MUST NOT exceed 240 minutes per quest." 
              },
              xpReward: { 
                type: Type.INTEGER, 
                description: "XP reward, equal to requiredMinutes (1 XP per minute)." 
              },
              sylphReward: { 
                type: Type.INTEGER, 
                description: "Currency reward between 5 and 30 based on chapter difficulty." 
              }
            },
            required: ["title", "description", "requiredMinutes", "xpReward", "sylphReward"]
          }
        }
      },
      required: ["goalTitle", "goalDescription", "quests"]
    };

    const targetDatePrompt = targetDate
      ? `The user has an absolute deadline on ${targetDate}. Ensure the quests are structured to cover the syllabus effectively before this date.`
      : `No strict deadline. Spread out the topics logically over time.`;

    const systemInstruction = `You are the Master Planner AI for a gamified Solo Leveling-themed study application.
Your mission is to transform academic curriculum research into an exquisitely structured, 100% accurate list of study "Quests".

MANDATORY RULES:
1. STRICT CHAPTER-BY-CHAPTER BREAKDOWN (NO LUMPING, NO GAPS):
   - You MUST create at least one dedicated quest for EVERY SINGLE chapter listed in the Researcher Agent Findings.
   - If the researcher identified 6 chapters (e.g. Ch 1, Ch 2, Ch 3, Ch 4, Ch 5, Ch 6), you MUST generate quests covering Chapter 1, Chapter 2, Chapter 3, Chapter 4, Chapter 5, and Chapter 6 in exact sequential order.
   - STRICTLY FORBIDDEN: NEVER combine or lump multiple chapters into a single quest (e.g. NEVER produce 'Ch 3-6: ...' or 'Chapters 4 & 5'). Each chapter MUST have its own individual quest(s).
   - STRICTLY FORBIDDEN: NEVER repeat the same chapter number with different names (e.g. NEVER make three separate 'Ch 1' quests with different names like 'Ch 1: Kinematics', 'Ch 1: Dynamics', 'Ch 1: Work'). Chapter numbers MUST strictly match the canonical curriculum index.
   - If a single chapter is large or difficult, split it into two sub-quests under the same chapter (e.g., 'Ch 2: Kinematics - Core Equations' and 'Ch 2: Kinematics - Projectile Motion & Past Papers').

2. NO HALLUCINATIONS / STRICT TOPIC FIDELITY:
   - Generate quests ONLY for the topics explicitly identified by the Researcher Agent.
   - NEVER add extra topics or subsequent syllabus units outside the requested scope (for example, if the first 6 chapters of AS Physics were requested, DO NOT introduce Thermal Physics, Waves, Optics, Electricity, Magnetism, or Nuclear Physics).

3. QUEST DURATION BOUNDS & TIME SUM:
   - No single quest should exceed 240 minutes (4 hours). Break large chapters into 2 distinct focused quests.
   - The SUM of 'requiredMinutes' across ALL quests MUST equal exactly ${totalTargetMinutes} minutes.
   - Distribute the minutes proportionally according to the difficulty weights from the Researcher's analysis.

4. REWARDS:
   - xpReward = requiredMinutes (1 XP per minute).
   - sylphReward = 5 to 30 based on chapter difficulty.`;

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
- Do NOT introduce chapters beyond the requested scope.`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: schema,
          temperature: 0.2,
        }
      });

      const resultText = response.text || "{}";
      const cleanText = resultText.replace(/```json/gi, "").replace(/```/g, "").trim();
      onProgress?.(`[Master Planner] Finalizing plan...`);
      return JSON.parse(cleanText) as StudyPlanResult;
    } catch (e: any) {
      console.warn("[Master Planner Agent] Gemini failed. Falling back to Groq...", e);
      try {
        const schemaString = JSON.stringify(schema, null, 2);
        const groqPrompt = prompt + `\n\nCRITICAL: You MUST return ONLY a valid JSON object matching the requested schema. No markdown. Schema:\n${schemaString}`;

        const groqRes = await groq.chat.completions.create({
          model: process.env.GROQ_MODEL || "qwen/qwen3.6-27b",
          messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: groqPrompt }
          ],
          response_format: { type: "json_object" }
        });

        const resultText = groqRes.choices[0]?.message?.content || "{}";
        const cleanText = resultText.replace(/```json/gi, "").replace(/```/g, "").trim();
        onProgress?.(`[Master Planner (Fallback)] Finalizing plan...`);
        return JSON.parse(cleanText) as StudyPlanResult;
      } catch (groqErr: any) {
        console.error("[Master Planner Agent] Groq fallback also failed:", groqErr);
        throw new Error("Master Planner failed to generate the study plan: " + groqErr.message);
      }
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
    onProgress?: (msg: string) => void
  ): Promise<StudyPlanResult> {

    // Calculate exact minutes needed
    let totalDays = 7;
    if (targetDate) {
      const diff = new Date(targetDate).getTime() - Date.now();
      totalDays = Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)));
    }
    const totalTargetMinutes = Math.round((effortHours / 7) * totalDays * 60);

    // 1 & 2: Run Researcher and Analyst in parallel for performance
    const [researchData, analystData] = await Promise.all([
      this.runResearcherAgent(topic, syllabus, onProgress),
      this.runAnalystAgent(pastSessions, onProgress)
    ]);

    // 3: Run Master Planner with the gathered context
    const finalPlan = await this.runMasterPlannerAgent(
      topic,
      syllabus,
      totalTargetMinutes,
      targetDate,
      researchData,
      analystData,
      onProgress
    );

    // 4: Mathematical Post-Processing to enforce exact target minutes & XP consistency
    if (finalPlan.quests && finalPlan.quests.length > 0) {
      let totalGeneratedMinutes = 0;
      finalPlan.quests.forEach(q => { totalGeneratedMinutes += q.requiredMinutes; });

      if (totalGeneratedMinutes > 0 && totalGeneratedMinutes !== totalTargetMinutes) {
        const ratio = totalTargetMinutes / totalGeneratedMinutes;
        let runningTotal = 0;

        for (let i = 0; i < finalPlan.quests.length; i++) {
          if (i === finalPlan.quests.length - 1) {
            // Last quest absorbs the rounding difference
            const remainder = totalTargetMinutes - runningTotal;
            finalPlan.quests[i].requiredMinutes = Math.max(15, remainder);
          } else {
            const adjusted = Math.max(15, Math.round(finalPlan.quests[i].requiredMinutes * ratio));
            finalPlan.quests[i].requiredMinutes = adjusted;
            runningTotal += adjusted;
          }
        }
      }

      // Synchronize xpReward with requiredMinutes (1 XP per min)
      finalPlan.quests.forEach(q => {
        q.xpReward = q.requiredMinutes;
        if (!q.sylphReward || q.sylphReward < 5) q.sylphReward = 10;
      });
    }

    return finalPlan;
  }
}
