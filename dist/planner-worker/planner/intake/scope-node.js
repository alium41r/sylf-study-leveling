"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SCOPE_NODE_KINDS_SCHEMA = exports.ScopeNodeSchema = exports.SCOPE_NODE_KINDS = void 0;
const zod_1 = require("zod");
/**
 * One scope unit, and the only definition of it in the tree.
 *
 * This lives in its own module because two layers need the shape and neither may
 * depend on the other: the Plan Brief (the student's confirmed setup) and the research
 * contract (a candidate awaiting confirmation). Keeping the node here means the
 * candidate schema never has to import the brief, so there is no import cycle — and,
 * more importantly, it means a candidate is built from *the same* node type the engine
 * will eventually receive, so confirmation is a copy rather than a translation.
 */
exports.SCOPE_NODE_KINDS = ["SECTION", "CHAPTER", "TOPIC"];
exports.ScopeNodeSchema = zod_1.z.strictObject({
    nodeId: zod_1.z.string().min(1).max(60),
    label: zod_1.z.string().trim().min(1).max(200),
    kind: zod_1.z.enum(exports.SCOPE_NODE_KINDS),
    parentId: zod_1.z.string().max(60).nullable(),
    /** Selected nodes become engine units (directly, or via their chapter). */
    selected: zod_1.z.boolean(),
    /**
     * Public sources that support this node, by source id.
     *
     * Optional and bounded: a researched node cites the pages it came from, a unit the
     * student typed cites nothing, and an old stored scope parses unchanged. Provenance
     * is display-only — the engine never sees it.
     */
    sourceIds: zod_1.z.array(zod_1.z.string().min(1).max(60)).max(4).optional(),
});
exports.SCOPE_NODE_KINDS_SCHEMA = zod_1.z.enum(exports.SCOPE_NODE_KINDS);
