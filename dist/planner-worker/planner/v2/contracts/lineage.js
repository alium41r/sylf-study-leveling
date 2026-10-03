"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QuestLineageV2Schema = void 0;
exports.validateLineageTransitionV2 = validateLineageTransitionV2;
const zod_1 = require("zod");
const primitives_1 = require("./primitives");
/** Evolves the existing QuestLink; remaining disposition belongs to the execution overlay. */
exports.QuestLineageV2Schema = zod_1.z.strictObject({
    schemaVersion: primitives_1.VersionV2Schema,
    linkId: primitives_1.DurableIdV2Schema,
    ownerId: primitives_1.EntityIdV2Schema,
    planId: primitives_1.DurableIdV2Schema,
    activityKey: primitives_1.DurableIdV2Schema,
    questId: primitives_1.EntityIdV2Schema.nullable(),
    createdRevisionId: primitives_1.DurableIdV2Schema,
    appliedRevisionId: primitives_1.DurableIdV2Schema,
    baselineSpecDigest: primitives_1.DigestV2Schema,
    disposition: zod_1.z.enum(["LIVE", "DETACHED", "DELETED", "USER_RELEASED"]),
    removedAt: primitives_1.InstantV2Schema.nullable(),
}).superRefine((link, ctx) => {
    if (link.disposition === "LIVE" && (link.questId === null || link.removedAt !== null))
        (0, primitives_1.issue)(ctx, [], "Live lineage requires its Quest and no removal marker");
    if (link.disposition === "DETACHED" && link.questId === null)
        (0, primitives_1.issue)(ctx, [], "Legacy detached lineage retains its Quest");
    if (["DELETED", "USER_RELEASED"].includes(link.disposition) && (link.questId !== null || link.removedAt === null))
        (0, primitives_1.issue)(ctx, [], "Removed lineage requires a tombstone without a live Quest");
});
function validateLineageTransitionV2(before, after) {
    const errors = [];
    for (const key of ["linkId", "ownerId", "planId", "activityKey", "createdRevisionId", "baselineSpecDigest"]) {
        if (before[key] !== after[key])
            errors.push(`LINEAGE_IDENTITY_IMMUTABLE:${key}`);
    }
    if (["USER_RELEASED", "DELETED"].includes(before.disposition) && JSON.stringify(before) !== JSON.stringify(after))
        errors.push("TOMBSTONE_PERMANENT");
    if (before.disposition === "LIVE" && after.disposition === "LIVE" && before.questId !== after.questId)
        errors.push("LIVE_QUEST_IDENTITY_IMMUTABLE");
    // A reoffer has a new reviewed activity identity. It never resurrects this tombstone.
    return errors;
}
