import { z } from "zod";
import { SCOPE_NODE_KINDS, ScopeNodeSchema, type ScopeNode } from "./scope-node";
import { DateKeySchema, LIMITS, ModeSchema } from "../contracts";
import {
  PlannerConstraintsSchema,
  PlannerQuestionReasonSchema,
} from "../constraints";
import { TopicPrioritySchema, TopicPrioritySourceSchema } from "../priority";
import { isCoverageStated, isConfidenceStated, isPreparednessStated } from "../preparedness";
import { ScopeCandidateSchema } from "../research/contracts";
import { CurriculumComparisonSchema, OverlapCorrectionSchema } from "../comparison/contracts";
import { ConfirmedScopeSourceSchema } from "../research/contracts";

/**
 * The Plan Brief — the pre-generation source of truth a student reviews before a
 * plan exists.
 *
 * It is deliberately NOT a `PlannerRevision`: it is mutable working state that
 * lives in an intake session (never in a sealed snapshot, never in Quest
 * metadata), and it converts *once*, deterministically, into the engine's
 * existing `UserInputV1` when the student asks for a draft.
 *
 * Three properties matter more than the field list:
 *
 * 1. **Strict and bounded.** Every field is bounded, unknown keys are rejected,
 *    and the brief is size-checked on write so a session cannot grow without limit.
 * 2. **Sparse preparedness.** Only units the student actually answered appear in
 *    `preparedness`, and each answer is nullable: silence stays silence, and the
 *    policy in `lib/planner/preparedness.ts` decides what silence means per rule.
 * 3. **Hierarchy-preserving.** Scope is a bounded tree, while the engine needs a
 *    flat list of unique labels; `flattenScope` performs that translation and
 *    keeps the tree and the mapping for review and traceability.
 */

export const BRIEF_LIMITS = {
  /** Tree nodes, containers included. */
  scopeNodes: 200,
  /** Tree depth: Section → Chapter → Topic. */
  scopeDepth: 3,
  /** Provenance references a brief may point at (research is a later phase). */
  provenanceRefs: 8,
  /** Recent conversation turns retained with the session (Phase 4). */
  recentTurns: 12,
  /** Bounded assumptions shown as "what Sylf assumed". */
  assumptions: 20,
  /** Subjects a background qualification may list. */
  backgroundSubjects: 20,
  /** Units whose overlap the student has corrected. */
  overlapCorrections: 50,
  /** Serialized brief size ceiling, enforced on write. */
  briefBytes: 65536,
} as const;

/** Where a value came from. Lower levels may never overwrite higher ones. */
export const BRIEF_AUTHORITIES = [
  "USER_CURRENT",
  "USER_CONFIRMED_BRIEF",
  "RESEARCH_CONFIRMED",
  "SYLF_DATA",
  "LEARNED_SOFT",
  "MODEL_SUGGESTION",
] as const;
export const BriefAuthoritySchema = z.enum(BRIEF_AUTHORITIES);
export type BriefAuthority = (typeof BRIEF_AUTHORITIES)[number];

/** Fields whose provenance is worth tracking individually. */
export const BRIEF_AUTHORITY_FIELDS = [
  "goal",
  "subject",
  "targetDate",
  "scope",
  "budget",
  "backgroundCurriculum",
] as const;
export type BriefAuthorityField = (typeof BRIEF_AUTHORITY_FIELDS)[number];

// The node shape is defined once, in its own module, so the research contract can use
// it without importing the brief (which would be a cycle). Re-exported here because
// every existing caller imports it from the brief.
export {
  SCOPE_NODE_KINDS,
  ScopeNodeSchema,
  type ScopeNode,
} from "./scope-node";

export const SCOPE_SOURCES = [
  "USER_MANUAL",
  "RESEARCH_CONFIRMED",
  "IMPORT_CONFIRMED",
  "SYLF_SUBJECT",
] as const;
export const ScopeSourceSchema = z.enum(SCOPE_SOURCES);
export type ScopeSource = (typeof SCOPE_SOURCES)[number];

/** One unit's preparedness, present only when the student said something. */
export const BriefPreparednessSchema = z.strictObject({
  nodeId: z.string().min(1).max(60),
  covered: z.boolean().nullable(),
  confidence: z.number().int().min(1).max(5).nullable(),
  difficult: z.boolean().nullable(),
  priority: TopicPrioritySchema.optional(),
  prioritySource: TopicPrioritySourceSchema.optional(),
});
export type BriefPreparedness = z.infer<typeof BriefPreparednessSchema>;

export const READINESS_STATES = [
  "NEEDS_CORE_INFO",
  "RESEARCH_AVAILABLE",
  "NEEDS_SCOPE_CONFIRMATION",
  "READY_FOR_DRAFT",
  "ADVANCED_REFINEMENT_AVAILABLE",
] as const;
export const ReadinessStateSchema = z.enum(READINESS_STATES);
export type ReadinessState = (typeof READINESS_STATES)[number];

/** Closed list of what is still missing before a first draft. */
export const CORE_REQUIREMENT_CODES = [
  "GOAL_MISSING",
  "SCOPE_MISSING",
  "SCOPE_UNCONFIRMED",
  "TARGET_DATE_MISSING",
  "CAPACITY_MISSING",
] as const;
export const CoreRequirementCodeSchema = z.enum(CORE_REQUIREMENT_CODES);
export type CoreRequirementCode = (typeof CORE_REQUIREMENT_CODES)[number];

export const PlanBriefV1Schema = z
  .strictObject({
    schemaVersion: z.literal(1),
    mode: ModeSchema,

    goal: z.strictObject({
      /**
       * An empty title means "not stated yet", which is the normal state of a brief
       * the student is still filling in — so it must be *representable* here rather
       * than enforced by the schema. Requiring a non-empty title made the empty
       * brief invalid against its own schema, which is how a stored brief could
       * silently fail to parse and be read back as empty. Readiness is what requires
       * a real title, and it reports `GOAL_MISSING` until one exists.
       */
      title: z.string().trim().max(200),
      objective: z.string().trim().max(500).optional(),
    }),

    subject: z.strictObject({
      /**
       * `null` means the student has not stated a subject yet — a third state beside
       * "picked one from Sylf" and "typed one", not a fourth flavour of either. The
       * empty brief must be valid against this schema, so "unstated" has to be
       * expressible rather than encoded as a free-text subject with no name.
       */
      kind: z.enum(["SYLF_SUBJECT", "FREE_TEXT"]).nullable(),
      subjectId: z.number().int().positive().nullable(),
      name: z.string().trim().min(1).max(200).nullable(),
    }),

    target: z.strictObject({
      /** Horizon end. For EXAM this equals the exam date. */
      endDate: DateKeySchema.nullable(),
      examDate: DateKeySchema.nullable(),
    }),

    budget: z.strictObject({
      /** Target budget for THIS plan. Never an account-wide setting. */
      weeklyMinutes: z.number().int().min(0).max(10080).nullable(),
      /** Explicit per-weekday minutes; a stated day wins over the distribution. */
      dailyOverrides: z
        .array(z.number().int().min(0).max(720).nullable())
        .length(7)
        .nullable(),
      blockedDates: z.array(DateKeySchema).max(366),
      recoveryPercent: z.number().int().min(0).max(50).nullable(),
      acceptReducedReserve: z.boolean(),
      /** The last server-computed distribution, for display and audit. */
      distribution: z
        .strictObject({
          dailyMinutes: z.array(z.number().int().min(0).max(720)).length(7),
          note: z.string().max(300),
          computedAt: z.string().max(40),
        })
        .nullable()
        .optional(),
    }),

    /**
     * The curriculum the student studied *before* the target — the input to comparison.
     *
     * Optional, and optional at every level: `label` is the qualification ("CAIE
     * A-Level"), `board` and `level` are the two facts that make an official source
     * recognisable at all, and `subjects` are what the student names when the
     * qualification covers several. Free text is deliberate at this layer — a student
     * whose system is not in Sylf's registry must not be forced into an enum — while
     * `board`/`level` keep the registry's vocabulary when they do pick from it.
     *
     * Backwards compatible by construction: `subjects` is optional and absent means
     * "none named", so a brief stored before this field existed parses unchanged.
     */
    backgroundCurriculum: z
      .strictObject({
        label: z.string().trim().min(1).max(200),
        level: z.string().trim().max(60).nullable(),
        board: z.string().trim().max(60).nullable(),
        subjects: z.array(z.string().trim().min(1).max(120)).max(BRIEF_LIMITS.backgroundSubjects).optional(),
      })
      .nullable(),

    scope: z.strictObject({
      source: ScopeSourceSchema,
      confirmedAt: z.string().max(40).nullable(),
      provenanceRefs: z.array(z.string().max(60)).max(BRIEF_LIMITS.provenanceRefs),
      /**
       * The source records `provenanceRefs` names, kept with the confirmation.
       *
       * `confirmScope` clears the candidate the scope came from, so without this the
       * confirmed refs would point at records that no longer exist anywhere — a dangling
       * reference rather than provenance. The snapshot is taken at confirmation, from the
       * candidate's own records, and is never rewritten afterwards: a later research run
       * produces a new candidate and leaves this alone, and a new confirmation replaces it
       * wholesale. `default([])` keeps every brief stored before Phase 3.1 parsing
       * unchanged; an old scope with refs but no snapshot reads as "no source retained",
       * which is the truth about it rather than something to invent.
       */
      provenanceSources: z.array(ConfirmedScopeSourceSchema).max(BRIEF_LIMITS.provenanceRefs).default([]),
      nodes: z.array(ScopeNodeSchema).max(BRIEF_LIMITS.scopeNodes),
      /**
       * Units the student removed, by label.
       *
       * Kept so that research cannot quietly put back what a person took out: a later
       * candidate containing one of these arrives with that unit unselected and says so,
       * which is the difference between a suggestion and an undo. Bounded, and compared
       * case-insensitively.
       */
      removedLabels: z.array(z.string().trim().min(1).max(200)).max(50),
    }),

    /**
     * A researched or imported scope, awaiting the student's decision.
     *
     * It lives *beside* `scope`, never inside it, and that separation is the whole
     * safety property of Phase 2: `flattenScope`, the adapters and every readiness rule
     * read `scope.nodes`, so an unconfirmed candidate is structurally incapable of
     * reaching generation. Confirmation copies chosen nodes into `scope.nodes`; nothing
     * else ever does.
     */
    scopeCandidate: ScopeCandidateSchema.nullable(),

    /**
     * "Use only what I give you" — the student's standing answer about external lookup.
     *
     * Persisted, so a later mount cannot decide on its own to search the web for
     * someone who has already said not to.
     */
    researchPolicy: z.enum(["ALLOW", "OFF"]),

    /**
     * The curriculum comparison, and the student's corrections to it.
     *
     * Stored on the brief rather than quarantined like `scopeCandidate`, and the
     * difference is deliberate: a candidate *can* reach the engine, so it must be
     * confirmed first; a comparison cannot reach the engine at all. Overlap is
     * display-only — the engine never receives it — and the only path from a curriculum
     * statement into the plan is preparedness, which is written solely by an explicit
     * user action. `default(null)` / `default([])` keep every brief stored before Phase
     * 3 parsing unchanged.
     */
    comparison: CurriculumComparisonSchema.nullable().default(null),
    overlapCorrections: z.array(OverlapCorrectionSchema).max(BRIEF_LIMITS.overlapCorrections).default([]),

    preparedness: z.array(BriefPreparednessSchema).max(BRIEF_LIMITS.scopeNodes),

    constraints: PlannerConstraintsSchema,

    unresolved: z
      .array(
        z.strictObject({
          code: PlannerQuestionReasonSchema,
          promptKey: z.string().max(60),
        })
      )
      .max(3),

    assumptions: z.array(z.string().trim().max(300)).max(BRIEF_LIMITS.assumptions),

    /** Per-field provenance, so a lower authority can never silently win. */
    authority: z.record(z.string().max(40), BriefAuthoritySchema).optional(),

    /**
     * Bounded receipt ring of applied action keys.
     *
     * Actions that *add* to state (adding scope units, for example) would double up
     * if a client retried after a lost response, so the server records the keys it
     * has already applied and replays the prior result instead of applying again.
     * The ring is bounded, so a long intake cannot grow it without limit.
     */
    appliedActions: z.array(z.string().min(1).max(80)).max(40).optional(),

    readiness: ReadinessStateSchema,
  })
  .superRefine((brief, ctx) => {
    if (brief.mode === "EXAM" && brief.target.examDate && brief.target.endDate !== brief.target.examDate)
      ctx.addIssue({
        code: "custom",
        message: "An exam plan's horizon must end on the exam date",
      });
    if (brief.subject.kind === "SYLF_SUBJECT" && brief.subject.subjectId === null)
      ctx.addIssue({ code: "custom", message: "A Sylf subject needs its id" });
    if (brief.subject.kind === "FREE_TEXT" && !brief.subject.name)
      ctx.addIssue({ code: "custom", message: "A free-text subject needs a name" });
    if (brief.subject.kind === null && (brief.subject.subjectId !== null || brief.subject.name !== null))
      ctx.addIssue({ code: "custom", message: "An unstated subject carries no value" });
  });
export type PlanBriefV1 = z.infer<typeof PlanBriefV1Schema>;

/** A brief for a mode with nothing stated yet. */
export function emptyBrief(mode: PlanBriefV1["mode"]): PlanBriefV1 {
  return {
    schemaVersion: 1,
    mode,
    goal: { title: "" },
    subject: { kind: null, subjectId: null, name: null },
    target: { endDate: null, examDate: null },
    budget: {
      weeklyMinutes: null,
      dailyOverrides: null,
      blockedDates: [],
      recoveryPercent: null,
      acceptReducedReserve: false,
      distribution: null,
    },
    backgroundCurriculum: null,
    comparison: null,
    overlapCorrections: [],
    scope: {
      source: "USER_MANUAL",
      confirmedAt: null,
      provenanceRefs: [],
      provenanceSources: [],
      nodes: [],
      removedLabels: [],
    },
    scopeCandidate: null,
    researchPolicy: "ALLOW",
    preparedness: [],
    constraints: [],
    unresolved: [],
    assumptions: [],
    authority: {},
    readiness: "NEEDS_CORE_INFO",
  };
}

export const serializedBriefBytes = (brief: unknown): number => {
  const json = JSON.stringify(brief);
  return json ? new TextEncoder().encode(json).byteLength : 0;
};

/** Structural checks a schema cannot express: depth, orphans, duplicate ids. */
export function scopeStructureIssue(nodes: readonly ScopeNode[]): string | null {
  const byId = new Map(nodes.map((node) => [node.nodeId, node]));
  if (byId.size !== nodes.length) return "DUPLICATE_SCOPE_NODE";
  for (const node of nodes) {
    if (node.parentId && !byId.has(node.parentId)) return "UNKNOWN_SCOPE_PARENT";
    let depth = 1;
    let cursor: ScopeNode | undefined = node;
    const seen = new Set<string>([node.nodeId]);
    while (cursor?.parentId) {
      const parent: ScopeNode | undefined = byId.get(cursor.parentId);
      if (!parent) return "UNKNOWN_SCOPE_PARENT";
      if (seen.has(parent.nodeId)) return "SCOPE_CYCLE";
      seen.add(parent.nodeId);
      depth += 1;
      if (depth > BRIEF_LIMITS.scopeDepth) return "SCOPE_TOO_DEEP";
      cursor = parent;
    }
  }
  return null;
}

export interface FlattenedUnit {
  /** Engine-facing label: unique, order-preserving, disambiguated if needed. */
  label: string;
  /** The node this unit represents (a topic, or a chapter standing in for its children). */
  nodeId: string;
  /** The node's own label, which is what the student sees. */
  displayLabel: string;
  coarsened: boolean;
}

export interface FlattenResult {
  units: FlattenedUnit[];
  /** Engine-ready scope string, exactly `units.map(u => u.label).join("\n")`. */
  scope: string;
  /** One segment for a representable scope; more only when coarsening was not enough. */
  segments: { labels: string[]; nodeIds: string[] }[];
  /** How the scope was made to fit, for the UI to explain honestly. */
  strategy: "TOPIC_UNITS" | "CHAPTER_UNITS" | "SEGMENTED";
  /** Total selected leaves, before any coarsening — the traceability count. */
  leafCount: number;
}

const depthFirst = (nodes: readonly ScopeNode[]): ScopeNode[] => {
  const byParent = new Map<string | null, ScopeNode[]>();
  for (const node of nodes) {
    const key = node.parentId ?? null;
    byParent.set(key, [...(byParent.get(key) ?? []), node]);
  }
  const out: ScopeNode[] = [];
  const walk = (parentId: string | null) => {
    for (const node of byParent.get(parentId) ?? []) {
      out.push(node);
      walk(node.nodeId);
    }
  };
  walk(null);
  return out;
};

/**
 * Flatten the brief's tree into engine planning units.
 *
 * The large-scope rule (UX Phase 1 review amendment) is implemented here:
 *
 * 1. selected **topics** become units; a container with selected descendants but no
 *    selected topic of its own becomes a single unit;
 * 2. if that exceeds the engine's unit cap, **coarsen** — a chapter replaces its
 *    selected children as one unit, which is how a fine-grained syllabus becomes a
 *    meaningful chapter-level plan;
 * 3. only if the coarsened scope still cannot be represented do we **segment**,
 *    contiguously and in order;
 * 4. nothing is ever truncated or merged across unrelated chapters to hit a number,
 *    and the detailed child nodes stay in the brief for review and traceability.
 */
export function flattenScope(
  nodes: readonly ScopeNode[],
  options: { unitCap?: number } = {}
): FlattenResult {
  const cap = options.unitCap ?? LIMITS.topics;
  if (!nodes.length)
    return {
      units: [],
      scope: "",
      segments: [],
      strategy: "TOPIC_UNITS",
      leafCount: 0,
    };

  const ordered = depthFirst(nodes);
  const byId = new Map(ordered.map((node) => [node.nodeId, node]));
  const selected = ordered.filter((node) => node.selected);
  const leaves = selected.filter((node) => node.kind === "TOPIC");

  const hasSelectedDescendant = (node: ScopeNode) =>
    selected.some((other) => other.nodeId !== node.nodeId && isDescendant(byId, other, node.nodeId));
  const chapterHasSelectedTopic = (node: ScopeNode) =>
    leaves.some((leaf) => isDescendant(byId, leaf, node.nodeId));

  // Pass 1 — topic units, with containers standing in where they have no selected leaf.
  const topicUnits: FlattenedUnit[] = [];
  for (const node of ordered) {
    if (!node.selected) continue;
    if (node.kind === "TOPIC") {
      topicUnits.push({ label: node.label, nodeId: node.nodeId, displayLabel: node.label, coarsened: false });
      continue;
    }
    if (hasSelectedDescendant(node) && !chapterHasSelectedTopic(node))
      topicUnits.push({ label: node.label, nodeId: node.nodeId, displayLabel: node.label, coarsened: false });
  }

  if (topicUnits.length <= cap)
    return finish(topicUnits, leaves.length, "TOPIC_UNITS");

  // Pass 2 — chapter units: each selected container stands in for its topic children.
  const chapterUnits: FlattenedUnit[] = [];
  for (const node of ordered) {
    if (!node.selected) continue;
    if (node.kind === "TOPIC") {
      // A topic whose ancestor is selected is represented by that ancestor instead.
      if (selected.some((other) => other.kind !== "TOPIC" && isDescendant(byId, node, other.nodeId)))
        continue;
      chapterUnits.push({ label: node.label, nodeId: node.nodeId, displayLabel: node.label, coarsened: true });
      continue;
    }
    if (hasSelectedDescendant(node) || chapterHasSelectedTopic(node))
      chapterUnits.push({ label: node.label, nodeId: node.nodeId, displayLabel: node.label, coarsened: true });
  }
  const coarsened = chapterUnits.length ? chapterUnits : topicUnits;
  if (coarsened.length <= cap)
    return finish(coarsened, leaves.length, "CHAPTER_UNITS");

  // Pass 3 — segment contiguously; nothing is dropped.
  const segments: { labels: string[]; nodeIds: string[] }[] = [];
  for (let index = 0; index < coarsened.length; index += cap) {
    const slice = coarsened.slice(index, index + cap);
    segments.push({ labels: slice.map((unit) => unit.label), nodeIds: slice.map((unit) => unit.nodeId) });
  }
  const first = coarsened.slice(0, cap);
  const units = disambiguate(first, byId);
  return {
    units,
    scope: units.map((unit) => unit.label).join("\n"),
    segments,
    strategy: "SEGMENTED",
    leafCount: leaves.length,
  };

  function finish(
    raw: FlattenedUnit[],
    leafCount: number,
    strategy: FlattenResult["strategy"]
  ): FlattenResult {
    const units = disambiguate(raw, byId);
    return {
      units,
      scope: units.map((unit) => unit.label).join("\n"),
      segments: [{ labels: units.map((unit) => unit.label), nodeIds: units.map((unit) => unit.nodeId) }],
      strategy,
      leafCount,
    };
  }
}

const isDescendant = (
  byId: Map<string, ScopeNode>,
  node: ScopeNode,
  ancestorId: string
): boolean => {
  let cursor: ScopeNode | undefined = node;
  const seen = new Set<string>();
  while (cursor?.parentId) {
    if (cursor.parentId === ancestorId) return true;
    if (seen.has(cursor.parentId)) return false;
    seen.add(cursor.parentId);
    cursor = byId.get(cursor.parentId);
  }
  return false;
};

/**
 * Make engine labels unique without changing what the student sees.
 *
 * The engine rejects duplicate labels (`DUPLICATE_SCOPE_TOPIC`) and requires
 * `scope === labels.join("\n")`, so a collision is qualified with its parent —
 * `"Parent · Child"` — and, failing that, the grandparent. Only when the ancestor
 * chain cannot separate two units (same label, same or no parent) does a numeric
 * suffix appear, because `"Cells (2)"` tells the student nothing while
 * `"Cell biology · Cells"` tells them which Cells this is.
 *
 * `displayLabel` keeps the original wording for the UI, and the mapping back to
 * nodes keeps review and the Coverage Map able to regroup.
 */
function disambiguate(units: FlattenedUnit[], byId: ReadonlyMap<string, ScopeNode>): FlattenedUnit[] {
  const used = new Set<string>();
  const claim = (unit: FlattenedUnit, label: string): FlattenedUnit => {
    used.add(label.toLowerCase());
    return { ...unit, label };
  };
  /** The unit's label prefixed with up to `ancestors` ancestor labels. */
  const qualified = (unit: FlattenedUnit, ancestors: number): string => {
    const names = [unit.label];
    let cursor = byId.get(unit.nodeId);
    for (let step = 0; step < ancestors && cursor?.parentId; step += 1) {
      const parent = byId.get(cursor.parentId);
      if (!parent) break;
      names.unshift(parent.label);
      cursor = parent;
    }
    const label = names.join(" · ");
    // The engine's label bound is 200 characters; a deep path never silently
    // produces an over-long label, it falls back to a suffix instead.
    return label.length <= 200 ? label : unit.label;
  };
  return units.map((unit) => {
    if (!used.has(unit.label.toLowerCase())) return claim(unit, unit.label);
    for (const depth of [1, 2]) {
      const candidate = qualified(unit, depth);
      if (candidate !== unit.label && !used.has(candidate.toLowerCase())) return claim(unit, candidate);
    }
    const base = qualified(unit, 2);
    for (let suffix = 2; suffix <= 4; suffix += 1) {
      const candidate = `${base} (${suffix})`;
      if (!used.has(candidate.toLowerCase())) return claim(unit, candidate);
    }
    return claim(unit, `${base} (${used.size + 1})`);
  });
}

/** Preparedness lookup for a node, or undefined when the student said nothing. */
export function preparednessFor(
  brief: PlanBriefV1,
  nodeId: string
): BriefPreparedness | undefined {
  return brief.preparedness.find((entry) => entry.nodeId === nodeId);
}

/** Counts for the brief panel and the assumption note; never labels. */
export function briefSummary(brief: PlanBriefV1, nodes = brief.scope.nodes) {
  const flat = flattenScope(nodes);
  const stated = brief.preparedness.filter((entry) => isPreparednessStated(entry));
  return {
    units: flat.units.length,
    leaves: flat.leafCount,
    strategy: flat.strategy,
    segments: flat.segments.length,
    preparednessStated: stated.length,
    coverageStated: brief.preparedness.filter((entry) => isCoverageStated(entry)).length,
    confidenceStated: brief.preparedness.filter((entry) => isConfidenceStated(entry)).length,
    constraints: brief.constraints.length,
    unresolved: brief.unresolved.length,
  };
}

/**
 * Authority check for a proposed write.
 *
 * A lower authority may only fill a field nothing has claimed; a higher one always
 * wins. The caller records the conflict so the UI can explain what it ignored
 * rather than silently dropping the student's input.
 */
export function mayApplyAuthority(
  current: BriefAuthority | undefined,
  incoming: BriefAuthority
): boolean {
  if (!current) return true;
  return BRIEF_AUTHORITIES.indexOf(incoming) <= BRIEF_AUTHORITIES.indexOf(current);
}
