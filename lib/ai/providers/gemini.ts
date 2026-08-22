import { GoogleGenAI, Type, FunctionDeclaration, Content, Part } from "@google/genai";
import { LLMAdapter, NormalizedMessage, NormalizedTool, LLMResponse, LLMProviderError, NormalizedToolCall } from "./types";
import crypto from "crypto";

export class GeminiAdapter implements LLMAdapter {
  private ai: GoogleGenAI;
  private model: string;

  constructor(apiKey: string, model: string = "gemini-2.5-flash") {
    this.ai = new GoogleGenAI({ apiKey });
    this.model = model;
  }

  // Convert normalized tool to Gemini FunctionDeclaration
  private mapTool(tool: NormalizedTool): FunctionDeclaration {
    const mapType = (t: string): Type => {
      switch (t.toLowerCase()) {
        case "string": return Type.STRING;
        case "number": return Type.NUMBER;
        case "integer": return Type.INTEGER;
        case "boolean": return Type.BOOLEAN;
        case "array": return Type.ARRAY;
        case "object": return Type.OBJECT;
        default: return Type.STRING;
      }
    };

    const mapSchema = (schema: any): any => {
      if (!schema) return schema;
      const res: any = { type: mapType(schema.type) };
      if (schema.properties) {
        res.properties = {};
        for (const k in schema.properties) {
          res.properties[k] = mapSchema(schema.properties[k]);
        }
      }
      if (schema.items) res.items = mapSchema(schema.items);
      if (schema.required) res.required = schema.required;
      if (schema.description) res.description = schema.description;
      return res;
    };

    return {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters ? mapSchema(tool.parameters) : undefined,
    };
  }

  private mapMessages(messages: NormalizedMessage[]): Content[] {
    const contents: Content[] = [];

    for (const msg of messages) {
      if (msg.role === "system") continue; // System prompt is passed via config in generateContent

      let role: "user" | "model";
      if (msg.role === "user" || msg.role === "tool") {
        // Gemini expects tool responses to come from "user" role
        role = "user";
      } else {
        role = "model";
      }

      // If the message contains original provider parts (e.g. Gemini candidate parts with thought_signature), preserve them directly!
      if (msg.rawParts && msg.rawParts.length > 0) {
        contents.push({ role, parts: msg.rawParts });
        continue;
      }

      const parts: Part[] = [];

      if (msg.content) {
        parts.push({ text: msg.content });
      }

      if (msg.parts) {
        for (const p of msg.parts) {
          if (p.text) parts.push({ text: p.text });
          if (p.inlineData) parts.push({ inlineData: p.inlineData });
        }
      }

      if (msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          if (tc.rawPart) {
            parts.push(tc.rawPart);
          } else {
            parts.push({ functionCall: { name: tc.name, args: tc.args } });
          }
        }
      }

      if (msg.toolResults) {
        for (const tr of msg.toolResults) {
          parts.push({ functionResponse: { name: tr.name, response: tr.result } });
        }
      }

      contents.push({ role, parts });
    }

    return contents;
  }

  async generateResponse(
    messages: NormalizedMessage[],
    systemInstruction: string,
    tools: NormalizedTool[],
    options?: import("./types").LLMGenerateOptions
  ): Promise<LLMResponse> {
    const contents = this.mapMessages(messages);
    const geminiTools = tools.length > 0 ? [{ functionDeclarations: tools.map(this.mapTool) }] : undefined;

    const candidateModels = Array.from(
      new Set([this.model, "gemini-3.7-flash", "gemini-3.6-flash"].filter(Boolean))
    );

    let lastError: any = null;

    for (const modelToTry of candidateModels) {
      try {
        const response = await this.ai.models.generateContent({
          model: modelToTry,
          contents,
          config: {
            systemInstruction,
            tools: geminiTools,
            responseMimeType:
              options?.responseFormat === "json_object"
                ? "application/json"
                : undefined,
            temperature: options?.temperature,
            abortSignal: options?.signal,
          }
        });

        const candidateParts = response.candidates?.[0]?.content?.parts || [];
        const toolCalls: NormalizedToolCall[] = [];
        if (response.functionCalls && response.functionCalls.length > 0) {
          for (const fc of response.functionCalls) {
            // Find matching raw part from candidateParts that has this functionCall
            const matchingPart = candidateParts.find(p => (p as any).functionCall?.name === fc.name);
            toolCalls.push({
              id: crypto.randomUUID(), // deterministic correlation ID for internal use
              name: fc.name!,
              args: fc.args as Record<string, any>,
              rawPart: matchingPart || { functionCall: { name: fc.name, args: fc.args } },
            });
          }
        }

        return {
          text: response.text || undefined,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          rawCandidateParts: candidateParts.length > 0 ? candidateParts : undefined,
          usage: response.usageMetadata ? {
            promptTokens: response.usageMetadata.promptTokenCount || 0,
            completionTokens: response.usageMetadata.candidatesTokenCount || 0,
            totalTokens: response.usageMetadata.totalTokenCount || 0,
          } : undefined,
        };
      } catch (error: any) {
        lastError = error;
        const isUnavailableOrRateLimited =
          error.status === 503 ||
          error.status === 429 ||
          error.code === 503 ||
          error.code === 429 ||
          (error.message &&
            (error.message.includes("high demand") ||
              error.message.includes("UNAVAILABLE") ||
              error.message.includes("RESOURCE_EXHAUSTED")));

        if (!isUnavailableOrRateLimited) {
          throw new LLMProviderError("gemini", error.message || "Failed to generate Gemini response", error);
        }
      }
    }

    throw new LLMProviderError("gemini", lastError?.message || "Failed to generate Gemini response", lastError);
  }
}
