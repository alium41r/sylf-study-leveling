// @vitest-environment node
import { it, expect } from "vitest";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import {
  MASTERY_PROVIDER_CALL_BUDGET,
  generateMastery,
} from "@/lib/ai/planner/mastery";
import { LLMFactory, type LLMProviderName } from "@/lib/ai/providers/factory";
import type { LLMResponse } from "@/lib/ai/providers/types";
import { completionCriteriaIssue } from "@/lib/planner/done";
import { UserInputV1Schema } from "@/lib/planner/contracts";
import {
  MASTERY_STAGE_INTENTS,
  masteryInput,
  masteryTokens,
  validateMasteryProposal,
  type MasteryInput,
} from "@/lib/planner/mastery-policy";
import type { MasteryStage } from "@/lib/planner/mastery-fields";
import { normalizeProposal } from "@/lib/planner/server/core";
import { masteryAvailability, masteryFixture } from "./mastery-fixtures";

/**
 * Bounded live-provider smoke for Chapter / Unit Mastery.
 *
 * Opt-in only (`PLANNER_PROVIDER_SMOKE=true`). It runs three deliberately different
 * chapters — a new unit, a mostly-covered unit, and a mixed-confidence chapter — and
 * records provider availability and validator codes, never credentials or academic
 * content. A rejected plan is reported with its code rather than retried into a
 * different shape, because validator feedback is the signal this smoke exists for.
 */
const scenarios: { name: string; build: () => MasteryInput }[] = [
  {
    name: "new-chapter",
    build: () => masteryFixture(),
  },
  {
    name: "mostly-covered",
    build: () => {
      const base = masteryFixture();
      return masteryInput(
        UserInputV1Schema.parse({
          ...base,
          mastery: {
            ...base.mastery,
            priorExposure: "MOSTLY",
            topics: base.mastery.topics.map((topic) => ({
              ...topic,
              covered: true,
              confidence: 4,
              difficult: false,
            })),
          },
        })
      );
    },
  },
  {
    name: "mixed-confidence",
    build: () => {
      const base = masteryFixture();
      return masteryInput(
        UserInputV1Schema.parse({
          ...base,
          mastery: {
            ...base.mastery,
            desiredDepth: "DEEP",
            checkPreference: "EXPLAIN_AND_SOLVE",
            topics: base.mastery.topics.map((topic, index) => ({
              ...topic,
              confidence: ([1, 3, 5] as const)[index] ?? 3,
              covered: index !== 0,
              difficult: index === 0,
            })),
          },
        })
      );
    },
  },
];

it.skipIf(process.env.PLANNER_PROVIDER_SMOKE !== "true")(
  "controlled synthetic Mastery provider smoke across three chapters",
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
    const attempts: {
      provider: string;
      model: string;
      workload: string;
      state: string;
      status?: number;
    }[] = [];
    const validationCodes: string[] = [];
    let workload = "mastery";
    const wrapped = (provider: LLMProviderName, model: string) => {
      const adapter = LLMFactory.getAdapter(provider, model);
      return {
        async generateResponse(
          ...args: Parameters<typeof adapter.generateResponse>
        ) {
          const attempt: (typeof attempts)[number] = {
            provider,
            model,
            workload,
            state: "REQUESTED",
          };
          attempts.push(attempt);
          try {
            const response: LLMResponse = await adapter.generateResponse(...args);
            attempt.state = "RESPONSE";
            return response;
          } catch (error) {
            attempt.state = "FAILED";
            const e = error as {
              status?: number;
              originalError?: { status?: number; code?: number };
            };
            const status =
              e.status ?? e.originalError?.status ?? e.originalError?.code;
            if (typeof status === "number") attempt.status = status;
            throw error;
          }
        },
      };
    };
    const results: Record<string, unknown>[] = [];
    for (const scenario of scenarios) {
      const input = scenario.build();
      workload = "mastery";
      try {
        const generated = await generateMastery(
          input,
          masteryAvailability(),
          new AbortController().signal,
          {
            adapter: wrapped as never,
            validationFailure: (code) => validationCodes.push(code),
            usage: (_provider, _model, _usage, stage) => {
              workload =
                stage === "mastery_critic"
                  ? "mastery_critic"
                  : stage === "mastery_repair"
                    ? "mastery_repair"
                    : "mastery";
              void _provider;
              void _model;
              void _usage;
            },
            semantic: {
              criticAdapter: wrapped as never,
              repairAdapter: wrapped as never,
              deadlineAt: Date.now() + 90_000,
            },
          }
        );
        const tokens = masteryTokens(input);
        validateMasteryProposal(input, generated.proposal, masteryAvailability());
        const draft = normalizeProposal(input, generated.proposal);
        const stages = generated.proposal.items.map(
          (item) => item.masteryStage as MasteryStage
        );
        results.push({
          scenario: scenario.name,
          units: tokens.length,
          items: generated.proposal.items.length,
          calls: generated.calls,
          critic: generated.review.critic,
          issues: generated.review.issues,
          repaired: generated.review.repaired,
          stagesValid: generated.proposal.items.every((item) =>
            MASTERY_STAGE_INTENTS[item.masteryStage as MasteryStage].includes(
              item.type
            )
          ),
          endsWithCheck: stages.at(-1) === "MASTERY_CHECK",
          // Every stored item carries a criterion that passes the shared gate.
          criteriaValid: draft.items.every(
            (item) =>
              item.completionCriteria !== undefined &&
              completionCriteriaIssue(item.completionCriteria, item) === null
          ),
          // The plan is one chapter: no milestones, no re-teaching of a secure unit.
          milestones: generated.proposal.milestones.length,
          reteachesSecureUnit: generated.proposal.items.some(
            (item) =>
              item.type === "LEARN" &&
              tokens.find((topic) => topic.ref === item.topicRef)?.covered === true &&
              (tokens.find((topic) => topic.ref === item.topicRef)?.confidence ?? 0) >= 4
          ),
        });
        expect(generated.calls).toBeLessThanOrEqual(MASTERY_PROVIDER_CALL_BUDGET);
      } catch (error) {
        const e = error as { code?: string; message?: string };
        validationCodes.push(e.code ?? e.message ?? "UNKNOWN");
        results.push({ scenario: scenario.name, state: "REJECTED", code: e.code });
      }
    }
    mkdirSync("scratch", { recursive: true });
    writeFileSync(
      "scratch/mastery-provider-smoke.json",
      JSON.stringify(
        { configured, results, attempts, validationCodes, at: new Date().toISOString() },
        null,
        2
      )
    );
    // At least one provider must be configured for this smoke to mean anything.
    expect(configured.deepseek || configured.gemini).toBe(true);
    expect(results).toHaveLength(scenarios.length);
    for (const result of results)
      expect(result).toHaveProperty("scenario");
  },
  600_000
);
