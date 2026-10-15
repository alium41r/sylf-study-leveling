import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";
import fs from "fs/promises";
import path from "path";
import { executeChatTool } from "@/lib/ai/chat-tool-executor";
import { LLMFactory } from "@/lib/ai/providers/factory";
import { LLMProviderError, NormalizedMessage, LLMUsage } from "@/lib/ai/providers/types";
import { reserveQuota, releaseQuota } from "@/lib/ai/usage-limiter";
import { validateUpload } from "@/lib/upload-security";
import { AI_LIMITS, DEEPSEEK_MODELS, GEMINI_MODELS, GROQ_MODELS } from "@/lib/ai/config";
import { resolveCheapAnswer } from "@/lib/ai/cheap-answers";
import { logAiUsage } from "@/lib/ai/usage-logger";
import { TimezoneService } from "@/lib/timezone-service";
import { getUserTimezone } from "@/lib/timezone-server";
import { buildSystemInstruction, buildVerbosityDirective } from "@/lib/ai/prompts";
import { normalizeSylviePage, formatSylviePage, boundSylvieHistory, selectSylvieTools } from "@/lib/ai/sylvie/turn-context";
import { retrieveSylvieKnowledge, formatSylvieKnowledge } from "@/lib/ai/sylvie/knowledge";
import { isPlanningRequest, preparePlannerHandoff } from "@/lib/ai/sylvie/planner-bridge";
import { MUTATION_TOOLS, stageSylvieAction, readSylvieAction, attachSylvieAction, parseSylvieAction, type SylvieOperation } from "@/lib/ai/sylvie/action-server";
import { stripSylvieAction } from "@/lib/ai/sylvie/action";
import { shortSylfIntroduction } from "@/lib/ai/sylvie/quick-replies";
import { attachPlannerHandoff } from "@/lib/ai/sylvie/planner-message";
import { signConfirmationToken } from "@/lib/ai/tool-confirmation";

import type { ChatSession } from "@prisma/client";
import type { IntentParams } from "@/lib/ai/intents/registry";

const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);

const MAX_TOOL_ITERATIONS = AI_LIMITS.maxToolIterations;

// ── Per-session memory of the last cheap answer, so conversational
//    follow-ups ("what about yesterday?", "and my xp?") can resolve
//    deterministically too. In-memory with TTL — a miss just means the
//    follow-up falls through to the LLM. ──
const cheapContextMemory = new Map<
  string,
  { intentId: string; params: IntentParams; at: number }
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
  params: IntentParams
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
  return stripSylvieAction(text || "").replace(/\s*<!--\s*model:[^>]*-->\s*/gi, "").trim();
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
): Promise<{ sessionId: number; newSession: ChatSession | null }> {
  if (sessionIdStr) {
    const sessionId = Number(sessionIdStr);
    if (!Number.isSafeInteger(sessionId) || sessionId <= 0) throw new RouteError("Invalid session id", 400);

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
  let quotaReserved = false;
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
    let contextOverride: Record<string, unknown> | null = null;
    let pageInput: unknown;
    let confirmationToken: unknown;

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data") || contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await req.formData();
      messageText = (formData.get("message") as string) || "";
      file = formData.get("file") as File | null;
      sessionIdStr = formData.get("sessionId") as string | null;
      modelPreference = (formData.get("modelPreference") as string) || "auto";
      confirmationToken = formData.get("confirmationToken");
      const pageStr = formData.get("pageContext");
      if (typeof pageStr === "string" && pageStr.length <= 500) {
        try { pageInput = JSON.parse(pageStr); } catch {}
      }
      const overrideStr = formData.get("contextOverride") as string | null;
      if (overrideStr) {
        try {
          const value: unknown = JSON.parse(overrideStr);
          if (value && typeof value === "object" && !Array.isArray(value)) contextOverride = value as Record<string, unknown>;
        } catch {}
      }
    } else {
      const body = await req.json().catch(() => ({}));
      messageText = body.message || "";
      sessionIdStr = body.sessionId ? String(body.sessionId) : null;
      modelPreference = body.modelPreference || "auto";
      contextOverride = body.contextOverride && typeof body.contextOverride === "object" && !Array.isArray(body.contextOverride) ? body.contextOverride : null;
      pageInput = body.pageContext;
      confirmationToken = body.confirmationToken;
    }

    if (typeof messageText !== "string" || typeof modelPreference !== "string") {
      return NextResponse.json({ error: "Invalid message." }, { status: 400 });
    }
    // Legacy focus clients may supply a subject, never a trusted instruction.
    const page = normalizeSylviePage(pageInput ?? (contextOverride?.mode === "focus"
      ? { path: "/focus", subject: contextOverride.subject } : undefined));

    if (confirmationToken) {
      if (!sessionIdStr) throw new RouteError("A chat session is required to confirm a change.", 400);
      const resolved = await resolveChatSession(sessionIdStr, userId, "");
      const action = readSylvieAction(confirmationToken, userId, resolved.sessionId);
      if (!action) throw new RouteError("This confirmation is invalid or expired. Please request the change again.", 409);
      const proposal = await prisma.systemMessage.findFirst({
        where: { id: action.messageId, userId, sessionId: resolved.sessionId, type: "INFO" },
      });
      const pending = proposal && parseSylvieAction(proposal.content, userId, resolved.sessionId, proposal.id);
      if (!pending || pending.token !== confirmationToken) throw new RouteError("This change was already confirmed or is no longer available.", 409);
      // Claim the stored proposal once BEFORE executing; concurrent/retried clicks cannot replay it.
      const claimed = await prisma.systemMessage.updateMany({
        where: { id: proposal.id, userId, sessionId: resolved.sessionId, content: proposal.content },
        data: { content: stripSylvieAction(proposal.content) },
      });
      if (claimed.count !== 1) throw new RouteError("This change was already confirmed.", 409);
      const outcomes: string[] = [];
      for (const operation of action.operations) {
        const args = { ...operation.args };
        // Preserve the existing executor's bulk-deletion handshake behind the signed exact preview.
        let legacyAction: string | undefined;
        if (operation.name === "deleteAllTasks") legacyAction = "DELETE_ALL_TASKS";
        if (operation.name === "deleteGoal" && (args.deleteAll === true || (Array.isArray(args.searchTitles) && args.searchTitles.length > 1)))
          legacyAction = args.deleteAll === true ? "DELETE_ALL_GOALS" : "DELETE_GOALS_BATCH";
        if (operation.name === "deleteQuest" && (args.deleteAll === true || (Array.isArray(args.searchTitles) && args.searchTitles.length > 1)))
          legacyAction = args.deleteAll === true ? "DELETE_ALL_QUESTS" : "DELETE_QUESTS_BATCH";
        if (legacyAction) args.confirmationToken = signConfirmationToken(legacyAction, userId);
        let result;
        try { result = await executeChatTool(operation.name, args, userId); }
        catch { result = { error: "The change could not be completed. Please check the current data before trying again." }; }
        outcomes.push(result.error ? `Couldn’t apply ${operation.name}: ${String(result.error)}`
          : result.status === "REQUIRES_CONFIRMATION" ? String(result.message)
          : typeof result.message === "string" ? result.message
          : `Applied ${operation.name}.`);
        if (result.error || result.status === "REQUIRES_CONFIRMATION") {
          if (outcomes.length < action.operations.length) outcomes.push("The remaining changes were not attempted.");
          break;
        }
      }
      const userMessage = await prisma.systemMessage.create({ data: {
        userId, sessionId: resolved.sessionId, content: "Confirm change", type: "USER", read: true,
      } });
      const reply = outcomes.join("\n");
      const aiMessage = await prisma.systemMessage.create({ data: {
        userId, sessionId: resolved.sessionId, content: reply, type: "INFO", read: false, modelUsed: "Confirmed action (no LLM)",
      } });
      return NextResponse.json({ userMessage, aiMessage, reply, message: reply, sessionId: resolved.sessionId, modelUsed: "DETERMINISTIC", modelDisplayName: "Confirmed action (no LLM)" });
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
        } catch (e: unknown) {
          if (e instanceof RouteError) {
            return NextResponse.json({ error: e.message }, { status: e.status });
          }
          console.error("[CheapAnswer] failed — falling through to AI:", e);
        }
      }
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

    // ── Context window: the 20 MOST RECENT messages (desc + reverse),
    //    scoped to this user AND session, before saving the current message.
    const rawHistory = await prisma.systemMessage.findMany({
      where: { sessionId, userId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, type: true, content: true, createdAt: true },
    });
    const conversationHistory = rawHistory.reverse();

    // ── Build normalized history for adapter (legacy model markers stripped) ──
    const normalizedHistory: NormalizedMessage[] = conversationHistory
      .map((m) => ({
        role: m.type === "USER" ? "user" : "assistant",
        content: stripModelMarkers(m.content),
      }));

    // A tiny, stable answer for the explicit short-introduction regression.
    const introduction = !file ? shortSylfIntroduction(messageText) : null;
    if (introduction) {
      const reply = introduction;
      const userMessage = await prisma.systemMessage.create({ data: { userId, sessionId, content: messageText, type: "USER", read: true } });
      const aiMessage = await prisma.systemMessage.create({ data: { userId, sessionId, content: reply, type: "INFO", read: false, modelUsed: "Sylf overview (no LLM)" } });
      return NextResponse.json({ userMessage, aiMessage, reply, message: reply, sessionId, session: newSession, deterministic: true, modelUsed: "DETERMINISTIC", modelDisplayName: "Sylf overview (no LLM)" });
    }

    // Resolve planning before any general-chat model: the Planner owns its reasoning.
    const planning = !file && isPlanningRequest(messageText, normalizedHistory);
    if (planning) {
      const userMessage = await prisma.systemMessage.create({ data: {
        userId, sessionId, content: messageText, type: "USER", read: true,
      } });
      const preferences = /\b(?:saved|remember(?:ed)?)\b.{0,35}\b(?:preferences?|availability|study habits)\b|\b(?:preferences?|availability|study habits)\b.{0,35}\b(?:saved|remember)\b/i.test(messageText)
        ? await prisma.aiMemory.findMany({ where: { userId, source: "user_stated" }, select: { key: true, value: true, source: true }, orderBy: { updatedAt: "desc" }, take: 10 }).catch(() => [])
        : [];
      const plannerHandoff = preparePlannerHandoff({ message: messageText, history: normalizedHistory, preferences });
      const reply = plannerHandoff.kind === "REPLAN"
        ? "I’ve prepared your replanning request. Review it in Planner to choose the plan and confirm changes."
        : "I’ve prepared your request for Planner. Review it there to prepare a draft; nothing has been applied.";
      const aiMessage = await prisma.systemMessage.create({ data: {
        userId, sessionId, content: attachPlannerHandoff(`${reply}\n\n[Open Planner](/system?tab=planner)`, plannerHandoff),
        type: "INFO", read: false, modelUsed: "Planner handoff (no LLM)",
      } });
      return NextResponse.json({ userMessage, aiMessage: { ...aiMessage, content: stripSylvieAction(aiMessage.content), plannerHandoff }, plannerHandoff, reply, message: reply, sessionId, session: newSession, modelUsed: "DETERMINISTIC", modelDisplayName: "Planner handoff (no LLM)" });
    }

    // ── Quota enforcement (shared 10-prompt daily pool for General Chat + Focus Drawer) ──
    // S4: RESERVE the unit atomically BEFORE any LLM call; release on failure.
    // A configured owner account is entitled to unlimited chat: the reservation
    // is bypassed (charged === false) and `unlimited` carries the permission.
    const quota = await reserveQuota(userId, "chat");
    quotaReserved = quota.charged;
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
        console.warn("[chat] attachment persistence skipped:", errorMessage(err));
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

    // No profile/progression/memory queries by default. Only the local date is shared.
    const timezone = await getUserTimezone(userId);
    const localDate = TimezoneService.getUserLocalDate(timezone);
    const { classifyWorkload } = await import("@/lib/ai/agent-router");
    const workloadResult = classifyWorkload(messageText || "", undefined, {
      hasMedia: !!(base64Data && mimeType), isFocusMode: page?.path === "/focus",
    });
    const currentAgent = workloadResult.agent;
    const knowledge = retrieveSylvieKnowledge({ message: messageText, page, recentUserMessages: normalizedHistory.filter((turn) => turn.role === "user").map((turn) => turn.content ?? "") });
    const reference = [formatSylviePage(page), formatSylvieKnowledge(knowledge)].filter(Boolean).join("\n\n");
    const toolsForTurn = selectSylvieTools(currentAgent, messageText, normalizedHistory);
    const verbosityDirective = buildVerbosityDirective(workloadResult.workload, messageText);
    const systemInstruction = buildSystemInstruction(currentAgent, `Local timezone: ${timezone}`, localDate, reference) + `\n\n${verbosityDirective}`;
    const pendingOperations: SylvieOperation[] = [];
    // ── Build the user's current message ──────────────
    const currentUserMsg: NormalizedMessage = {
      role: "user",
      content: messageText || "Please analyze this attachment.",
      parts: (base64Data && mimeType) ? [{ inlineData: { mimeType, data: base64Data } }] : undefined
    };
    normalizedHistory.push(currentUserMsg);

    // Keep recent conversational continuity within a fixed character budget.
    const historyForRun = boundSylvieHistory(normalizedHistory);

    // ── Function-calling loop via LLMFactory with Multi-Engine Fallback ──────────────
    let aiResponseText = "";
    let actualModelUsed = "DEEPSEEK";
    let actualModelDisplayName = "DeepSeek v4 Flash";
    let actualModelId: string = DEEPSEEK_MODELS.chat;
    let totalUsage: LLMUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    // Per-workload generation budget: hard output cap + optional DeepSeek
    // thinking toggle (disabled tiers skip reasoning-token spend).
    const genOptions = {
      maxTokens: /\b(?:in detail|detailed|thorough|in depth|comprehensive|full explanation)\b/i.test(messageText)
        ? Math.max(workloadResult.route.outputTokenCap, 2048) : workloadResult.route.outputTokenCap,
      thinking: workloadResult.route.thinking,
    };

    const executeAgentLoop = async (
      provider: "deepseek" | "gemini" | "groq",
      modelOverride?: string,
      signal?: AbortSignal
    ): Promise<{ text: string; usage: LLMUsage }> => {
      const adapter = LLMFactory.getAdapter(provider, modelOverride);
      const tools = toolsForTurn;
      const activeSystemInstruction = systemInstruction;
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
      const readCache = new Map<string, unknown>();
      const allowedToolNames = new Set(tools.map((tool) => tool.name));
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

        for (const tc of response.toolCalls) {
          let result;
          if (!allowedToolNames.has(tc.name)) {
            result = { error: "This tool is not available for the current request." };
          } else if (MUTATION_TOOLS.has(tc.name)) {
            const args = { ...tc.args };
            delete args.confirmationToken; // A model can never authorize its own proposal.
            if (pendingOperations.length >= 8) result = { error: "Please request fewer changes at a time." };
            else {
              const operation = { name: tc.name, args };
              if (!pendingOperations.some((item) => JSON.stringify(item) === JSON.stringify(operation))) pendingOperations.push(operation);
              result = { status: "REQUIRES_CONFIRMATION", message: "Proposed only. The user must confirm the exact preview before any change is applied." };
            }
          } else {
            const key = `${tc.name}:${JSON.stringify(tc.args)}`;
            if (readCache.has(key)) result = readCache.get(key);
            else {
              try { result = await executeChatTool(tc.name, tc.args, userId); }
              catch { result = { error: "This information is temporarily unavailable." }; }
              readCache.set(key, result);
            }
          }
          toolResultsMsg.toolResults!.push({ toolCallId: tc.id, name: tc.name, result });
        }

        runHistory.push(toolResultsMsg);

        // A proposal ends this turn. It cannot be self-confirmed by another model call.
        if (pendingOperations.length > 0) return {
          text: "Review the proposed change below. Nothing has been changed yet.", usage,
        };

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
        } catch (forcedErr: unknown) {
          console.warn(
            `[${provider.toUpperCase()}] Forced final response failed:`,
            errorMessage(forcedErr)
          );
        }
      }

      return {
        text:
          response.text ||
          (iterations >= MAX_TOOL_ITERATIONS
            ? "Failed to complete task."
            : iterations > 0
            ? "I couldn’t finish this request. No changes were applied."
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
        } catch (geminiErr: unknown) {
          // Gemini can stall on image workloads (SDK call hangs). Prefer the
          // dedicated DeepSeek vision tier over surfacing "temporarily
          // unavailable" when a working fallback exists.
          if (!isVisionWorkload) throw geminiErr;
          console.warn(
            `[Chat Route] Gemini vision model failed (${errorMessage(geminiErr)}). Falling back to ${DEEPSEEK_MODELS.vision}.`
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
        } catch (primaryErr: unknown) {
          console.warn(
            `[Chat Route] Primary model ${primarySpec.provider}/${primarySpec.model} failed. Trying fallback ${fallbackSpec.provider}/${fallbackSpec.model}:`,
            errorMessage(primaryErr)
          );
          actualModelUsed = fallbackSpec.provider.toUpperCase();
          actualModelDisplayName = `${fallbackSpec.provider.toUpperCase()} (${fallbackSpec.model})`;
          actualModelId = fallbackSpec.model;

          try {
            const loopResult = await executeAttempt(fallbackSpec.provider, fallbackSpec.model);
            aiResponseText = loopResult.text;
            totalUsage = loopResult.usage;
          } catch (fallbackErr: unknown) {
            if (secondarySpec) {
              console.warn(
                `[Chat Route] Fallback model ${fallbackSpec.provider}/${fallbackSpec.model} failed. Trying secondary fallback ${secondarySpec.provider}/${secondarySpec.model}:`,
                errorMessage(fallbackErr)
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
    } catch (apiError: unknown) {
      console.error("API Error:", apiError);
      let friendlyError = "The AI service is temporarily unavailable. Please try again later.";

      if (apiError instanceof LLMProviderError) {
        const pErr = apiError;
        if (pErr.originalError?.status === 429 || pErr.originalError?.status === 503 || pErr.code === "rate_limit_exceeded") {
          friendlyError = "The AI is currently overloaded with requests. Please wait a moment and try again.";
        }
      } else if ((apiError instanceof Error && apiError.name === "AbortError") || attemptRef.controller?.signal.aborted) {
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
      quotaReserved = false;
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

    let pendingAction;
    if (pendingOperations.length > 0) {
      try {
        pendingAction = stageSylvieAction(userId, sessionId!, aiMessage.id, pendingOperations);
        await prisma.systemMessage.update({ where: { id: aiMessage.id }, data: { content: attachSylvieAction(aiMessage.content, pendingAction) } });
      } catch {
        aiResponseText = "I couldn’t prepare a secure confirmation. Nothing was changed. Please try the action from its app page.";
        pendingAction = undefined;
        await prisma.systemMessage.update({ where: { id: aiMessage.id }, data: { content: aiResponseText } });
      }
    }

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
      aiMessage: { ...aiMessage, content: aiResponseText, modelUsed: actualModelDisplayName, pendingAction },
      pendingAction,
      reply: aiResponseText,
      message: aiResponseText,
      sessionId,
      session: newSession,
      modelUsed: actualModelUsed,
      modelDisplayName: actualModelDisplayName,
    }, { status: 200 });
  } catch (error: unknown) {
    console.error("Chat API Error:", error);
    // S4: refund any outstanding reservation when the request fails outside
    // the generation pipeline (the guarded decrement is safe to call once).
    try {
      if (sessionUserId !== null && quotaReserved) await releaseQuota(sessionUserId, "chat");
    } catch {}
    return NextResponse.json(
      { error: error instanceof RouteError ? error.message : "Internal server error" },
      { status: error instanceof RouteError ? error.status : 500 }
    );
  }
}
