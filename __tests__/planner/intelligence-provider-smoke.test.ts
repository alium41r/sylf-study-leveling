// @vitest-environment node
import { it, expect } from "vitest";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import {
  EXAM_PROVIDER_CALL_BUDGET,
  EXAM_SEMANTIC_BUDGET_MS,
  EXAM_TIMEOUT_MS,
  generateExam,
  withCompletionCriteria,
  type AdapterFactory,
} from "@/lib/ai/planner/exam";
import { CRITIC_MAX_ISSUES, runCritic } from "@/lib/ai/planner/critic";
import { runRepair, repairTargets } from "@/lib/ai/planner/repair";
import { LLMFactory, type LLMProviderName } from "@/lib/ai/providers/factory";
import type { LLMResponse } from "@/lib/ai/providers/types";
import { completionCriteriaIssue } from "@/lib/planner/done";
import { examFixture, examAvailability, examProposal } from "./exam-fixtures";
import { validateExamProposal } from "@/lib/planner/exam-policy";

/**
 * Bounded A1 live-provider smoke. Opt-in only; records availability and outcomes
 * without printing credentials or model content.
 */
it.skipIf(process.env.PLANNER_PROVIDER_SMOKE !== "true")(
  "controlled synthetic A1 provider smoke across generation, critic and repair",
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
      finishReason?: string;
      totalTokens?: number;
    }[] = [];
    /** Validator codes only: fixed enums, never provider or academic content. */
    const validationCodes: string[] = [];
    const wrapped: AdapterFactory = (provider: LLMProviderName, model: string) => {
      const adapter = LLMFactory.getAdapter(provider, model);
      return {
        async generateResponse(...args: Parameters<typeof adapter.generateResponse>) {
          const attempt: (typeof attempts)[number] = {
            provider,
            model,
            workload: "unknown",
            state: "REQUESTED",
          };
          attempts.push(attempt);
          try {
            const response: LLMResponse = await adapter.generateResponse(...args);
            attempt.state = "RESPONSE";
            if (response.finishReason) attempt.finishReason = response.finishReason;
            if (response.usage) attempt.totalTokens = response.usage.totalTokens;
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
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), EXAM_TIMEOUT_MS);
    const summary: Record<string, unknown> = {
      configured,
      attempts,
      syntheticOnly: true,
      databaseWrites: false,
      budget: {
        providerCalls: EXAM_PROVIDER_CALL_BUDGET,
        semanticMs: EXAM_SEMANTIC_BUDGET_MS,
      },
    };
    try {
      if (configured.deepseek || configured.gemini) {
        const result = await generateExam(
          examFixture(),
          examAvailability(),
          controller.signal,
          {
            adapter: wrapped,
            validationFailure: (code) => {
              if (/^[A-Z_]+$/.test(code) && validationCodes.length < 24)
                validationCodes.push(code);
            },
            usage: (provider, model, _usage, workload) => {
              const attempt = attempts
                .filter((entry) => entry.provider === provider && entry.model === model)
                .at(-1);
              if (attempt) attempt.workload = workload;
            },
            semantic: {
              criticAdapter: wrapped,
              repairAdapter: wrapped,
              deadlineAt: started + EXAM_TIMEOUT_MS,
            },
          }
        );
        summary.outcome = "VALIDATED";
        summary.critic = result.review.critic;
        summary.issues = result.review.issues;
        summary.repaired = result.review.repaired;
        summary.deterministicIssues = result.review.deterministicIssues;
        summary.softViolations = result.review.softViolations;
        summary.providerCalls = result.calls;
        summary.items = result.proposal.items.length;
        summary.everyItemHasBoundedDone = result.proposal.items.every(
          (item) =>
            item.completionCriteria !== undefined &&
            completionCriteriaIssue(item.completionCriteria, item) === null
        );
        summary.criticIssueLimitRespected = result.review.issues <= CRITIC_MAX_ISSUES * 60;
        expect(result.calls).toBeLessThanOrEqual(EXAM_PROVIDER_CALL_BUDGET);
        expect(result.proposal).toEqual(withCompletionCriteria(result.proposal));
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
    summary.elapsedMs = Date.now() - started;
    mkdirSync("/tmp/sylf-planner-phase2_5", { recursive: true });
    writeFileSync(
      "/tmp/sylf-planner-phase2_5/provider-smoke.json",
      JSON.stringify(summary, null, 2)
    );
    console.info("A1_PROVIDER_SMOKE", JSON.stringify(summary));
    expect(attempts.length).toBeLessThanOrEqual(EXAM_PROVIDER_CALL_BUDGET);
  },
  115_000
);

/**
 * The critic and the targeted repair are separate provider contracts; they are
 * verified on a plan the deterministic gates already accept, so a generator
 * outage cannot mask whether the semantic stage itself works live.
 */
it.skipIf(process.env.PLANNER_PROVIDER_SMOKE !== "true")(
  "controlled synthetic A1 critic and repair smoke on a validated plan",
  async () => {
    for (const file of [".env.local", ".env"])
      if (existsSync(file)) process.loadEnvFile(file);
    const summary: Record<string, unknown> = { syntheticOnly: true, databaseWrites: false };
    const started = Date.now();
    const input = examFixture();
    const proposal = withCompletionCriteria(examProposal());
    validateExamProposal(input, proposal, examAvailability());
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), EXAM_TIMEOUT_MS);
    try {
      const adapter = LLMFactory.getAdapter("gemini", "gemini-2.5-flash");
      const critic = await runCritic(adapter, input, proposal, controller.signal);
      summary.criticState = critic.state;
      summary.criticIssues = critic.issues.length;
      summary.criticIssueCodes = critic.issues.map((issue) => issue.issueCode);
      if (critic.issues.length) {
        const targets = repairTargets(proposal, critic.issues);
        const patch = await runRepair(
          adapter,
          input,
          proposal,
          critic.issues,
          controller.signal
        );
        summary.repairState = patch.state;
        summary.repairReason = patch.reason;
        summary.repairTargets = targets.length;
        if (patch.state === "APPLIED" && patch.proposal) {
          try {
            validateExamProposal(input, patch.proposal, examAvailability());
            summary.repairedPlanStillValid = true;
            const changed = patch.proposal.items.filter(
              (item, index) => item.description !== proposal.items[index].description
            ).length;
            summary.regeneratedItems = changed;
          } catch {
            summary.repairedPlanStillValid = false;
          }
        }
      } else {
        summary.repairState = "NOT_REQUIRED";
      }
    } catch (error) {
      summary.outcome = "UNAVAILABLE";
      summary.errorCode =
        error instanceof Error && /^[A-Z_]+$/.test(error.message)
          ? error.message
          : "PROVIDER_FAILURE";
    } finally {
      clearTimeout(timer);
    }
    summary.elapsedMs = Date.now() - started;
    mkdirSync("/tmp/sylf-planner-phase2_5", { recursive: true });
    writeFileSync(
      "/tmp/sylf-planner-phase2_5/critic-smoke.json",
      JSON.stringify(summary, null, 2)
    );
    console.info("A1_CRITIC_SMOKE", JSON.stringify(summary));
    expect(true).toBe(true);
  },
  115_000
);
