import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";
import fs from "fs/promises";
import path from "path";
import { getToolsForAgent, getSimpleToolsForAgent, AgentType, ALLOWED_HANDOFFS } from "@/lib/ai/chat-tools";
import { executeChatTool } from "@/lib/ai/chat-tool-executor";
import { LLMFactory } from "@/lib/ai/providers/factory";
import { NormalizedMessage, LLMUsage } from "@/lib/ai/providers/types";
import { reserveQuota, releaseQuota } from "@/lib/ai/usage-limiter";
import { validateUpload } from "@/lib/upload-security";
import { AI_LIMITS, DEEPSEEK_MODELS, GEMINI_MODELS, GROQ_MODELS } from "@/lib/ai/config";
import { resolveCheapAnswer } from "@/lib/ai/cheap-answers";
import { logAiUsage } from "@/lib/ai/usage-logger";

const MAX_TOOL_ITERATIONS = AI_LIMITS.maxToolIterations;

// ── Per-session memory of the last cheap answer, so conversational
//    follow-ups ("what about yesterday?", "and my xp?") can resolve
//    deterministically too. In-memory with TTL — a miss just means the
//    follow-up falls through to the LLM. ──
const cheapContextMemory = new Map<
  string,
  { intentId: string; params: any; at: number }
>();
const CHEAP_CONTEXT_TTL_MS = 10 * 60 * 1000;
const CHEAP_CONTEXT_MAX = 500;

function cheapContextKey(userId: number, sessionIdStr: string | null): string {
  return `${userId}:${sessionIdStr ?? "new"}`;
}

function rememberCheapContext(
  userId: number,
  sessionIdStr: string | null,
  intentId: string,
  params: any
) {
  const entry = { intentId, params, at: Date.now() };
  cheapContextMemory.set(cheapContextKey(userId, sessionIdStr), entry);
  if (cheapContextMemory.size > CHEAP_CONTEXT_MAX) {
    const oldest = [...cheapContextMemory.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) cheapContextMemory.delete(oldest[0]);
  }
}

function recallCheapContext(userId: number, sessionIdStr: string | null) {
  const key = cheapContextKey(userId, sessionIdStr);
  const entry = cheapContextMemory.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > CHEAP_CONTEXT_TTL_MS) {
    cheapContextMemory.delete(key);
    return null;
  }
  return entry;
}

/** Strip any legacy `<!-- model: X -->` marker so it never reaches the model. */
function stripModelMarkers(text: string): string {
  return (text || "").replace(/\s*<!--\s*model:[^>]*-->\s*/gi, "").trim();
}

class RouteError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * Resolve (or create) the chat session for a request, with the same
 * IDOR guard used everywhere: the session must belong to this user.
 */
async function resolveChatSession(
  sessionIdStr: string | null,
  userId: number,
  fallbackTitle: string
): Promise<{ sessionId: number; newSession: any }> {
  if (sessionIdStr) {
    const sessionId = parseInt(sessionIdStr);
    if (isNaN(sessionId)) throw new RouteError("Invalid session id", 400);

    const sessionRecord = await prisma.chatSession.findUnique({
      where: { id: sessionId },
      select: { userId: true },
    });
    if (!sessionRecord || sessionRecord.userId !== userId) {
      throw new RouteError("Unauthorized session access", 403);
    }
    return { sessionId, newSession: null };
  }

  const newSession = await prisma.chatSession.create({
    data: { userId, title: fallbackTitle },
  });
  return { sessionId: newSession.id, newSession };
}

export async function POST(req: NextRequest) {
  let sessionUserId: number | null = null;
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.userId;
    sessionUserId = userId;

    // ── Parse the request body (before quota so deterministic replies
    //    can be served without touching the LLM quota pool) ──
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

    // S4: bounded prompt input — prevents multi-MB messages being injected
    // into LLM prompts (cost amplification).
    if (typeof messageText === "string" && messageText.length > 4000) {
      return NextResponse.json(
        { error: "Message is too long (max 4000 characters)." },
        { status: 400 }
      );
    }

    if (!messageText && !file) {
      return NextResponse.json({ error: "Empty message" }, { status: 400 });
    }

    // ── Cheap-Answer Engine: easy low-reasoning questions from every genre
    //    are answered deterministically (math, units, dates, app stats…)
    //    before the LLM — no tokens, no quota, saved to the session. ──
    if (!file && messageText && !contextOverride && modelPreference === "auto") {
      const cheapContext = recallCheapContext(userId, sessionIdStr);
      const cheap = await resolveCheapAnswer(userId, messageText, cheapContext);
      if (cheap) {
        try {
          const fallbackTitle =
            messageText.length > 30 ? messageText.slice(0, 30) + "..." : messageText;
          const { sessionId: detSessionId, newSession: detNewSession } =
            await resolveChatSession(sessionIdStr, userId, fallbackTitle);

          const detUserMessage = await prisma.systemMessage.create({
            data: {
              userId,
              sessionId: detSessionId,
              content: messageText,
              type: "USER",
              read: true,
            },
          });
          const detAiMessage = await prisma.systemMessage.create({
            data: {
              userId,
              sessionId: detSessionId,
              content: cheap.content,
              type: "INFO",
              read: false,
              modelUsed: "Deterministic (no LLM)",
            },
          });

          console.log(
            `[CheapAnswer] "${messageText.slice(0, 40)}" → ${cheap.intentId} conf=${cheap.confidence} scope=${cheap.params?.timeScope ?? "-"} (no LLM, no quota)`
          );
          rememberCheapContext(userId, sessionIdStr, cheap.intentId, cheap.params);
          rememberCheapContext(userId, String(detSessionId), cheap.intentId, cheap.params);
          return NextResponse.json(
            {
              userMessage: detUserMessage,
              aiMessage: { ...detAiMessage, modelUsed: "Deterministic" },
              reply: cheap.content,
              message: cheap.content,
              sessionId: detSessionId,
              session: detNewSession,
              modelUsed: "DETERMINISTIC",
              modelDisplayName: "Deterministic (no LLM)",
              deterministic: true,
            },
            { status: 200 }
          );
        } catch (e: any) {
          if (e instanceof RouteError) {
            return NextResponse.json({ error: e.message }, { status: e.status });
          }
          console.error("[CheapAnswer] failed — falling through to AI:", e);
        }
      }
    }

    // ── Quota enforcement (shared 10-prompt daily pool for General Chat + Focus Drawer) ──
    // S4: RESERVE the unit atomically BEFORE any LLM call; release on failure.
    // A configured owner account is entitled to unlimited chat: the reservation
    // is bypassed (charged === false) and `unlimited` carries the permission.
    const quota = await reserveQuota(userId, "chat");
    let quotaReserved = quota.charged;
    if (!quota.charged && !quota.unlimited) {
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

    let sessionId: number | null = null;
    let newSession = null;
    {
      const fallbackTitle = messageText
        ? (messageText.length > 30 ? messageText.slice(0, 30) + "..." : messageText)
        : "Attachment Analysis";
      const resolved = await resolveChatSession(sessionIdStr, userId, fallbackTitle);
      sessionId = resolved.sessionId;
      newSession = resolved.newSession;
    }

    // ── Handle file upload ──────────────────────────────────
    let attachmentUrl: string | null = null;
    let base64Data: string | null = null;
    let mimeType: string | null = null;

    if (file && file.size > 0) {
      const buffer = Buffer.from(await file.arrayBuffer());
      // S4: size cap + magic-byte content sniffing + generated storage name.
      // The client filename is never used as a path component.
      const validation = validateUpload(file, buffer);
      if (!validation.ok) {
        if (quotaReserved) await releaseQuota(userId, "chat").catch(() => {});
        return NextResponse.json({ error: validation.error }, { status: validation.status });
      }
      base64Data = buffer.toString("base64");
      mimeType = validation.mime;
      // Best-effort persistence (read-only filesystems simply skip the write —
      // the attachment is still analyzed in this request, just not archived).
      try {
        const uploadDir = path.join(process.cwd(), "public/uploads");
        await fs.mkdir(uploadDir, { recursive: true });
        await fs.writeFile(path.join(uploadDir, validation.filename), buffer);
        attachmentUrl = `/uploads/${validation.filename}`;
      } catch (err) {
        console.warn("[chat] attachment persistence skipped:", (err as any)?.message ?? err);
        attachmentUrl = null;
      }
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

    // ── Build normalized history for adapter (legacy model markers stripped) ──
    const normalizedHistory: NormalizedMessage[] = conversationHistory
      .filter((m) => m.id !== userMessage.id)
      .map((m) => ({
        role: m.type === "USER" ? "user" : "assistant",
        content: stripModelMarkers(m.content),
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
    // Simple-tier requests skip the heavyweight dynamic context entirely:
    // core context only, the model pulls anything else via tools.
    const isSimpleWorkload = workloadResult.workload === "simple";
    const relevant = isSimpleWorkload
      ? {}
      : await buildRelevantContext(userId, currentAgent, [], messageText);
    const relevantString = formatRelevantContext(relevant);

    const { buildSystemInstruction, buildVerbosityDirective, buildSimpleSystemInstruction } = await import("@/lib/ai/prompts");
    // Router → verbosity escalation: reasoner-routed queries get Tier 3,
    // focus sessions get flow-protecting Tier 1 guidance. The simple tier
    // gets a ~250-token condensed instruction instead of the full persona.
    const verbosityDirective = buildVerbosityDirective(workloadResult.workload);
    const buildActiveInstruction = isSimpleWorkload
      ? (agent: AgentType, core: string, date: string) =>
          buildSimpleSystemInstruction(agent, core, date)
      : (agent: AgentType, core: string, date: string) =>
          buildSystemInstruction(agent, core, date, relevantString) + `\n\n${verbosityDirective}`;
    const systemInstruction = buildActiveInstruction(
      currentAgent,
      coreString,
      core.localTimeContext.localDate
    );
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

    // Simple actions don't need the full conversation window — the last 6
    // turns of fresh context are plenty and keep input tokens minimal.
    const historyForRun = isSimpleWorkload ? normalizedHistory.slice(-6) : normalizedHistory;

    // ── Function-calling loop via LLMFactory with Multi-Engine Fallback ──────────────
    let aiResponseText = "";
    let actualModelUsed = "DEEPSEEK";
    let actualModelDisplayName = "DeepSeek v4 Flash";
    let actualModelId: string = DEEPSEEK_MODELS.chat;
    let totalUsage: LLMUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    // Per-workload generation budget: hard output cap + optional DeepSeek
    // thinking toggle (disabled tiers skip reasoning-token spend).
    const genOptions = {
      maxTokens: workloadResult.route.outputTokenCap,
      thinking: workloadResult.route.thinking,
    };

    const executeAgentLoop = async (
      provider: "deepseek" | "gemini" | "groq",
      modelOverride?: string,
      signal?: AbortSignal
    ): Promise<{ text: string; usage: LLMUsage }> => {
      const adapter = LLMFactory.getAdapter(provider, modelOverride);
      let activeAgent = currentAgent as AgentType;
      let tools = isSimpleWorkload
        ? getSimpleToolsForAgent(activeAgent)
        : getToolsForAgent(activeAgent);
      let activeSystemInstruction = buildActiveInstruction(
        activeAgent,
        coreString,
        core.localTimeContext.localDate
      );

      if (contextOverride?.instruction) {
        activeSystemInstruction += `\n\n### IN-SESSION ACADEMIC STUDY TUTOR DIRECTIVE\n${contextOverride.instruction}\nActive Subject: ${contextOverride.subject || "General Focus"}\nActive Quest: ${contextOverride.quest || "Focus Session"}\nAlways format mathematical expressions with KaTeX LaTeX ($inline$ and $$display$$). Be direct and concise: answer first, step-by-step only when needed.`;
      }

      // Deep copy history for this execution attempt so retries start with fresh history
      const runHistory: NormalizedMessage[] = JSON.parse(JSON.stringify(historyForRun));

      const usage: LLMUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0, cacheHitTokens: 0 };
      const addUsage = (u?: LLMUsage) => {
        if (!u) return;
        usage.promptTokens += u.promptTokens || 0;
        usage.completionTokens += u.completionTokens || 0;
        usage.totalTokens += u.totalTokens || 0;
        usage.cacheHitTokens = (usage.cacheHitTokens || 0) + (u.cacheHitTokens || 0);
      };

      let iterations = 0;
      let handoffs = 0;
      let response = await adapter.generateResponse(runHistory, activeSystemInstruction, tools, {
        ...genOptions,
        signal,
      });
      addUsage(response.usage);

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

        response = await adapter.generateResponse(runHistory, activeSystemInstruction, tools, {
          ...genOptions,
          signal,
        });
        addUsage(response.usage);
      }

      // Tool-loop exhausted or the model stopped without text (e.g. it kept
      // calling tools until the iteration cap): force ONE final text-only
      // generation with tools disabled so the user always gets a real reply
      // instead of "Failed to complete task."
      if (!response.text && iterations > 0) {
        try {
          const forced = await adapter.generateResponse(
            runHistory,
            activeSystemInstruction,
            [],
            { ...genOptions, signal }
          );
          addUsage(forced.usage);
          response = forced;
        } catch (forcedErr: any) {
          console.warn(
            `[${provider.toUpperCase()}] Forced final response failed:`,
            forcedErr?.message
          );
        }
      }

      return {
        text:
          response.text ||
          (iterations >= MAX_TOOL_ITERATIONS
            ? "Failed to complete task."
            : iterations > 0
            ? "Action completed successfully!"
            : "I couldn't process that request. Could you try again?"),
        usage,
      };
    };

    const primarySpec = workloadResult.route.primary;
    const fallbackSpec = workloadResult.route.fallback;
    const secondarySpec = workloadResult.route.secondaryFallback;

    // Vision prompts must always run on a vision-capable model — even when
    // the user has an explicit provider preference, the per-provider VISION
    // tier is used instead of that provider's default text model.
    const isVisionWorkload = workloadResult.workload === "multimodal_vision";

    // ── Per-attempt abort chain: client disconnect aborts the in-flight
    //    upstream request immediately, and EACH cascade attempt (primary →
    //    fallback → secondary) gets its OWN fresh controller + timeout budget.
    //    Reusing one controller meant a timed-out primary aborted the fallback
    //    instantly, so the cascade could never actually run. ──
    let generationSucceeded = false;
    // Mutable ref object so TS doesn't narrow the nullable fields to `never`
    // across the closure boundaries below.
    const attemptRef: {
      controller: AbortController | null;
      timeout: ReturnType<typeof setTimeout> | null;
    } = { controller: null, timeout: null };
    const onClientAbort = () => attemptRef.controller?.abort();

    const executeAttempt = async (
      provider: "deepseek" | "gemini" | "groq",
      model: string
    ) => {
      attemptRef.controller = new AbortController();
      // Vision attempts get a tighter per-attempt budget so the DeepSeek
      // fallback engages quickly when Gemini stalls instead of waiting the
      // full 90s chat budget.
      const attemptBudget = isVisionWorkload ? 45_000 : AI_LIMITS.chatTimeoutMs;
      attemptRef.timeout = setTimeout(
        () => attemptRef.controller?.abort(),
        attemptBudget
      );
      try {
        return await executeAgentLoop(provider, model, attemptRef.controller.signal);
      } finally {
        if (attemptRef.timeout) clearTimeout(attemptRef.timeout);
        attemptRef.timeout = null;
      }
    };

    if (req.signal) {
      req.signal.addEventListener("abort", onClientAbort);
      if (req.signal.aborted) attemptRef.controller?.abort();
    }

    // Groq has no vision-capable model on the current plans (its former
    // llama-3.2-11b-vision-preview is decommissioned; the /models endpoint
    // returns only text models). When the user prefers Groq but the request
    // carries an image, Groq cannot fulfil it — defer to the proper vision
    // cascade (Gemini primary → DeepSeek vision fallback) instead of calling a
    // dead model that always errors "temporarily unavailable".
    if (isVisionWorkload && modelPreference === "groq") {
      modelPreference = "auto";
    }

    try {
      if (modelPreference === "groq") {
        const groqModel = isVisionWorkload ? GROQ_MODELS.vision : GROQ_MODELS.default;
        actualModelUsed = "GROQ";
        actualModelDisplayName = `Groq (${groqModel})`;
        actualModelId = groqModel;
        const loopResult = await executeAttempt("groq", groqModel);
        aiResponseText = loopResult.text;
        totalUsage = loopResult.usage;
      } else if (modelPreference === "gemini") {
        const geminiModel = isVisionWorkload ? GEMINI_MODELS.vision : GEMINI_MODELS.default;
        actualModelUsed = "GEMINI";
        actualModelDisplayName = `Gemini (${geminiModel})`;
        actualModelId = geminiModel;
        try {
          const loopResult = await executeAttempt("gemini", geminiModel);
          aiResponseText = loopResult.text;
          totalUsage = loopResult.usage;
        } catch (geminiErr: any) {
          // Gemini can stall on image workloads (SDK call hangs). Prefer the
          // dedicated DeepSeek vision tier over surfacing "temporarily
          // unavailable" when a working fallback exists.
          if (!isVisionWorkload) throw geminiErr;
          console.warn(
            `[Chat Route] Gemini vision model failed (${geminiErr.message || geminiErr}). Falling back to ${DEEPSEEK_MODELS.vision}.`
          );
          const fallbackModel = DEEPSEEK_MODELS.vision;
          actualModelUsed = "DEEPSEEK";
          actualModelDisplayName = `DeepSeek (${fallbackModel})`;
          actualModelId = fallbackModel;
          const loopResult = await executeAttempt("deepseek", fallbackModel);
          aiResponseText = loopResult.text;
          totalUsage = loopResult.usage;
        }
      } else if (modelPreference === "deepseek") {
        const deepseekModel = isVisionWorkload ? DEEPSEEK_MODELS.vision : primarySpec.model;
        actualModelUsed = "DEEPSEEK";
        actualModelDisplayName = `DeepSeek (${deepseekModel})`;
        actualModelId = deepseekModel;
        const loopResult = await executeAttempt("deepseek", deepseekModel);
        aiResponseText = loopResult.text;
        totalUsage = loopResult.usage;
      } else {
        // Multi-Engine Auto Mode with Cascade Fallbacks
        actualModelUsed = primarySpec.provider.toUpperCase();
        actualModelDisplayName = `${primarySpec.provider.toUpperCase()} (${primarySpec.model})`;
        actualModelId = primarySpec.model;

        try {
          const loopResult = await executeAttempt(primarySpec.provider, primarySpec.model);
          aiResponseText = loopResult.text;
          totalUsage = loopResult.usage;
        } catch (primaryErr: any) {
          console.warn(
            `[Chat Route] Primary model ${primarySpec.provider}/${primarySpec.model} failed. Trying fallback ${fallbackSpec.provider}/${fallbackSpec.model}:`,
            primaryErr.message
          );
          actualModelUsed = fallbackSpec.provider.toUpperCase();
          actualModelDisplayName = `${fallbackSpec.provider.toUpperCase()} (${fallbackSpec.model})`;
          actualModelId = fallbackSpec.model;

          try {
            const loopResult = await executeAttempt(fallbackSpec.provider, fallbackSpec.model);
            aiResponseText = loopResult.text;
            totalUsage = loopResult.usage;
          } catch (fallbackErr: any) {
            if (secondarySpec) {
              console.warn(
                `[Chat Route] Fallback model ${fallbackSpec.provider}/${fallbackSpec.model} failed. Trying secondary fallback ${secondarySpec.provider}/${secondarySpec.model}:`,
                fallbackErr.message
              );
              actualModelUsed = secondarySpec.provider.toUpperCase();
              actualModelDisplayName = `${secondarySpec.provider.toUpperCase()} (${secondarySpec.model})`;
              actualModelId = secondarySpec.model;
              const loopResult = await executeAttempt(secondarySpec.provider, secondarySpec.model);
              aiResponseText = loopResult.text;
              totalUsage = loopResult.usage;
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
      } else if (apiError.name === "AbortError" || attemptRef.controller?.signal.aborted) {
        friendlyError = req.signal?.aborted
          ? "The request was cancelled."
          : "The AI took too long to respond. Please try a simpler question or try again later.";
      }
      aiResponseText = friendlyError;
    } finally {
      if (attemptRef.timeout) clearTimeout(attemptRef.timeout);
      if (req.signal) req.signal.removeEventListener("abort", onClientAbort);
    }

    if (quotaReserved && !generationSucceeded) {
      await releaseQuota(userId, "chat");
    }

    // ── Save AI response to DB ──────────────────────────────
    const aiMessage = await prisma.systemMessage.create({
      data: {
        userId,
        sessionId,
        content: aiResponseText,
        type: "INFO",
        read: false,
        modelUsed: actualModelDisplayName,
      },
    });

    // ── S4 reservation lifecycle: reserved BEFORE generation, refunded on
    //    failure/timeout/abort. Successful generations keep the charge. ──
    if (generationSucceeded) {
      // Request-level cost telemetry (best-effort — never blocks the reply).
      await logAiUsage({
        userId,
        feature: "chat",
        workload: workloadResult.workload,
        provider: actualModelUsed,
        model: actualModelId,
        promptTokens: totalUsage.promptTokens,
        completionTokens: totalUsage.completionTokens,
        cacheHitTokens: totalUsage.cacheHitTokens || 0,
      });
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
    // S4: refund any outstanding reservation when the request fails outside
    // the generation pipeline (the guarded decrement is safe to call once).
    try {
      if (sessionUserId !== null) await releaseQuota(sessionUserId, "chat");
    } catch {}
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
