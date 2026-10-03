// @vitest-environment node
import { it, expect } from "vitest";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import {
  ROADMAP_PROVIDER_CALL_BUDGET,
  generateRoadmap,
  type RoadmapProposal,
} from "@/lib/ai/planner/roadmap";
import {
  EXPANSION_PROVIDER_CALL_BUDGET,
  generateExpansion,
} from "@/lib/ai/planner/expansion";
import { LLMFactory, type LLMProviderName } from "@/lib/ai/providers/factory";
import type { LLMResponse } from "@/lib/ai/providers/types";
import { completionCriteriaIssue, milestoneOutcomeIssue } from "@/lib/planner/done";
import { expansionScope, validateExpansionItems } from "@/lib/planner/expansion-policy";
import { normalizeProposal } from "@/lib/planner/server/core";
import { roadmapAvailability, roadmapFixture } from "./roadmap-fixtures";

/**
 * Bounded live-provider smoke for Course Roadmap generation and one selected-period
 * expansion. Opt-in only; records provider availability and validator codes, never
 * credentials or academic content.
 */
it.skipIf(process.env.PLANNER_PROVIDER_SMOKE !== "true")(
  "controlled synthetic Roadmap and expansion provider smoke",
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
    let workload = "roadmap";
    const wrapped = (provider: LLMProviderName, model: string) => {
      const adapter = LLMFactory.getAdapter(provider, model);
      return {
        async generateResponse(...args: Parameters<typeof adapter.generateResponse>) {
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
            const status = e.status ?? e.originalError?.status ?? e.originalError?.code;
            if (typeof status === "number") attempt.status = status;
            throw error;
          }
        },
      };
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 180_000);
    const input = roadmapFixture();
    const summary: Record<string, unknown> = {
      configured,
      attempts,
      syntheticOnly: true,
      databaseWrites: false,
      budget: {
        roadmapCalls: ROADMAP_PROVIDER_CALL_BUDGET,
        expansionCalls: EXPANSION_PROVIDER_CALL_BUDGET,
      },
    };
    try {
      if (configured.deepseek || configured.gemini) {
        const roadmap = await generateRoadmap(
          input,
          roadmapAvailability(),
          controller.signal,
          {
            adapter: wrapped,
            validationFailure: (code) => {
              if (/^[A-Z_]+$/.test(code) && validationCodes.length < 24)
                validationCodes.push(code);
            },
            semantic: {
              criticAdapter: wrapped,
              repairAdapter: wrapped,
              deadlineAt: Date.now() + 90_000,
            },
          }
        );
        summary.outcome = "ROADMAP_VALIDATED";
        summary.milestones = roadmap.proposal.milestones.length;
        summary.items = roadmap.proposal.items.length;
        summary.critic = roadmap.review.critic;
        summary.issues = roadmap.review.issues;
        summary.repaired = roadmap.review.repaired;
        summary.roadmapCalls = roadmap.calls;
        summary.everyMilestoneHasBoundedOutcome = roadmap.proposal.milestones.every(
          (milestone) =>
            milestone.outcome !== undefined &&
            milestoneOutcomeIssue(milestone.outcome) === null
        );
        expect(roadmap.calls).toBeLessThanOrEqual(ROADMAP_PROVIDER_CALL_BUDGET);
        expect(roadmap.proposal.items).toHaveLength(0);

        // One bounded expansion of the first milestone on the same live providers.
        const draft = normalizeProposal(input, roadmap.proposal as RoadmapProposal);
        if (draft.mode === "ROADMAP") {
          workload = "expansion";
          const milestoneKey = draft.milestones[0].key;
          const scope = expansionScope(draft, milestoneKey, input);
          const expansion = await generateExpansion(
            input,
            draft,
            milestoneKey,
            roadmapAvailability(),
            [],
            controller.signal,
            {
              adapter: wrapped,
              semantic: {
                criticAdapter: wrapped,
                repairAdapter: wrapped,
                deadlineAt: Date.now() + 90_000,
              },
              validateItems: (items) =>
                validateExpansionItems(input, roadmapAvailability(), scope, items),
              acceptRepair: (items) => items,
            }
          );
          summary.expansionOutcome = "VALIDATED";
          summary.expansionItems = expansion.items.length;
          summary.expansionCalls = expansion.calls;
          summary.expansionCritic = expansion.review.critic;
          summary.everyItemHasBoundedDone = expansion.items.every(
            (item) =>
              item.completionCriteria !== undefined &&
              completionCriteriaIssue(item.completionCriteria, item) === null
          );
          expect(expansion.calls).toBeLessThanOrEqual(EXPANSION_PROVIDER_CALL_BUDGET);
        }
      } else {
        summary.outcome = "UNAVAILABLE";
      }
    } catch (error) {
      summary.outcome = controller.signal.aborted ? "TIMEOUT" : "NO_VALIDATED_RESULT";
      summary.errorCode =
        error instanceof Error && /^[A-Z_]+$/.test(error.message)
          ? error.message
          : "PROVIDER_OR_VALIDATION_FAILURE";
    } finally {
      clearTimeout(timer);
    }
    summary.validationCodes = validationCodes;
    mkdirSync("/tmp/sylf-planner-phase3", { recursive: true });
    writeFileSync(
      "/tmp/sylf-planner-phase3/roadmap-provider-smoke.json",
      JSON.stringify(summary, null, 2)
    );
    console.info("ROADMAP_PROVIDER_SMOKE", JSON.stringify(summary));
    expect(attempts.length).toBeLessThanOrEqual(
      ROADMAP_PROVIDER_CALL_BUDGET + EXPANSION_PROVIDER_CALL_BUDGET
    );
  },
  220_000
);
