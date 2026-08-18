import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import fs from "fs/promises";
import path from "path";
import { getToolsForAgent, AgentType, ALLOWED_HANDOFFS } from "@/lib/ai/chat-tools";
import { executeChatTool } from "@/lib/ai/chat-tool-executor";
import { LLMFactory } from "@/lib/ai/providers/factory";
import { NormalizedMessage } from "@/lib/ai/providers/types";
import { checkQuota, recordUsage } from "@/lib/ai/usage-limiter";
import { AI_LIMITS } from "@/lib/ai/config";

const MAX_TOOL_ITERATIONS = AI_LIMITS.maxToolIterations;

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await verifyToken(authHeader.split(" ")[1]);
    if (!payload) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const userId = payload.userId as number;

    // ── Quota enforcement ─────────────────────────────────
    const quota = await checkQuota(userId, "chat");
    if (!quota.allowed) {
      return NextResponse.json(
        { error: "quota_exceeded", remaining: 0, limit: quota.limit, resetsAt: quota.resetsAt },
        { status: 429 }
      );
    }

    const formData = await req.formData();
    const messageText = formData.get("message") as string;
    const file = formData.get("file") as File | null;
    let sessionIdStr = formData.get("sessionId") as string | null;
    const modelPreference = (formData.get("modelPreference") as string) || "auto";

    if (!messageText && !file) {
      return NextResponse.json({ error: "Empty message" }, { status: 400 });
    }

    let sessionId: number | null = null;
    let isNewSession = false;
    let newSession = null;
    if (sessionIdStr) {
      sessionId = parseInt(sessionIdStr);
    } else {
      isNewSession = true;
      const title = messageText 
        ? (messageText.length > 30 ? messageText.slice(0, 30) + "..." : messageText) 
        : "Attachment Analysis";
      
      newSession = await prisma.chatSession.create({
        data: { userId, title },
      });
      sessionId = newSession.id;
    }

    // ── Handle file upload ──────────────────────────────────
    let attachmentUrl: string | null = null;
    let base64Data: string | null = null;
    let mimeType: string | null = null;

    if (file && file.size > 0) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const filename = `${Date.now()}-${file.name.replace(/\s+/g, "_")}`;
      const uploadDir = path.join(process.cwd(), "public/uploads");
      await fs.writeFile(path.join(uploadDir, filename), buffer);
      attachmentUrl = `/uploads/${filename}`;
      base64Data = buffer.toString("base64");
      mimeType = file.type;
    }

    // ── Save user message to DB ─────────────────────────────
    const userMessageContent = messageText || "Sent an attachment.";
    const userMessage = await prisma.systemMessage.create({
      data: {
        userId,
        sessionId,
        content: userMessageContent,
        type: "USER",
        read: true,
        attachmentUrl,
      },
    });

    const recentMessages = await prisma.systemMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" },
      take: 20,
    });

    // ── Build normalized history for adapter ──────────────
    const normalizedHistory: NormalizedMessage[] = recentMessages
      .filter((m) => m.id !== userMessage.id) 
      .map((m) => ({
        role: m.type === "USER" ? "user" : "assistant",
        content: m.content,
      }));

    // ── Build tiered AI context and route to specialist agent ──
    const { buildCoreContext, buildRelevantContext, formatCoreContext, formatRelevantContext } = await import("@/lib/ai/context-engine");
    const core = await buildCoreContext(userId);
    const coreString = formatCoreContext(core);

    const { routeMessage } = await import("@/lib/ai/agent-router");
    const routerCtx = {
      user: { hp: core.user.hp, maxHp: core.user.maxHp },
      today: { overdueCount: core.today.overdueCount },
    };
    const routeResult = routeMessage(messageText || "", routerCtx);

    const relevant = await buildRelevantContext(userId, routeResult.agent, [], messageText);
    const relevantString = formatRelevantContext(relevant);

    const { buildSystemInstruction } = await import("@/lib/ai/prompts");
    const systemInstruction = buildSystemInstruction(
      routeResult.agent,
      coreString,
      core.localTimeContext.localDate,
      relevantString
    );
    console.log(`[Agent Router] → ${routeResult.agent} (conf: ${routeResult.confidence.toFixed(2)}) | Sections: core${Object.keys(relevant).length > 0 ? " + " + Object.keys(relevant).join(", ") : ""}`);

    // ── Build the user's current message ──────────────
    const currentUserMsg: NormalizedMessage = {
      role: "user",
      content: messageText || "Please analyze this attachment.",
      parts: (base64Data && mimeType) ? [{ inlineData: { mimeType, data: base64Data } }] : undefined
    };
    normalizedHistory.push(currentUserMsg);

    // ── Function-calling loop via LLMFactory with Auto Fallback ──────────────
    let aiResponseText = "";
    let actualModelUsed = "GEMINI";

    const executeAgentLoop = async (provider: "gemini" | "groq"): Promise<string> => {
      const adapter = LLMFactory.getAdapter(provider);
      let currentAgent = routeResult.agent as AgentType;
      let tools = getToolsForAgent(currentAgent);
      let systemInstruction = buildSystemInstruction(
        currentAgent,
        coreString,
        core.localTimeContext.localDate,
        relevantString
      );

      // Deep copy history for this execution attempt so retries start with fresh history
      const runHistory: NormalizedMessage[] = JSON.parse(JSON.stringify(normalizedHistory));

      let iterations = 0;
      let handoffs = 0;
      let response = await adapter.generateResponse(runHistory, systemInstruction, tools);

      while (response.toolCalls && response.toolCalls.length > 0 && iterations < MAX_TOOL_ITERATIONS) {
        iterations++;

        runHistory.push({
          role: "assistant",
          toolCalls: response.toolCalls,
          rawParts: response.rawCandidateParts,
        });

        const toolResultsMsg: NormalizedMessage = {
          role: "tool",
          toolResults: []
        };

        let didHandoff = false;

        for (const tc of response.toolCalls) {
          console.log(`[${provider.toUpperCase()}] Tool call: ${tc.name}(${JSON.stringify(tc.args)})`);
          let result;

          if (tc.name === "handoff") {
            const targetAgent = tc.args.target_agent as AgentType;
            const allowedTargets = ALLOWED_HANDOFFS[currentAgent] || [];

            if (!allowedTargets.includes(targetAgent)) {
              result = { error: `Unauthorized handoff. You cannot handoff to ${targetAgent}.` };
            } else if (handoffs >= 1) { // MAX_HANDOFFS = 1
              result = { error: "Handoff failed. Maximum number of handoffs reached for this request." };
            } else {
              handoffs++;
              currentAgent = targetAgent;
              didHandoff = true;
              result = { success: true, message: `Handoff successful. You are now the ${targetAgent} agent.` };
            }
          } else {
            try {
              result = await executeChatTool(tc.name, tc.args, userId);
            } catch (err: any) {
              console.error(`[${provider.toUpperCase()}] Tool execution failed:`, err);
              result = { error: "Failed to execute tool.", details: err.message };
            }
          }
          toolResultsMsg.toolResults!.push({ toolCallId: tc.id, name: tc.name, result });
        }

        runHistory.push(toolResultsMsg);

        if (didHandoff) {
          const newRelevant = await buildRelevantContext(userId, currentAgent, [], messageText);
          const newRelevantString = formatRelevantContext(newRelevant);
          systemInstruction = buildSystemInstruction(currentAgent, coreString, core.localTimeContext.localDate, newRelevantString);
          tools = getToolsForAgent(currentAgent);
        }

        response = await adapter.generateResponse(runHistory, systemInstruction, tools);
      }

      return (
        response.text ||
        (iterations >= MAX_TOOL_ITERATIONS
          ? "Failed to complete task."
          : iterations > 0
          ? "Action completed successfully!"
          : "I couldn't process that request. Could you try again?")
      );
    };

    const withTimeout = <T>(promise: Promise<T>): Promise<T> => {
      return Promise.race([
        promise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("AI_TIMEOUT")), AI_LIMITS.chatTimeoutMs)
        ),
      ]);
    };

    try {
      if (modelPreference === "groq") {
        actualModelUsed = "GROQ";
        aiResponseText = await withTimeout(executeAgentLoop("groq"));
      } else if (modelPreference === "gemini") {
        actualModelUsed = "GEMINI";
        aiResponseText = await withTimeout(executeAgentLoop("gemini"));
      } else {
        // "auto" mode: Default to Gemini, gracefully fall back to Groq if Gemini fails
        actualModelUsed = "GEMINI";
        try {
          aiResponseText = await withTimeout(executeAgentLoop("gemini"));
        } catch (geminiError: any) {
          console.warn("[Chat Route] Gemini failed in auto mode. Falling back to Groq...", geminiError);
          actualModelUsed = "GROQ";
          aiResponseText = await withTimeout(executeAgentLoop("groq"));
        }
      }
    } catch (apiError: any) {
      console.error("API Error:", apiError);
      let friendlyError = "The AI service is temporarily unavailable. Please try again later.";

      if (apiError.name === "LLMProviderError") {
        const pErr = apiError as any;
        if (pErr.originalError?.status === 429 || pErr.originalError?.status === 503 || pErr.code === "rate_limit_exceeded") {
          friendlyError = "The AI is currently overloaded with requests. Please wait a moment and try again.";
        }
      } else if (apiError.message === "AI_TIMEOUT") {
        friendlyError = "The AI took too long to respond. Please try a simpler question or try again later.";
      }
      aiResponseText = friendlyError;
    }

    // ── Save AI response to DB ──────────────────────────────
    const aiMessage = await prisma.systemMessage.create({
      data: {
        userId,
        sessionId,
        content: aiResponseText,
        type: "INFO",
        read: false,
      },
    });

    // ── Record quota usage ───────────────────────────────────
    await recordUsage(userId, "chat");

    return NextResponse.json({ userMessage, aiMessage, sessionId, session: newSession, modelUsed: actualModelUsed }, { status: 200 });
  } catch (error: any) {
    console.error("Chat API Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
