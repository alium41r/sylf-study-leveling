"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EffortRangeV2Schema = exports.PolicyV2Schema = exports.RemainingMinutesV2Schema = exports.TimeboxV2Schema = exports.CriterionV2Schema = exports.SummaryV2Schema = exports.ProseV2Schema = exports.TitleV2Schema = exports.TimezoneV2Schema = exports.DateV2Schema = exports.InstantV2Schema = exports.DigestV2Schema = exports.LocalIdV2Schema = exports.EntityIdV2Schema = exports.DurableIdV2Schema = exports.VersionV2Schema = void 0;
exports.issue = issue;
exports.unique = unique;
exports.validateDag = validateDag;
const zod_1 = require("zod");
const envelope_1 = require("./envelope");
exports.VersionV2Schema = zod_1.z.literal(2);
exports.DurableIdV2Schema = zod_1.z.string().uuid();
exports.EntityIdV2Schema = zod_1.z.number().int().positive();
/** Local IDs/allowlisted aliases are not database identities or mutation commands. */
exports.LocalIdV2Schema = zod_1.z.string().min(1).max(64).regex(/^[a-z][a-z0-9_-]*$/);
exports.DigestV2Schema = zod_1.z.string().regex(/^[a-f0-9]{64}$/);
exports.InstantV2Schema = zod_1.z.iso.datetime({ offset: true });
exports.DateV2Schema = zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}, "Invalid civil date");
exports.TimezoneV2Schema = zod_1.z.string().min(1).max(100).refine(value => {
    try {
        new Intl.DateTimeFormat("en", { timeZone: value });
        return true;
    }
    catch {
        return false;
    }
}, "Invalid IANA timezone");
exports.TitleV2Schema = zod_1.z.string().trim().min(1).max(envelope_1.PLANNER_V2_ENVELOPE.titleCharacters);
exports.ProseV2Schema = zod_1.z.string().trim().min(1).max(envelope_1.PLANNER_V2_ENVELOPE.proseCharacters);
exports.SummaryV2Schema = zod_1.z.string().trim().min(1).max(envelope_1.PLANNER_V2_ENVELOPE.summaryCharacters);
exports.CriterionV2Schema = zod_1.z.string().trim().min(1).max(envelope_1.PLANNER_V2_ENVELOPE.criterionCharacters);
exports.TimeboxV2Schema = zod_1.z.number().int().min(envelope_1.PLANNER_V2_ENVELOPE.timeboxMinMinutes).max(envelope_1.PLANNER_V2_ENVELOPE.timeboxMaxMinutes);
exports.RemainingMinutesV2Schema = zod_1.z.number().int().min(0).max(envelope_1.PLANNER_V2_ENVELOPE.timeboxMaxMinutes);
exports.PolicyV2Schema = zod_1.z.enum(["EXAM", "ROADMAP", "MASTERY", "GENERAL"]);
exports.EffortRangeV2Schema = zod_1.z.strictObject({
    lowMinutes: zod_1.z.number().int().nonnegative(),
    likelyMinutes: zod_1.z.number().int().nonnegative(),
    highMinutes: zod_1.z.number().int().nonnegative(),
}).superRefine((v, ctx) => {
    if (v.lowMinutes > v.likelyMinutes || v.likelyMinutes > v.highMinutes) {
        issue(ctx, ["likelyMinutes"], "Effort estimates must be ordered low <= likely <= high");
    }
});
function issue(ctx, path, message) {
    ctx.addIssue({ code: "custom", path, message });
}
function unique(values, ctx, path) {
    const seen = new Set();
    values.forEach((value, i) => {
        if (seen.has(value))
            issue(ctx, [...path, i], "DUPLICATE_REFERENCE");
        seen.add(value);
    });
}
/** Local structural validation only; ownership is verified against a supplied registry. */
function validateDag(nodes, ctx, path) {
    const graph = new Map(nodes.map(node => [node.id, node.dependencies]));
    const visited = new Set();
    const active = new Set();
    function walk(id) {
        if (active.has(id))
            return true;
        if (visited.has(id))
            return false;
        active.add(id);
        for (const dependency of graph.get(id) ?? []) {
            if (graph.has(dependency) && walk(dependency))
                return true;
        }
        active.delete(id);
        visited.add(id);
        return false;
    }
    if (nodes.some(node => walk(node.id)))
        issue(ctx, path, "DEPENDENCY_CYCLE");
}
