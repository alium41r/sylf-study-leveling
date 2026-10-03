import { z } from "zod";
import { PLANNER_V2_ENVELOPE as E } from "./envelope";

export const VersionV2Schema = z.literal(2);
export const DurableIdV2Schema = z.string().uuid();
export const EntityIdV2Schema = z.number().int().positive();
/** Local IDs/allowlisted aliases are not database identities or mutation commands. */
export const LocalIdV2Schema = z.string().min(1).max(64).regex(/^[a-z][a-z0-9_-]*$/);
export const DigestV2Schema = z.string().regex(/^[a-f0-9]{64}$/);
export const InstantV2Schema = z.iso.datetime({ offset: true });
export const DateV2Schema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}, "Invalid civil date");
export const TimezoneV2Schema = z.string().min(1).max(100).refine(value => {
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
}, "Invalid IANA timezone");
export const TitleV2Schema = z.string().trim().min(1).max(E.titleCharacters);
export const ProseV2Schema = z.string().trim().min(1).max(E.proseCharacters);
export const SummaryV2Schema = z.string().trim().min(1).max(E.summaryCharacters);
export const CriterionV2Schema = z.string().trim().min(1).max(E.criterionCharacters);
export const TimeboxV2Schema = z.number().int().min(E.timeboxMinMinutes).max(E.timeboxMaxMinutes);
export const RemainingMinutesV2Schema = z.number().int().min(0).max(E.timeboxMaxMinutes);
export const PolicyV2Schema = z.enum(["EXAM", "ROADMAP", "MASTERY", "GENERAL"]);
export const EffortRangeV2Schema = z.strictObject({
  lowMinutes: z.number().int().nonnegative(),
  likelyMinutes: z.number().int().nonnegative(),
  highMinutes: z.number().int().nonnegative(),
}).superRefine((v, ctx) => {
  if (v.lowMinutes > v.likelyMinutes || v.likelyMinutes > v.highMinutes) {
    issue(ctx, ["likelyMinutes"], "Effort estimates must be ordered low <= likely <= high");
  }
});

export function issue(ctx: z.RefinementCtx, path: (string | number)[], message: string) {
  ctx.addIssue({ code: "custom", path, message });
}

export function unique(values: readonly string[], ctx: z.RefinementCtx, path: (string | number)[]) {
  const seen = new Set<string>();
  values.forEach((value, i) => {
    if (seen.has(value)) issue(ctx, [...path, i], "DUPLICATE_REFERENCE");
    seen.add(value);
  });
}

/** Local structural validation only; ownership is verified against a supplied registry. */
export function validateDag(
  nodes: readonly { id: string; dependencies: readonly string[] }[],
  ctx: z.RefinementCtx,
  path: (string | number)[],
) {
  const graph = new Map(nodes.map(node => [node.id, node.dependencies]));
  const visited = new Set<string>();
  const active = new Set<string>();
  function walk(id: string): boolean {
    if (active.has(id)) return true;
    if (visited.has(id)) return false;
    active.add(id);
    for (const dependency of graph.get(id) ?? []) {
      if (graph.has(dependency) && walk(dependency)) return true;
    }
    active.delete(id); visited.add(id); return false;
  }
  if (nodes.some(node => walk(node.id))) issue(ctx, path, "DEPENDENCY_CYCLE");
}
