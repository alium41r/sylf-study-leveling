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
  responseFormat?: "json_object" | "text";
  temperature?: number;
  maxTokens?: number;
  /** Aborts the upstream HTTP request immediately when signalled. */
  signal?: AbortSignal;
}

export class DeepSeekAdapter implements LLMAdapter {
  private apiKey: string;
  private model: string;
  private baseURL: string;

  constructor(
    apiKey: string,
    model: string = "deepseek-v4-flash",
    baseURL: string = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com"
  ) {
    // Sanitize API key and baseURL against zero-width spaces (\u200B) or non-ASCII characters
    this.apiKey = (apiKey || "").replace(/[^\x20-\x7E]/g, "").trim();
    this.model = model;
    this.baseURL = (baseURL || "https://api.deepseek.com")
      .replace(/[^\x20-\x7E]/g, "")
      .trim()
      .replace(/\/+$/, "");
  }

  public getModel(): string {
    return this.model;
  }

  private resolveModelName(requested: string): string {
    if (process.env.DEEPSEEK_MODEL) return process.env.DEEPSEEK_MODEL;
    if (requested.includes("vision")) return "deepseek-v4-flash-vision-exp";
    if (requested.includes("reasoner")) return "deepseek-reasoner";
    return requested || "deepseek-v4-flash";
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
    systemInstruction: string
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
        const hasMedia = msg.parts?.some((p) => !!p.inlineData);

        if (hasMedia && msg.parts) {
          const contentParts: any[] = [];
          for (const p of msg.parts) {
            if (p.text) {
              contentParts.push({ type: "text", text: p.text });
            }
            if (p.inlineData) {
              contentParts.push({
                type: "image_url",
                image_url: {
                  url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}`,
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
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          deepSeekMessages.push({
            role: "assistant",
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

    const deepSeekMessages = this.mapMessages(messages, systemInstruction);
    const deepSeekTools =
      tools.length > 0 ? tools.map((t) => this.mapTool(t)) : undefined;

    const targetModel = this.resolveModelName(this.model);
    const payload: Record<string, any> = {
      model: targetModel,
      messages: deepSeekMessages,
      stream: false,
    };

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

    if (typeof options?.maxTokens === "number") {
      payload.max_tokens = options.maxTokens;
    }

    try {
      const endpoint = `${this.baseURL}/chat/completions`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: options?.signal,
      });

      if (!response.ok) {
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

        throw new LLMProviderError(
          "deepseek",
          `DeepSeek API responded with HTTP ${statusCode}: ${errorBody || response.statusText}`,
          errorBody,
          errorCode
        );
      }

      const data = await response.json();
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

      // If reasoning_content exists (DeepSeek Reasoner), log or preserve reasoning
      const text = rawText ? rawText.trim() : undefined;

      return {
        text,
        toolCalls:
          normalizedToolCalls.length > 0 ? normalizedToolCalls : undefined,
        rawCandidateParts: reasoningContent
          ? [{ text: reasoningContent, type: "reasoning" }]
          : undefined,
        usage: data.usage
          ? {
              promptTokens: data.usage.prompt_tokens || 0,
              completionTokens: data.usage.completion_tokens || 0,
              totalTokens: data.usage.total_tokens || 0,
            }
          : undefined,
      };
    } catch (err: any) {
      if (err instanceof LLMProviderError) {
        throw err;
      }
      throw new LLMProviderError(
        "deepseek",
        `DeepSeek network or execution error: ${err.message || String(err)}`,
        err,
        "network_error"
      );
    }
  }
}
