// @vitest-environment node
import { it, expect } from "vitest";
import { existsSync, writeFileSync } from "node:fs";
import { generateExam, EXAM_TIMEOUT_MS } from "@/lib/ai/planner/exam";
import { LLMFactory } from "@/lib/ai/providers/factory";
import { examFixture, examAvailability } from "./exam-fixtures";

it.skipIf(process.env.PLANNER_PROVIDER_SMOKE !== "true")(
  "controlled synthetic configured-provider smoke",
  async () => {
    for (const file of [".env.local", ".env"])
      if (existsSync(file)) process.loadEnvFile(file);
    const configured = {
      deepseek: Boolean(process.env.DEEPSEEK_API_KEY),
      gemini: Boolean(
        process.env.GEMINI_API_KEY ||
        process.env.GOOGLE_GENAI_API_KEY ||
        process.env.GOOGLE_API_KEY
      ),
    };
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), EXAM_TIMEOUT_MS);
    const attempts: {
      provider: string;
      model: string;
      state: string;
      status?: number;
      tokens?: number;
    }[] = [];
    let outcome = "UNAVAILABLE";
    const validationCodes: string[] = [];
    if (configured.deepseek || configured.gemini)
      try {
        await generateExam(
          examFixture(),
          examAvailability(),
          controller.signal,
          {
            validationFailure: (code) => {
              validationCodes.push(code);
            },
            adapter: (provider, model) => {
              const attempt: (typeof attempts)[number] = {
                provider,
                model,
                state: "REQUESTED",
              };
              attempts.push(attempt);
              const adapter = LLMFactory.getAdapter(provider, model);
              return {
                async generateResponse(...args) {
                  try {
                    const response = await adapter.generateResponse(...args);
                    attempt.state = "RESPONSE";
                    attempt.tokens = response.usage?.totalTokens;
                    return response;
                  } catch (error) {
                    attempt.state = "FAILED";
                    const e = error as {
                      status?: number;
                      originalError?: { status?: number };
                    };
                    const status = e.status ?? e.originalError?.status;
                    if (typeof status === "number") attempt.status = status;
                    throw error;
                  }
                },
              };
            },
          }
        );
        outcome = "VALIDATED_DRAFT_PROPOSAL";
      } catch {
        outcome = controller.signal.aborted ? "TIMEOUT" : "NO_VALIDATED_RESULT";
      } finally {
        clearTimeout(timer);
      }
    if (!configured.deepseek && !configured.gemini) clearTimeout(timer);
    const summary = {
      configured,
      attempts,
      validationCodes,
      outcome,
      elapsedMs: Date.now() - started,
      syntheticOnly: true,
      databaseWrites: false,
    };
    writeFileSync(
      "/tmp/sylf-planner-phase2/provider-smoke.json",
      JSON.stringify(summary, null, 2)
    );
    console.info("EXAM_PROVIDER_SMOKE", summary);
    expect(attempts.length).toBeLessThanOrEqual(3);
  },
  110_000
);
