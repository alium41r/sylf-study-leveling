// @vitest-environment node
import { it, expect } from "vitest";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import {
  REBALANCE_PROVIDER_CALL_BUDGET,
  generateRebalance,
  type RebalanceGenerationArgs,
} from "@/lib/ai/planner/rebalance";
import { LLMFactory, type LLMProviderName } from "@/lib/ai/providers/factory";
import type { LLMResponse } from "@/lib/ai/providers/types";
import { normalizeProposal } from "@/lib/planner/server/core";
import { executionSnapshot } from "@/lib/planner/rebalance-policy";
import { rebalanceFrozenViews } from "@/lib/planner/rebalance-scope";
import {
  frozenGenerationViews,
  unitGenerationViews,
} from "@/lib/planner/server/rebalance-run";
import { normalizeExpansion } from "@/lib/planner/server/core";
import { expansionDays, expansionScope } from "@/lib/planner/expansion-policy";
import { roadmapInput, periodSpecsFor } from "@/lib/planner/roadmap-policy";
import { examAvailability, examFixture, examProposal } from "./exam-fixtures";
import {
  masteryAvailability,
  masteryFixture,
  masteryProposal,
} from "./mastery-fixtures";
import {
  roadmapAvailability,
  roadmapFixture,
  roadmapProposal,
} from "./roadmap-fixtures";

/**
 * Bounded live smoke for user-approved replanning.
 *
 * Opt-in only (`PLANNER_PROVIDER_SMOKE=true`), synthetic content only, and never a
 * database: it drives the real provider path through the shared bounded pipeline and
 * reports provider availability, call counts, validator outcome, critic outcome and
 * the shape of the proposed revision. Rules are never weakened to make it pass.
 */
/**
 * The frozen history a replan really receives.
 *
 * Phase 5's smoke hand-rolled these objects and they did not match `FrozenItemView`:
 * the stage sat in `stage` where the Mastery validator reads `masteryStage`, and `key`,
 * `title`, `description` and `relatedTopicRefs` were absent. A fixture defect was then
 * recorded as a model-convergence failure. Building them with the production builder
 * removes that whole class of false evidence.
 */
function frozenHistory(
  input: Parameters<typeof rebalanceFrozenViews>[0],
  draft: Parameters<typeof rebalanceFrozenViews>[1],
  items: { key: string; date: string; minutes: number }[]
): RebalanceGenerationArgs["frozen"] {
  const execution = executionSnapshot(
    items.map((item, index) => ({
      itemKey: item.key,
      questId: index + 1,
      disposition: "LIVE",
      status: "COMPLETED",
      scheduledFor: item.date,
      requiredMinutes: item.minutes,
      elapsedSeconds: item.minutes * 60,
      completedAt: `${item.date}T10:00:00.000Z`,
      sessions: 1,
      activeSession: false,
    })),
    items[0]?.date ?? "2030-01-01"
  );
  // The production builder, so this fixture can never drift from the currency the
  // generator and the validators actually exchange.
  return frozenGenerationViews(input, draft, execution);
}

const scenarios: { name: string; build: () => RebalanceGenerationArgs }[] = [
  {
    name: "exam-remaining-work",
    build: () => {
      const input = examFixture();
      const draft = normalizeProposal(input, examProposal());
      // The first two items are treated as already done: a realistic mid-plan replan.
      const scopeRef = (topicKey: string) =>
        draft.topics.find((topic) => topic.key === topicKey)?.scopeRef ?? "t1";
      const frozen = frozenHistory(input, draft, draft.items.slice(0, 2));
      return {
        input,
        baseDraft: draft,
        availability: examAvailability(),
        reason: "OVERDUE_WORK",
        inputChanges: ["AVAILABILITY"],
        // The production builder: the unit facts (covered, required/forbidden intents)
        // are part of the contract the model is judged against, and hand-rolling them
        // here is how a covered unit once looked uncovered to the model.
        units: unitGenerationViews(input, frozen, draft, null),
        eligible: draft.items.slice(2).map((item, index) => ({
          ref: `r${index + 1}`,
          itemKey: item.key,
          title: item.title,
          topicRef: scopeRef(item.topicKey),
          topicLabel: input.exam!.topics[0].label,
          type: item.type,
          stage: item.stage ?? null,
          masteryStage: item.masteryStage ?? null,
          date: item.date,
          minutes: item.minutes,
        })),
        frozen,
        kind: "EXAM",
      };
    },
  },
  {
    name: "mastery-remaining-stages",
    build: () => {
      const input = masteryFixture();
      const draft = normalizeProposal(input, masteryProposal(input));
      // Orientation and learning are done; recall, practice and the check are not.
      const done = draft.items.filter(
        (item) =>
          item.masteryStage === "UNDERSTAND" || item.masteryStage === "LEARN"
      );
      const remaining = draft.items.filter(
        (item) => !done.some((entry) => entry.key === item.key)
      );
      const label = (topicKey: string) =>
        draft.topics.find((topic) => topic.key === topicKey)?.title ?? "";
      const frozen = frozenHistory(input, draft, done);
      return {
        input,
        baseDraft: draft,
        availability: masteryAvailability(),
        reason: "MASTERY_CHECK_NEEDS_WORK",
        inputChanges: [],
        units: unitGenerationViews(input, frozen, draft, null),
        eligible: remaining.map((item, index) => ({
          ref: `r${index + 1}`,
          itemKey: item.key,
          title: item.title,
          topicRef:
            draft.topics.find((topic) => topic.key === item.topicKey)?.scopeRef ??
            "t1",
          topicLabel: label(item.topicKey),
          type: item.type,
          // A mastery item carries masteryStage, not stage: the entry a replan keeps
          // must say the same thing the validator will read back.
          stage: null,
          masteryStage: item.masteryStage ?? null,
          date: item.date,
          minutes: item.minutes,
        })),
        frozen,
        kind: "MASTERY",
      };
    },
  },
  {
    name: "roadmap-period-revision",
    build: () => {
      const input = roadmapFixture();
      const parent = normalizeProposal(
        input,
        roadmapProposal(input)
      ) as Extract<ReturnType<typeof normalizeProposal>, { mode: "ROADMAP" }>;
      const milestone = parent.milestones[0];
      const roadmap = roadmapInput(input);
      const scope = expansionScope(parent, milestone.key, roadmap);
      const items = [
        {
          ref: "i1",
          topicRef: scope.topics[0].ref,
          relatedTopicRefs: [],
          dependsOn: [],
          type: "LEARN" as const,
          title: `${scope.topics[0].label} walkthrough`,
          description: "Work through the planned material for this period.",
          rationale: "First pass before practice.",
          completionCriteria: "Complete the planned reading and note open questions.",
          date: scope.period.startDate,
          minutes: 45,
        },
        {
          ref: "i2",
          topicRef: scope.topics[0].ref,
          relatedTopicRefs: [],
          dependsOn: ["i1"],
          type: "PRACTICE" as const,
          title: `${scope.topics[0].label} practice`,
          description: "Work a bounded practice set on the period's unit.",
          rationale: "Practice after the first pass.",
          completionCriteria: "Complete one bounded practice set and review the errors.",
          date: scope.period.endDate,
          minutes: 45,
        },
      ];
      const expanded = normalizeExpansion(roadmap, parent, scope, items);
      const days = expansionDays(roadmap, roadmapAvailability(), scope);
      return {
        input,
        baseDraft: expanded,
        availability: roadmapAvailability(),
        reason: "USER_REQUESTED",
        inputChanges: [],
        units: scope.topics.map((topic) => ({
          ref: topic.ref,
          label: topic.label,
        })),
        eligible: expanded.items.map((item, index) => ({
          ref: `r${index + 1}`,
          itemKey: item.key,
          title: item.title,
          topicRef: scope.topics[0].ref,
          topicLabel: scope.topics[0].label,
          type: item.type,
          stage: null,
          masteryStage: null,
          date: item.date,
          minutes: item.minutes,
        })),
        frozen: [],
        period: { scope, days },
        kind: "ROADMAP_PERIOD",
      };
    },
  },
];

it.skipIf(process.env.PLANNER_PROVIDER_SMOKE !== "true")(
  "controlled synthetic replanning provider smoke across three modes",
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
    let workload = "rebalance";
    // The rejected proposal itself is the evidence a prompt fix needs: a bare code
    // says a rule failed, the returned shape says why.
    let lastShape: Record<string, unknown> | null = null;
    let lastRaw: string | null = null;
    const shapeOf = (text: string | undefined) => {
      try {
        const parsed = JSON.parse(text ?? "") as {
          mode?: string;
          topics?: unknown[];
          milestones?: unknown[];
          items?: { masteryStage?: unknown; stage?: unknown; type?: unknown }[];
        };
        return {
          mode: parsed.mode ?? null,
          topics: parsed.topics?.length ?? 0,
          milestones: parsed.milestones?.length ?? 0,
          items: parsed.items?.length ?? 0,
          firstItemKeys: parsed.items?.[0] ? Object.keys(parsed.items[0]) : [],
          stages: [
            ...new Set(
              (parsed.items ?? []).map(
                (item) => `${String(item.masteryStage ?? item.stage ?? "NONE")}:${String(item.type)}`
              )
            ),
          ].slice(0, 8),
        };
      } catch {
        return { unparsed: (text ?? "").slice(0, 120) };
      }
    };
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
            if (workload === "rebalance") {
              lastShape = shapeOf(response.text);
              // Synthetic fixtures only: the raw text is kept so a rejected proposal
              // can be replayed offline instead of guessed at.
              lastRaw = (response.text ?? "").slice(0, 12_000);
            }
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
      const args = scenario.build();
      workload = "rebalance";
      const started = Date.now();
      try {
        const generated = await generateRebalance(
          args,
          {
            adapter: wrapped as never,
            validationFailure: (code) => validationCodes.push(code),
            usage: (_provider, _model, _usage, stage) => {
              workload =
                stage === "rebalance_critic"
                  ? "rebalance_critic"
                  : stage === "rebalance_repair"
                    ? "rebalance_repair"
                    : "rebalance";
            },
            semantic: {
              criticAdapter: wrapped as never,
              repairAdapter: wrapped as never,
              deadlineAt: Date.now() + 90_000,
            },
          },
          new AbortController().signal
        );
        const proposal = generated.proposal;
        // The mode's own rules already ran inside the pipeline; these are the shape
        // facts the report needs.
        // A strategic revision carries milestones; every other kind carries items.
        const items =
          proposal.mode === "ROADMAP" && proposal.milestones.length
            ? proposal.milestones
            : proposal.items;
        const retained = items.filter(
          (item) => (item as { retainRef?: string }).retainRef !== undefined
        ).length;
        results.push({
          scenario: scenario.name,
          proposed: items.length,
          eligible: args.eligible.length,
          frozen: args.frozen.length,
          retained,
          replaced: items.length - retained,
          calls: generated.calls,
          critic: generated.review.critic,
          issues: generated.review.issues,
          repaired: generated.review.repaired,
          latencyMs: Date.now() - started,
        });
        expect(generated.calls).toBeLessThanOrEqual(REBALANCE_PROVIDER_CALL_BUDGET);
      } catch (error) {
        const e = error as { code?: string; message?: string };
        validationCodes.push(e.code ?? e.message ?? "UNKNOWN");
        results.push({
          scenario: scenario.name,
          state: "REJECTED",
          code: e.code,
          returned: lastShape,
          raw: lastRaw,
          latencyMs: Date.now() - started,
        });
      }
    }
    mkdirSync("scratch", { recursive: true });
    writeFileSync(
      "scratch/rebalance-provider-smoke.json",
      JSON.stringify(
        { configured, results, attempts, validationCodes, at: new Date().toISOString() },
        null,
        2
      )
    );
    expect(configured.deepseek || configured.gemini).toBe(true);
    expect(results).toHaveLength(scenarios.length);
    for (const result of results) expect(result).toHaveProperty("scenario");
    void periodSpecsFor;
  },
  600_000
);
