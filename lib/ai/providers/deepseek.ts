import { DEEPSEEK_MODELS } from "../config";
import { aiSignal, observeAiDispatch } from "../telemetry-runtime";
import { openAIUsage } from "./usage";
import { collectHttpTextStream } from "./text-stream";
import {
  LLMAdapter,
  NormalizedMessage,
  NormalizedTool,
  LLMResponse,
  LLMProviderError,
  NormalizedToolCall,
} from "./types";
import crypto from "crypto";

export interface DeepSeekAdapterOptions {
  preserveText?: boolean;
  onTextDelta?: (text: string) => void;
  onReasoningDelta?: (text:string)=>void;
  responseFormat?: "json_object" | "text";
  temperature?: number;
  maxTokens?: number;
  /**
   * Toggles DeepSeek's thinking/reasoning mode for models that support it
   * (deepseek-chat / deepseek-reasoner, V3.1+). "disabled" skips generating
   * and billing reasoning tokens — used for simple/fast tiers. Rejected policies fail explicitly;
   * callers own recovery instead of silently restoring default reasoning.
   */
  thinking?: "enabled" | "disabled";
  /** Omission preserves existing routing/provider defaults. */
  reasoningEffort?: "low" | "high" | "max";
  /** Aborts the upstream HTTP request immediately when signalled. */
  signal?: AbortSignal;
  /** Caller owns the bounded repair/fallback budget. */
  singleAttempt?: boolean;
  telemetry?: boolean;
  telemetryStage?: string;
  retryIndex?: number;
}

export const cleanDeepSeekApiKey = (key: string | undefined) => (key || "").replace(/[^\x20-\x7E]/g, "").trim();

export class DeepSeekAdapter implements LLMAdapter {
  private apiKey: string;
  private model: string;
  private baseURL: string;

  constructor(
    apiKey: string,
    model: string = DEEPSEEK_MODELS.default,
    baseURL: string = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com"
  ) {
    // Sanitize API key and baseURL against zero-width spaces (\u200B) or non-ASCII characters
    this.apiKey = cleanDeepSeekApiKey(apiKey);
    this.model = model;
    this.baseURL = (baseURL || "https://api.deepseek.com")
      .replace(/[^\x20-\x7E]/g, "")
      .trim()
      .replace(/\/+$/, "");
  }

  public getModel(): string {
    return this.model;
  }

  public resolveModelName(requested: string): string {
    if (process.env.DEEPSEEK_MODEL) return process.env.DEEPSEEK_MODEL;
    return requested || DEEPSEEK_MODELS.default;
  }

  private mapTool(tool: NormalizedTool): any {
    return {
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters || { type: "object", properties: {} },
      },
    };
  }

  private mapMessages(
    messages: NormalizedMessage[],
    systemInstruction: string,
    includeReasoning = false
  ): any[] {
    const deepSeekMessages: any[] = [];

    // DeepSeek OpenAI-compatible standard requires system message
    if (systemInstruction && systemInstruction.trim().length > 0) {
      deepSeekMessages.push({
        role: "system",
        content: systemInstruction.trim(),
      });
    }

    for (const msg of messages) {
      if (msg.role === "system") {
        if (msg.content) {
          deepSeekMessages.push({ role: "system", content: msg.content });
        }
        continue;
      }

      if (msg.role === "user") {
        const hasMedia = msg.parts?.some((p) => !!(p.inlineData || p.imageUrl));

        if (hasMedia && msg.parts) {
          const contentParts: any[] = [];
          for (const p of msg.parts) {
            if (p.text) {
              contentParts.push({ type: "text", text: p.text });
            }
            if (p.inlineData || p.imageUrl) {
              contentParts.push({
                type: "image_url",
                image_url: {
                  url: p.imageUrl ?? `data:${p.inlineData!.mimeType};base64,${p.inlineData!.data}`,
                  detail: "original",
                },
              });
            }
          }
          if (msg.content && !msg.parts.some((p) => p.text === msg.content)) {
            contentParts.unshift({ type: "text", text: msg.content });
          }
          deepSeekMessages.push({ role: "user", content: contentParts });
        } else {
          let text = msg.content || "";
          if (msg.parts) {
            const partsText = msg.parts
              .map((p) => p.text)
              .filter(Boolean)
              .join("\n");
            if (partsText) {
              text = text ? `${text}\n${partsText}` : partsText;
            }
          }
          deepSeekMessages.push({ role: "user", content: text || " " });
        }
      } else if (msg.role === "assistant") {
        // Thinking tool rounds require the provider's reasoning on the next wire
        // request. Keep it in memory only; never expose or persist it in chat.
        const reasoning = includeReasoning ? { reasoning_content: (msg.rawParts ?? [])
          .filter(part => part.type === "reasoning" && typeof part.text === "string")
          .map(part => part.text).join("") } : {};
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          deepSeekMessages.push({
            role: "assistant",
            ...reasoning,
            content: msg.content || null,
            tool_calls: msg.toolCalls.map((tc) => ({
              id: tc.id || `call_${crypto.randomUUID().slice(0, 8)}`,
              type: "function",
              function: {
                name: tc.name,
                arguments:
                  typeof tc.args === "string"
                    ? tc.args
                    : JSON.stringify(tc.args || {}),
              },
            })),
          });
        } else {
          deepSeekMessages.push({
            role: "assistant",
            ...reasoning,
            content: msg.content || "",
          });
        }
      } else if (msg.role === "tool") {
        if (msg.toolResults && msg.toolResults.length > 0) {
          for (const tr of msg.toolResults) {
            deepSeekMessages.push({
              role: "tool",
              tool_call_id: tr.toolCallId,
              name: tr.name,
              content:
                typeof tr.result === "string"
                  ? tr.result
                  : JSON.stringify(tr.result),
            });
          }
        }
      }
    }

    return deepSeekMessages;
  }

  async generateResponse(
    messages: NormalizedMessage[],
    systemInstruction: string,
    tools: NormalizedTool[] = [],
    options?: DeepSeekAdapterOptions
  ): Promise<LLMResponse> {
    if (!this.apiKey) {
      throw new LLMProviderError(
        "deepseek",
        "DEEPSEEK_API_KEY is not configured.",
        null,
        "missing_api_key"
      );
    }

    const deepSeekMessages = this.mapMessages(messages, systemInstruction, tools.length > 0 && options?.thinking !== "disabled");
    const deepSeekTools =
      tools.length > 0 ? tools.map((t) => this.mapTool(t)) : undefined;

    const targetModel = this.resolveModelName(this.model);
    if (messages.some(message => message.parts?.some(part => part.inlineData || part.imageUrl)) && !/^(?:deepseek-flash|deepseek-v4-flash(?:-vision-exp)?)$/.test(targetModel)) {
      throw new LLMProviderError("deepseek", "The selected DeepSeek model does not support images. Choose DeepSeek Flash or Auto.", null, "unsupported_media");
    }
    const payload: Record<string, any> = {
      model: targetModel,
      messages: deepSeekMessages,
      stream: Boolean(!tools.length&&(options?.onReasoningDelta||options?.onTextDelta&&options.responseFormat!=="json_object")),
    };
    if (payload.stream) payload.stream_options = { include_usage: true };

    if (deepSeekTools && deepSeekTools.length > 0) {
      payload.tools = deepSeekTools;
      payload.tool_choice = "auto";
    }

    if (options?.responseFormat === "json_object") {
      payload.response_format = { type: "json_object" };
    }

    if (typeof options?.temperature === "number") {
      payload.temperature = options.temperature;
    }

    const requestedMaxTokens = options?.maxTokens ?? 16384;
    payload.max_tokens =
      options?.thinking === "disabled"
        ? Math.min(requestedMaxTokens, 8192)
        : requestedMaxTokens;

    if (options?.thinking) {
      payload.thinking = { type: options.thinking };
    }
    if (options?.reasoningEffort) payload.reasoning_effort = options.reasoningEffort;

    const doRequest = async (reqPayload: Record<string, any>): Promise<any> => observeAiDispatch("deepseek", targetModel, async () => {
      const endpoint = `${this.baseURL}/chat/completions`;
      const transientDelaysMs = [700, 1500, 3000];
      const waitBeforeRetry = (waitMs: number) =>
        new Promise<void>((resolve, reject) => {
          const sig = aiSignal(options?.signal);
          if (sig.aborted) {
            reject(sig.reason ?? new DOMException("Aborted", "AbortError"));
            return;
          }
          const onAbort = () => {
            clearTimeout(timer);
            reject(sig.reason ?? new DOMException("Aborted", "AbortError"));
          };
          const timer = setTimeout(() => {
            sig.removeEventListener("abort", onAbort);
            resolve();
          }, waitMs);
          sig.addEventListener("abort", onAbort, { once: true });
        });

      let response!: Response;
      for (let attempt = 0; attempt <= transientDelaysMs.length; attempt++) {
        try {
          let connectTimer: ReturnType<typeof setTimeout> | undefined;
          const fetchPromise = fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify(reqPayload),
            signal: aiSignal(options?.signal),
          });
          response = reqPayload.stream
            ? await Promise.race([
                fetchPromise,
                new Promise<never>((_resolve, reject) => {
                  connectTimer = setTimeout(
                    () => reject(new Error("Response stream stalled")),
                    35_000
                  );
                }),
              ]).finally(() => {
                if (connectTimer) clearTimeout(connectTimer);
              })
            : await fetchPromise;
        } catch (err) {
          const sig = aiSignal(options?.signal);
          if (
            !sig.aborted &&
            attempt < transientDelaysMs.length &&
            err instanceof Error &&
            err.message === "Response stream stalled"
          ) {
            await waitBeforeRetry(transientDelaysMs[attempt]);
            continue;
          }
          throw err;
        }

        if (!response.ok) {
          if (
            attempt < transientDelaysMs.length &&
            [429, 500, 502, 503, 504].includes(response.status)
          ) {
            try {
              await response.text();
            } catch {
              // drain transient error body before retry
            }
            await waitBeforeRetry(transientDelaysMs[attempt]);
            continue;
          }
          let errorBody = "";
          try {
            errorBody = await response.text();
          } catch {
            // ignore
          }

          const statusCode = response.status;
          let errorCode = "api_error";
          if (statusCode === 401) errorCode = "unauthorized";
          else if (statusCode === 429) errorCode = "rate_limit";
          else if (statusCode >= 500) errorCode = "server_error";

          const err = new LLMProviderError(
            "deepseek",
            `DeepSeek API responded with HTTP ${statusCode}`,
            errorBody,
            errorCode
          ) as LLMProviderError & { status: number };
          err.status = statusCode;
          throw err;
        }

        try {
          return reqPayload.stream &&
            (options?.onTextDelta || options?.onReasoningDelta)
            ? await collectHttpTextStream(
                response,
                options.onTextDelta ?? (() => {}),
                aiSignal(options.signal),
                options.onReasoningDelta,
                30_000
              )
            : await response.json();
        } catch (streamErr) {
          const sig = aiSignal(options?.signal);
          const msg =
            streamErr instanceof Error ? streamErr.message : String(streamErr);
          if (
            !sig.aborted &&
            attempt < transientDelaysMs.length &&
            (msg === "Response stream stalled" ||
              msg === "Response stream interrupted" ||
              msg === "Provider stream interrupted")
          ) {
            await waitBeforeRetry(transientDelaysMs[attempt]);
            continue;
          }
          throw streamErr;
        }
      }
      throw new Error("Unreachable DeepSeek dispatch state");
    }, data => ({ model: data.model, usage: openAIUsage(data.usage), finishReason: data.choices?.[0]?.finish_reason }), options?.telemetry !== false, { stage: options?.telemetryStage, retryIndex: options?.retryIndex });

    try {
      const data = await doRequest(payload);

      const choice = data.choices?.[0];
      const message = choice?.message;

      if (!message) {
        throw new LLMProviderError(
          "deepseek",
          "DeepSeek API returned an empty choices array.",
          data,
          "empty_response"
        );
      }

      const normalizedToolCalls: NormalizedToolCall[] = [];
      if (message.tool_calls && Array.isArray(message.tool_calls)) {
        for (const tc of message.tool_calls) {
          let parsedArgs: Record<string, any> = {};
          try {
            parsedArgs =
              typeof tc.function?.arguments === "string"
                ? JSON.parse(tc.function.arguments || "{}")
                : tc.function?.arguments || {};
          } catch (err) {
            throw new LLMProviderError(
              "deepseek",
              `Failed to parse tool call arguments for tool '${tc.function?.name}'`,
              err,
              "invalid_json"
            );
          }

          normalizedToolCalls.push({
            id: tc.id || crypto.randomUUID(),
            name: tc.function?.name || "",
            args: parsedArgs,
          });
        }
      }

      const rawText = message.content || "";
      const reasoningContent = message.reasoning_content;

      // Tool continuity stays in memory by default. Explicit opt-in callers
      // receive DeepSeek's documented reasoning channel separately from content.
      const text = rawText ? options?.preserveText ? rawText : rawText.trim() : undefined;

      return {
        ...(typeof data.model === "string" ? { model: data.model } : {}),
        ...(typeof data.system_fingerprint === "string" ? { fingerprint: data.system_fingerprint } : {}),
        finishReason: data.choices?.[0]?.finish_reason === "length" ? "MAX_TOKENS" :
          ["stop", "tool_calls"].includes(data.choices?.[0]?.finish_reason) ? "STOP" : "OTHER",
        text,
        ...(options?.onReasoningDelta&&typeof reasoningContent==="string"?{reasoningText:reasoningContent}:{}),
        toolCalls:
          normalizedToolCalls.length > 0 ? normalizedToolCalls : undefined,
        rawCandidateParts: reasoningContent
          ? [{ text: reasoningContent, type: "reasoning" }]
          : undefined,
        usage: openAIUsage(data.usage),
      };
    } catch (err: any) {
      if (err instanceof LLMProviderError) {
        throw err;
      }
      throw new LLMProviderError(
        "deepseek",
        "DeepSeek network or execution error",
        err,
        "network_error"
      );
    }
  }
}
