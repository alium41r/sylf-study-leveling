import { describe, it, expect, beforeEach, vi } from "vitest";
import { GeminiAdapter } from "../../lib/ai/providers/gemini";
import { GroqAdapter } from "../../lib/ai/providers/groq";
import { DeepSeekAdapter } from "../../lib/ai/providers/deepseek";
import { NormalizedMessage, NormalizedTool } from "../../lib/ai/providers/types";

// Mock the Groq SDK completely to avoid the `dangerouslyAllowBrowser` error in Vitest
vi.mock("groq-sdk", () => {
  return {
    default: class {
      chat = {
        completions: {
          create: vi.fn(),
        },
      };
    },
  };
});

describe("LLM Provider Contract Tests", () => {
  const mockTools: NormalizedTool[] = [
    {
      name: "getWeather",
      description: "Get the current weather for a location",
      parameters: {
        type: "object",
        properties: {
          location: { type: "string" },
        },
        required: ["location"],
      },
    },
  ];

  const adapters = [
    { name: "Gemini", instance: new GeminiAdapter("dummy-key", "gemini-3.7-flash") },
    { name: "Groq", instance: new GroqAdapter("dummy-key", "openai/gpt-oss-120b") },
    { name: "DeepSeek", instance: new DeepSeekAdapter("dummy-key", "deepseek-v4-flash") },
  ];

  for (const { name, instance } of adapters) {
    describe(`${name} Adapter`, () => {
      beforeEach(() => {
        // Mock the underlying SDKs / fetch
        if (name === "Gemini") {
          (instance as any).ai = {
            models: {
              generateContent: vi.fn().mockResolvedValue({
                text: "Here is the weather.",
                functionCalls: [{ name: "getWeather", args: { location: "London" } }],
                usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
              }),
            },
          };
        } else if (name === "Groq") {
          (instance as any).groq = {
            chat: {
              completions: {
                create: vi.fn().mockResolvedValue({
                  choices: [
                    {
                      message: {
                        content: "Here is the weather.",
                        tool_calls: [
                          {
                            id: "call_123",
                            type: "function",
                            function: { name: "getWeather", arguments: JSON.stringify({ location: "London" }) },
                          },
                        ],
                      },
                    },
                  ],
                  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
                }),
              },
            },
          };
        } else if (name === "DeepSeek") {
          global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
              choices: [
                {
                  message: {
                    content: "Here is the weather.",
                    tool_calls: [
                      {
                        id: "call_ds_123",
                        type: "function",
                        function: { name: "getWeather", arguments: JSON.stringify({ location: "London" }) },
                      },
                    ],
                  },
                },
              ],
              usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
            }),
          } as any);
        }
      });

      it("normalizes tool calls correctly", async () => {
        const messages: NormalizedMessage[] = [{ role: "user", content: "What is the weather in London?" }];
        const response = await instance.generateResponse(messages, "You are a weather bot.", mockTools);

        expect(response.toolCalls).toBeDefined();
        expect(response.toolCalls!.length).toBe(1);
        expect(response.toolCalls![0].name).toBe("getWeather");
        expect(response.toolCalls![0].args).toEqual({ location: "London" });
        expect(response.toolCalls![0].id).toBeDefined(); // Should have generated or mapped an ID
      });

      it("normalizes usage metadata", async () => {
        const messages: NormalizedMessage[] = [{ role: "user", content: "What is the weather in London?" }];
        const response = await instance.generateResponse(messages, "You are a weather bot.", mockTools);

        expect(response.usage).toBeDefined();
        expect(response.usage!.promptTokens).toBe(10);
        expect(response.usage!.completionTokens).toBe(5);
        expect(response.usage!.totalTokens).toBe(15);
      });
    });
  }
});
