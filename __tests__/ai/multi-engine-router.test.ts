import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  classifyWorkload,
  hasMediaAttachments,
  dispatchWithFallback,
  WORKLOAD_ROUTING_TABLE,
  type WorkloadType,
} from "../../lib/ai/agent-router";
import { LLMFactory } from "../../lib/ai/providers/factory";
import { DEEPSEEK_MODELS, GEMINI_MODELS, GROQ_MODELS } from "../../lib/ai/config";
import { NormalizedMessage } from "../../lib/ai/providers/types";

describe("Multi-Engine AI Architecture & Dynamic Router Tests", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      DEEPSEEK_API_KEY: "mock_deepseek_key",
      GEMINI_API_KEY: "mock_gemini_key",
      GROQ_API_KEY: "mock_groq_key",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("1. Automatic Media Attachment & Multimodal Vision Detection", () => {
    it("detects inlineData image buffers in NormalizedMessage parts", () => {
      const messagesWithImage: NormalizedMessage[] = [
        {
          role: "user",
          content: "Can you solve this circuit diagram?",
          parts: [
            { text: "Can you solve this circuit diagram?" },
            { inlineData: { mimeType: "image/png", data: "iVBORw0KGgoAAAANSUhEUg..." } },
          ],
        },
      ];

      expect(hasMediaAttachments(messagesWithImage)).toBe(true);

      const route = classifyWorkload("Can you solve this circuit diagram?", undefined, {
        messages: messagesWithImage,
      });

      expect(route.workload).toBe("multimodal_vision");
      expect(route.route.primary.provider).toBe("deepseek");
      expect(route.route.primary.model).toBe(DEEPSEEK_MODELS.vision);
      expect(route.route.fallback.provider).toBe("gemini");
      expect(route.route.fallback.model).toBe(GEMINI_MODELS.visionFallback);
    });

    it("detects explicit hasMedia flag", () => {
      const route = classifyWorkload("Analyze this physics graph", undefined, {
        hasMedia: true,
      });

      expect(route.workload).toBe("multimodal_vision");
      expect(route.hasMedia).toBe(true);
      expect(route.route.primary.model).toBe("deepseek-v4-flash-vision-exp");
      expect(route.route.fallback.model).toBe("gemini-3.7-flash");
    });
  });

  describe("2. Autonomous Study Planner & Syllabus Compiler Routing", () => {
    it("routes planner tasks to deepseek-v4-pro with gemini-3.1-pro research fallback", () => {
      const route = classifyWorkload("Create a 4-week study plan for Cambridge AS Physics", undefined, {
        isPlanner: true,
      });

      expect(route.workload).toBe("planner");
      expect(route.route.primary.provider).toBe("deepseek");
      expect(route.route.primary.model).toBe(DEEPSEEK_MODELS.planner);
      expect(route.route.fallback.provider).toBe("gemini");
      expect(route.route.fallback.model).toBe(GEMINI_MODELS.research);
    });

    it("routes syllabus constellation compilation to deepseek-v4-pro with gemini-3.1-pro fallback", () => {
      const route = classifyWorkload("Decompose 9702 syllabus into 48 nodes", undefined, {
        isSyllabus: true,
      });

      expect(route.workload).toBe("syllabus");
      expect(route.route.primary.provider).toBe("deepseek");
      expect(route.route.primary.model).toBe(DEEPSEEK_MODELS.compiler);
      expect(route.route.fallback.provider).toBe("gemini");
      expect(route.route.fallback.model).toBe(GEMINI_MODELS.research);
    });
  });

  describe("3. Complex STEM Derivations & Algorithmic Proofs", () => {
    it("detects derivation and theorem proof prompts and routes to deepseek-reasoner", () => {
      const mathPrompts = [
        "Please derive the 2D projectile range equation from kinematic first principles",
        "Show that the time-independent Schrodinger equation yields discrete energy levels",
        "Prove the Taylor series remainder theorem with rigorous calculus steps",
        "Solve this second-order non-homogeneous differential equation step by step",
      ];

      for (const prompt of mathPrompts) {
        const route = classifyWorkload(prompt);
        expect(route.workload).toBe("complex_stem");
        expect(route.route.primary.provider).toBe("deepseek");
        expect(route.route.primary.model).toBe(DEEPSEEK_MODELS.stem);
        expect(route.route.fallback.provider).toBe("deepseek");
        expect(route.route.fallback.model).toBe(DEEPSEEK_MODELS.chat);
        expect(route.route.secondaryFallback?.provider).toBe("gemini");
        expect(route.route.secondaryFallback?.model).toBe(GEMINI_MODELS.stemFallback);
      }
    });
  });

  describe("4. General System Chat & Companion Assistant Routing", () => {
    it("routes general chat to deepseek-v4-flash with Groq llama-3.3-70b-versatile fallback", () => {
      const route = classifyWorkload("Tell me about the hunter ranking system in Sylf");
      expect(route.workload).toBe("general_chat");
      expect(route.route.primary.provider).toBe("deepseek");
      expect(route.route.primary.model).toBe(DEEPSEEK_MODELS.chat);
      expect(route.route.fallback.provider).toBe("groq");
      expect(route.route.fallback.model).toBe(GROQ_MODELS.chatFallback);
    });
  });

  describe("5. Focus Timer In-Session Assistant Routing", () => {
    it("routes focus timer in-session queries to deepseek-v4-flash with gemini-3.7-flash fallback", () => {
      const route = classifyWorkload("I need a quick hint on question 3", undefined, {
        isFocusMode: true,
      });

      expect(route.workload).toBe("focus_chat");
      expect(route.route.primary.provider).toBe("deepseek");
      expect(route.route.primary.model).toBe(DEEPSEEK_MODELS.focus);
      expect(route.route.fallback.provider).toBe("gemini");
      expect(route.route.fallback.model).toBe(GEMINI_MODELS.focus);
    });
  });

  describe("6. Cascade Execution & Zero-Downtime Fallback Verification", () => {
    it("executes primary model successfully when online", async () => {
      const mockAdapter = {
        generateResponse: vi.fn().mockResolvedValue({
          text: "Primary model response",
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        }),
      };
      const getAdapterSpy = vi.spyOn(LLMFactory, "getAdapter").mockReturnValue(mockAdapter as any);

      const result = await dispatchWithFallback(
        "general_chat",
        [{ role: "user", content: "Hello" }],
        "System prompt",
        []
      );

      expect(result.fallbackOccurred).toBe(false);
      expect(result.providerUsed).toBe("deepseek");
      expect(result.modelUsed).toBe(DEEPSEEK_MODELS.chat);
      expect(result.response.text).toBe("Primary model response");
      expect(result.attempts.length).toBe(1);
      expect(result.attempts[0].success).toBe(true);

      getAdapterSpy.mockRestore();
    });

    it("gracefully falls back to secondary provider when primary fails", async () => {
      const failingPrimary = {
        generateResponse: vi.fn().mockRejectedValue(new Error("DeepSeek 503 Service Unavailable")),
      };
      const succeedingFallback = {
        generateResponse: vi.fn().mockResolvedValue({
          text: "Fallback Groq response",
          usage: { promptTokens: 8, completionTokens: 4, totalTokens: 12 },
        }),
      };

      const getAdapterSpy = vi.spyOn(LLMFactory, "getAdapter").mockImplementation((provider, model) => {
        if (provider === "deepseek") return failingPrimary as any;
        if (provider === "groq") return succeedingFallback as any;
        throw new Error("Unexpected provider");
      });

      const fallbackSpy = vi.fn();

      const result = await dispatchWithFallback(
        "general_chat",
        [{ role: "user", content: "Hi" }],
        "System prompt",
        [],
        { onFallback: fallbackSpy }
      );

      expect(result.fallbackOccurred).toBe(true);
      expect(result.providerUsed).toBe("groq");
      expect(result.modelUsed).toBe(GROQ_MODELS.chatFallback);
      expect(result.response.text).toBe("Fallback Groq response");
      expect(result.attempts.length).toBe(2);
      expect(result.attempts[0].success).toBe(false);
      expect(result.attempts[1].success).toBe(true);
      expect(fallbackSpy).toHaveBeenCalledTimes(1);

      getAdapterSpy.mockRestore();
    });

    it("verifies full routing matrix covers all defined workloads", () => {
      const workloads: WorkloadType[] = [
        "multimodal_vision",
        "planner",
        "syllabus",
        "complex_stem",
        "focus_chat",
        "general_chat",
        "calendar",
        "coach",
        "analyst",
      ];

      for (const wl of workloads) {
        const entry = WORKLOAD_ROUTING_TABLE[wl];
        expect(entry).toBeDefined();
        expect(entry.primary.provider).toBeDefined();
        expect(entry.primary.model).toBeDefined();
        expect(entry.fallback.provider).toBeDefined();
        expect(entry.fallback.model).toBeDefined();
      }
    });
  });
});
