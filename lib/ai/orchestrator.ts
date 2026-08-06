import { GoogleGenAI, Type, Schema } from "@google/genai";
import Groq from "groq-sdk";

const ai = new GoogleGenAI({});
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

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
   * Uses Gemini with Google Search to find information about the topic's difficulty and standard curriculum.
   */
  private static async runResearcherAgent(topic: string, syllabusGiven: boolean, onProgress?: (msg: string) => void): Promise<string> {
    onProgress?.(`[Researcher] Initiating web search for "${topic}"...`);
    const searchPrompt = syllabusGiven 
      ? `The user already has a syllabus for "${topic}". Briefly search for the general difficulty level of this subject and common pitfalls. Keep it concise.`
      : `Find the standard curriculum, full syllabus, or typical chapters/topics for someone studying "${topic}". Also include the general difficulty level of this subject and common pitfalls. Provide a clear list of topics.`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: searchPrompt,
        config: {
          tools: [{ googleSearch: {} }],
        }
      });
      onProgress?.(`[Researcher] Gathered curriculum and difficulty data.`);
      return response.text || "No research data found.";
    } catch (e) {
      console.warn("[Researcher Agent] Gemini failed. Falling back to Groq...", e);
      try {
        const groqRes = await groq.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          messages: [{ role: "user", content: searchPrompt }],
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
          model: "llama-3.3-70b-versatile",
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
    effortHours: number,
    targetDate: string | null,
    researchData: string,
    analystData: string,
    onProgress?: (msg: string) => void
  ): Promise<StudyPlanResult> {
    onProgress?.(`[Master Planner] Drafting ${effortHours} hrs/week plan for "${topic}"...`);
    if (targetDate) {
      onProgress?.(`[Master Planner] Aligning quests to meet deadline: ${targetDate}`);
    }
    
    const schema: Schema = {
      type: Type.OBJECT,
      properties: {
        goalTitle: { type: Type.STRING, description: "A catchy, motivating title for the overarching goal." },
        goalDescription: { type: Type.STRING, description: "A short description of what this plan will achieve." },
        quests: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING, description: "Title of the specific study session/quest." },
              description: { type: Type.STRING, description: "What exactly to study in this session." },
              requiredMinutes: { type: Type.INTEGER, description: "Duration in minutes based on analyst data." },
              xpReward: { type: Type.INTEGER, description: "XP reward, usually 1 XP per minute." },
              sylphReward: { type: Type.INTEGER, description: "Bonus currency reward, usually 1-10 depending on difficulty." }
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

    const prompt = `
You are the Master Planner AI for a gamified study app (Solo Leveling themed).
Your task is to create a structured study plan with specific "Quests" for the user.

Topic: ${topic}
User's Provided Syllabus/Topics: ${syllabus || "None provided"}
Target Effort: ${effortHours} hours for the upcoming week.
${targetDatePrompt}

Researcher Agent Findings:
${researchData}

Analyst Agent Findings (User's Habits):
${analystData}

Based on this, break down the topic into a series of achievable Quests. 
The total 'requiredMinutes' of all quests should be roughly around ${effortHours * 60} minutes for the week.
Adhere strictly to the study durations suggested by the Analyst Agent (e.g. if they focus best for 45 mins, make quests 45 mins long).
    `;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: schema,
          temperature: 0.7,
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
          model: "llama-3.3-70b-versatile",
          messages: [{ role: "user", content: groqPrompt }],
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
    
    // 1 & 2: Run Researcher and Analyst in parallel for performance
    const [researchData, analystData] = await Promise.all([
      this.runResearcherAgent(topic, !!syllabus, onProgress),
      this.runAnalystAgent(pastSessions, onProgress)
    ]);

    // 3: Run Master Planner with the gathered context
    const finalPlan = await this.runMasterPlannerAgent(
      topic, 
      syllabus, 
      effortHours, 
      targetDate,
      researchData, 
      analystData,
      onProgress
    );

    return finalPlan;
  }
}
