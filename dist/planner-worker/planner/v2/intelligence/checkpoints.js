"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readCompilerCheckpoint = readCompilerCheckpoint;
const database_1 = require("../server/database");
const checkpoint_1 = require("./schemas/checkpoint");
/** Node-only boundary. Expected bindings must be rebuilt by trusted repositories,
 * never copied from this checkpoint or accepted from a client/model response. */
function readCompilerCheckpoint(value, attempt, expected) {
    const parsed = checkpoint_1.CompilerCheckpointSchema.safeParse(value);
    if (!parsed.success || !checkpoint_1.CompilerBindingSchema.safeParse(expected).success)
        return { ok: false, reason: "MALFORMED_CHECKPOINT" };
    const checkpoint = parsed.data;
    if (!attempt.checkpoint || attempt.checkpoint.stage !== checkpoint.payload.stage || attempt.checkpoint.digest !== (0, database_1.hash)("checkpoint", value))
        return { ok: false, reason: "CHECKPOINT_DIGEST_MISMATCH" };
    const binding = checkpoint.binding;
    if (binding.attemptId !== attempt.attemptId || binding.ownerId !== attempt.ownerId || binding.requestHash !== attempt.requestHash ||
        binding.rootRequestId !== attempt.budget.rootRequestId || binding.targetAuthorizationDigest !== attempt.acceptedRequest.targetAuthorizationDigest ||
        binding.targets.length !== attempt.targets.length || binding.targets.some(target => {
        const selected = attempt.targets.find(value => value.planId === target.planId);
        return !selected || Object.keys(selected).some(key => Reflect.get(target, key) !== Reflect.get(selected, key));
    }))
        return { ok: false, reason: "ATTEMPT_BINDING_MISMATCH" };
    if ((0, database_1.hash)("compiler-binding", binding) !== (0, database_1.hash)("compiler-binding", expected))
        return { ok: false, reason: "STALE_COMPILER_BINDING" };
    const payload = checkpoint.payload;
    if ("envelope" in payload && (0, database_1.hash)("scheduling-envelope", payload.envelope) !== binding.envelopeDigest)
        return { ok: false, reason: "ARTIFACT_DIGEST_MISMATCH" };
    if (payload.research) {
        const sources = payload.research.selectedSources.map(({ sourceId, contentHash }) => ({ sourceId, contentHash }));
        if ((0, database_1.hash)("research-source-pins", sources) !== (0, database_1.hash)("research-source-pins", binding.sourceDigests))
            return { ok: false, reason: "ARTIFACT_DIGEST_MISMATCH" };
    }
    else if (binding.sourceDigests.length)
        return { ok: false, reason: "ARTIFACT_DIGEST_MISMATCH" };
    if ("blueprints" in payload && payload.blueprints.plans.some(plan => (0, database_1.hash)("blueprint", plan.blueprint) !== plan.digest))
        return { ok: false, reason: "ARTIFACT_DIGEST_MISMATCH" };
    if ("allocation" in payload && (0, database_1.hash)("allocation", payload.allocation.report) !== payload.allocation.digest)
        return { ok: false, reason: "ARTIFACT_DIGEST_MISMATCH" };
    if ("quality" in payload && payload.quality.some(value => {
        const target = binding.targets.find(target => target.planRef === value.planRef);
        const blueprint = payload.blueprints.plans.find(plan => plan.planRef === value.planRef).blueprint;
        return value.report.evidenceDigest !== target.qualityEvidenceDigest || value.report.educationalContentDigest !== (0, database_1.hash)("educational-content", { blueprint, externalDependencies: target.context.externalActivityDependencies });
    }))
        return { ok: false, reason: "ARTIFACT_DIGEST_MISMATCH" };
    return { ok: true, checkpoint };
}
