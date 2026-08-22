import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import fs from "fs/promises";
import path from "path";
import { getToolsForAgent, AgentType, ALLOWED_HANDOFFS } from "@/lib/ai/chat-tools";
import { executeChatTool } from "@/lib/ai/chat-tool-executor";
import { LLMFactory } from "@/lib/ai/providers/factory";
import { NormalizedMessage } from "@/lib/ai/providers/types";
import { checkQuota, consumeQuota } from "@/lib/ai/usage-limiter";
import { AI_LIMITS, DEEPSEEK_MODELS, GEMINI_MODELS, GROQ_MODELS } from "@/lib/ai/config";

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

    // ── Quota enforcement (shared 10-prompt daily pool for General Chat + Focus Drawer) ──
    const quota = await checkQuota(userId, "chat");
    if (!quota.allowed) {
      return NextResponse.json(
        {
          error: "DAILY_QUOTA_EXHAUSTED",
          limit: quota.limit,
          used: quota.used,
          message: `Daily AI limit reached (${quota.used}/${quota.limit} prompts). Resets at midnight UTC.`,
          resetsAt: quota.resetsAt,
        },
        { status: 429 }
      );
    }

    let messageText = "";
    let file: File | null = null;
    let sessionIdStr: string | null = null;
    let modelPreference = "auto";
    let contextOverride: any = null;

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data") || contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await req.formData();
      messageText = (formData.get("message") as string) || "";
      file = formData.get("file") as File | null;
      sessionIdStr = formData.get("sessionId") as string | null;
      modelPreference = (formData.get("modelPreference") as string) || "auto";
      const overrideStr = formData.get("contextOverride") as string | null;
      if (overrideStr) {
        try {
          contextOverride = JSON.parse(overrideStr);
        } catch {}
      }
    } else {
      const body = await req.json().catch(() => ({}));
      messageText = body.message || "";
      sessionIdStr = body.sessionId ? String(body.sessionId) : null;
      modelPreference = body.modelPreference || "auto";
      contextOverride = body.contextOverride || null;
    }

    if (!messageText && !file) {
      return NextResponse.json({ error: "Empty message" }, { status: 400 });
    }

    let sessionId: number | null = null;
    let isNewSession = false;
    let newSession = null;
    if (sessionIdStr) {
      sessionId = parseInt(sessionIdStr);
      if (isNaN(sessionId)) {
        return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
      }

      // ── IDOR guard: the session MUST belong to the authenticated user ──
      const sessionRecord = await prisma.chatSession.findUnique({
        where: { id: sessionId },
        select: { userId: true },
      });
      if (!sessionRecord || sessionRecord.userId !== userId) {
        return NextResponse.json({ error: "Unauthorized session access" }, { status: 403 });
      }
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

    // ── Context window: the 20 MOST RECENT messages (desc + reverse),
    //    scoped to this user AND session. The previously saved user message
    //    is excluded because it is appended again as currentUserMsg below.
    const rawHistory = await prisma.systemMessage.findMany({
      where: { sessionId, userId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, type: true, content: true, createdAt: true },
    });
    const conversationHistory = rawHistory.reverse();

    // ── Build normalized history for adapter ──────────────
    const normalizedHistory: NormalizedMessage[] = conversationHistory
      .filter((m) => m.id !== userMessage.id) 
      .map((m) => ({
        role: m.type === "USER" ? "user" : "assistant",
        content: m.content,
      }));

    // ── Build tiered AI context and route to specialist agent & workload ──
    const { buildCoreContext, buildRelevantContext, formatCoreContext, formatRelevantContext } = await import("@/lib/ai/context-engine");
    const core = await buildCoreContext(userId);
    const coreString = formatCoreContext(core);

    const { classifyWorkload } = await import("@/lib/ai/agent-router");
    const routerCtx = {
      user: { hp: core.user.hp, maxHp: core.user.maxHp },
      today: { overdueCount: core.today.overdueCount },
    };

    const hasMedia = !!(base64Data && mimeType);
    const workloadResult = classifyWorkload(messageText || "", routerCtx, {
      hasMedia,
      isFocusMode: !!contextOverride,
    });

    const currentAgent = workloadResult.agent;
    const relevant = await buildRelevantContext(userId, currentAgent, [], messageText);
    const relevantString = formatRelevantContext(relevant);

    const { buildSystemInstruction, buildVerbosityDirective } = await import("@/lib/ai/prompts");
    // Router → verbosity escalation: reasoner-routed queries get Tier 3,
    // focus sessions get flow-protecting Tier 1 guidance.
    const verbosityDirective = buildVerbosityDirective(workloadResult.workload);
    const systemInstruction = buildSystemInstruction(
      currentAgent,
      coreString,
      core.localTimeContext.localDate,
      relevantString
    ) + `\n\n${verbosityDirective}`;
    console.log(
      `[Agent Router] → Workload: ${workloadResult.workload} | Agent: ${workloadResult.agent} | Primary: ${workloadResult.route.primary.provider}/${workloadResult.route.primary.model}`
    );

    // ── Build the user's current message ──────────────
    const currentUserMsg: NormalizedMessage = {
      role: "user",
      content: messageText || "Please analyze this attachment.",
      parts: (base64Data && mimeType) ? [{ inlineData: { mimeType, data: base64Data } }] : undefined
    };
    normalizedHistory.push(currentUserMsg);

    // ── Function-calling loop via LLMFactory with Multi-Engine Fallback ──────────────
    let aiResponseText = "";
    let actualModelUsed = "DEEPSEEK";
    let actualModelDisplayName = "DeepSeek v4 Flash";

    const executeAgentLoop = async (
      provider: "deepseek" | "gemini" | "groq",
      modelOverride?: string,
      signal?: AbortSignal
    ): Promise<string> => {
      const adapter = LLMFactory.getAdapter(provider, modelOverride);
      let activeAgent = currentAgent as AgentType;
      let tools = getToolsForAgent(activeAgent);
      let activeSystemInstruction = buildSystemInstruction(
        activeAgent,
        coreString,
        core.localTimeContext.localDate,
        relevantString
      ) + `\n\n${verbosityDirective}`;

      if (contextOverride?.instruction) {
        activeSystemInstruction += `\n\n### IN-SESSION ACADEMIC STUDY TUTOR DIRECTIVE\n${contextOverride.instruction}\nActive Subject: ${contextOverride.subject || "General Focus"}\nActive Quest: ${contextOverride.quest || "Focus Session"}\nAlways format mathematical expressions with KaTeX LaTeX ($inline$ and $$display$$). Provide direct, clear, scholarly, and encouraging step-by-step guidance.`;
      }

      // Deep copy history for this execution attempt so retries start with fresh history
      const runHistory: NormalizedMessage[] = JSON.parse(JSON.stringify(normalizedHistory));

      let iterations = 0;
      let handoffs = 0;
      let response = await adapter.generateResponse(runHistory, activeSystemInstruction, tools, { signal });

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
            const allowedTargets = ALLOWED_HANDOFFS[activeAgent] || [];

            if (!allowedTargets.includes(targetAgent)) {
              result = { error: `Unauthorized handoff. You cannot handoff to ${targetAgent}.` };
            } else if (handoffs >= 1) { // MAX_HANDOFFS = 1
              result = { error: "Handoff failed. Maximum number of handoffs reached for this request." };
            } else {
              handoffs++;
              activeAgent = targetAgent;
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
          const newRelevant = await buildRelevantContext(userId, activeAgent, [], messageText);
          const newRelevantString = formatRelevantContext(newRelevant);
          activeSystemInstruction = buildSystemInstruction(activeAgent, coreString, core.localTimeContext.localDate, newRelevantString) + `\n\n${verbosityDirective}`;
          tools = getToolsForAgent(activeAgent);
        }

        response = await adapter.generateResponse(runHistory, activeSystemInstruction, tools, { signal });
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

    // ── Unified abort chain: client disconnect OR hard timeout aborts the
    //    upstream LLM request immediately (no orphaned generations). ──
    const abortController = new AbortController();
    const onClientAbort = () => abortController.abort();
    if (req.signal) {
      req.signal.addEventListener("abort", onClientAbort);
      if (req.signal.aborted) abortController.abort();
    }
    const timeoutId = setTimeout(() => abortController.abort(), AI_LIMITS.chatTimeoutMs);
    let generationSucceeded = false;

    const primarySpec = workloadResult.route.primary;
    const fallbackSpec = workloadResult.route.fallback;
    const secondarySpec = workloadResult.route.secondaryFallback;

    try {
      if (modelPreference === "groq") {
        actualModelUsed = "GROQ";
        actualModelDisplayName = "Groq (Llama 3.3 70B)";
        aiResponseText = await executeAgentLoop("groq", GROQ_MODELS.default, abortController.signal);
      } else if (modelPreference === "gemini") {
        actualModelUsed = "GEMINI";
        actualModelDisplayName = "Gemini 3.7 Flash";
        aiResponseText = await executeAgentLoop("gemini", GEMINI_MODELS.default, abortController.signal);
      } else if (modelPreference === "deepseek") {
        actualModelUsed = "DEEPSEEK";
        actualModelDisplayName = `DeepSeek (${primarySpec.model})`;
        aiResponseText = await executeAgentLoop("deepseek", primarySpec.model, abortController.signal);
      } else {
        // Multi-Engine Auto Mode with Cascade Fallbacks
        actualModelUsed = primarySpec.provider.toUpperCase();
        actualModelDisplayName = `${primarySpec.provider.toUpperCase()} (${primarySpec.model})`;

        try {
          aiResponseText = await executeAgentLoop(primarySpec.provider, primarySpec.model, abortController.signal);
        } catch (primaryErr: any) {
          console.warn(
            `[Chat Route] Primary model ${primarySpec.provider}/${primarySpec.model} failed. Trying fallback ${fallbackSpec.provider}/${fallbackSpec.model}:`,
            primaryErr.message
          );
          actualModelUsed = fallbackSpec.provider.toUpperCase();
          actualModelDisplayName = `${fallbackSpec.provider.toUpperCase()} (${fallbackSpec.model})`;

          try {
            aiResponseText = await executeAgentLoop(fallbackSpec.provider, fallbackSpec.model, abortController.signal);
          } catch (fallbackErr: any) {
            if (secondarySpec) {
              console.warn(
                `[Chat Route] Fallback model ${fallbackSpec.provider}/${fallbackSpec.model} failed. Trying secondary fallback ${secondarySpec.provider}/${secondarySpec.model}:`,
                fallbackErr.message
              );
              actualModelUsed = secondarySpec.provider.toUpperCase();
              actualModelDisplayName = `${secondarySpec.provider.toUpperCase()} (${secondarySpec.model})`;
              aiResponseText = await executeAgentLoop(secondarySpec.provider, secondarySpec.model, abortController.signal);
            } else {
              throw fallbackErr;
            }
          }
        }
      }

      generationSucceeded = true;
    } catch (apiError: any) {
      console.error("API Error:", apiError);
      let friendlyError = "The AI service is temporarily unavailable. Please try again later.";

      if (apiError.name === "LLMProviderError") {
        const pErr = apiError as any;
        if (pErr.originalError?.status === 429 || pErr.originalError?.status === 503 || pErr.code === "rate_limit_exceeded") {
          friendlyError = "The AI is currently overloaded with requests. Please wait a moment and try again.";
        }
      } else if (apiError.name === "AbortError" || abortController.signal.aborted) {
        friendlyError = req.signal?.aborted
          ? "The request was cancelled."
          : "The AI took too long to respond. Please try a simpler question or try again later.";
      }
      aiResponseText = friendlyError;
    } finally {
      clearTimeout(timeoutId);
      if (req.signal) req.signal.removeEventListener("abort", onClientAbort);
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

    // ── Quota consumption: charged ONLY on successful generation.
    //    Model errors, timeouts and client aborts never consume quota;
    //    the atomic guarded upsert prevents parallel-request bypass. ──
    if (generationSucceeded) {
      const consumed = await consumeQuota(userId, "chat");
      if (!consumed.allowed) {
        console.warn(`[Chat Route] Quota race: generation succeeded but consumeQuota was not charged for user ${userId}`);
      }
    }

    return NextResponse.json({ 
      userMessage, 
      aiMessage: { ...aiMessage, modelUsed: actualModelDisplayName }, 
      reply: aiResponseText,
      message: aiResponseText,
      sessionId, 
      session: newSession, 
      modelUsed: actualModelUsed,
      modelDisplayName: actualModelDisplayName,
    }, { status: 200 });
  } catch (error: any) {
    console.error("Chat API Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
