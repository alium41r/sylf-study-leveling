export interface NormalizedTool {
  name: string;
  description: string;
  parameters?: {
    type: string;
    properties?: Record<string, any>;
    required?: string[];
  };
}

export interface NormalizedMessagePart {
  text?: string;
  /** Server-issued short-lived URL; inlineData remains available to other adapters. */
  imageUrl?: string;
  inlineData?: {
    mimeType: string;
    data: string; // base64
  };
}

export interface NormalizedToolCall {
  id: string;
  name: string;
  args: Record<string, any>;
  rawPart?: any; // Preserves provider-specific metadata like thought_signature
}

export interface NormalizedToolResult {
  toolCallId: string;
  name: string;
  result: any;
}

export interface NormalizedMessage {
  role: "user" | "assistant" | "system" | "tool";
  content?: string; // used for simple text or system prompts
  parts?: NormalizedMessagePart[]; // used for multimodal user messages
  toolCalls?: NormalizedToolCall[]; // used when assistant calls tools
  toolResults?: NormalizedToolResult[]; // used when role === "tool"
  rawParts?: any[]; // preserves original provider parts (e.g. Gemini thought_signature and thinking tokens)
}

export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** Cached subset of input. Undefined means the provider did not report it. */
  cacheHitTokens?: number;
  /** Subset of completionTokens, never an additional billed output count. */
  reasoningTokens?: number;
}

export interface LLMResponse {
  /** Bounded completion metadata for callers that own structured-output validation. */
  finishReason?: "STOP" | "MAX_TOKENS" | "OTHER";
  text?: string;
  toolCalls?: NormalizedToolCall[];
  rawCandidateParts?: any[]; // Provider raw candidate parts for preserving reasoning chain
  usage?: LLMUsage;
}

export class LLMProviderError extends Error {
  public provider: string;
  public originalError: any;
  public code?: string;

  constructor(provider: string, message: string, originalError: any, code?: string) {
    super(message);
    this.name = "LLMProviderError";
    this.provider = provider;
    this.originalError = originalError;
    this.code = code;
  }
}

export interface LLMGenerateOptions {
  /** Visible answer deltas for text-only turns; tools/structured outputs remain buffered. */
  onTextDelta?: (text: string) => void;
  responseFormat?: "json_object" | "text";
  temperature?: number;
  maxTokens?: number;
  /**
   * Control the reasoning/thinking mode for models that
   * support it. "disabled" skips generating (and billing) reasoning tokens
   * — ideal for simple/fast tiers. Gemini 2.5 Flash also
   * supports disabled thinking; GPT-OSS uses its minimum low effort because it
   * cannot disable reasoning. Other custom models retain their own defaults.
   */
  thinking?: "enabled" | "disabled";
  /** Optional DeepSeek effort control; omission preserves the provider default. */
  reasoningEffort?: "low" | "high" | "max";
  /** Aborts the upstream HTTP request immediately when signalled. */
  signal?: AbortSignal;
  /** Caller owns the bounded repair/fallback budget. */
  singleAttempt?: boolean;
  /** Durable Planner V2 owns its existing dispatch ledger. */
  telemetry?: boolean;
  telemetryStage?: string;
  retryIndex?: number;
}

export interface LLMAdapter {
  generateResponse(
    messages: NormalizedMessage[],
    systemInstruction: string,
    tools: NormalizedTool[],
    options?: LLMGenerateOptions
  ): Promise<LLMResponse>;
}
