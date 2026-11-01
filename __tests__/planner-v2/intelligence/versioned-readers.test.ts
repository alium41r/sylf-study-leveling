import { describe, expect, it } from "vitest";
import { attemptFixture, digest, id } from "../contracts/fixtures";
import { checkpointAttempt, checkpointFixture } from "./fixtures";
import { foundationFixture } from "./foundation-fixtures";
import { readRetainedBundle, readVersionedArtifacts } from "@/lib/planner/v2/intelligence/foundation/readers";
import { artifactRef, sealIntelligenceBundle, strategyDocument } from "@/lib/planner/v2/intelligence/foundation/validation";
import { readCompilerVersion } from "@/lib/planner/v2/server/compiler-version";
import { readCompilerCheckpoint, readHistoricalCompilerCheckpoint } from "@/lib/planner/v2/intelligence/checkpoints";
import { hash } from "@/lib/planner/v2/server/database";

describe("version-pinned historical readers", () => {
  it("reads legacy core data without inventing strategy or quality metadata", () => {
    const checkpoint = { useful: true }, attempt = attemptFixture();
    attempt.checkpoint = { stage: "PREFLIGHT", digest: hash("checkpoint", checkpoint), persistedAt: attempt.requestedAt };
    expect(readVersionedArtifacts({ compilerVersion: 1, attempt, archive: null, checkpoint })).toMatchObject({ compilerVersion: 1, kind: "LEGACY_CORE", checkpoint: attempt.checkpoint });
    expect(() => readVersionedArtifacts({ compilerVersion: 1, attempt, archive: null, checkpoint: { useful: false } })).toThrow("DIGEST_MISMATCH");
    expect(() => readVersionedArtifacts({ compilerVersion: 1, attempt, archive: null, checkpoint: null })).toThrow("DIGEST_MISMATCH");
  });
  it("retains v1 checkpoints and keeps historical integrity distinct from live freshness", () => {
    const checkpoint = checkpointFixture(), attempt = checkpointAttempt(checkpoint);
    expect(readVersionedArtifacts({ compilerVersion: 1, attempt, archive: null, checkpoint })).toMatchObject({ compilerVersion: 1, kind: "LEGACY_COMPILER", checkpoint });
    expect(readHistoricalCompilerCheckpoint(checkpoint, attempt).ok).toBe(true);
    expect(readCompilerCheckpoint(checkpoint, attempt, { ...checkpoint.binding, envelopeDigest: digest("b") })).toEqual({ ok: false, reason: "STALE_COMPILER_BINDING" });
    if (!("blueprints" in checkpoint.payload)) throw new Error();
    checkpoint.payload.blueprints.plans[0].blueprint.strategy.explanation += " Tampered.";
    expect(readHistoricalCompilerCheckpoint(checkpoint, attempt)).toEqual({ ok: false, reason: "CHECKPOINT_DIGEST_MISMATCH" });
  });
  it("rejects unknown versions and cross-version interpretation", () => {
    for (const version of [0, 3, null, undefined, "2"]) expect(() => readCompilerVersion(version)).toThrow();
    expect(() => readVersionedArtifacts({ compilerVersion: 1, attempt: attemptFixture(), archive: foundationFixture().archive, checkpoint: null })).toThrow("VERSION_MISMATCH");
    expect(() => readVersionedArtifacts({ compilerVersion: 2, attempt: attemptFixture(), archive: null, checkpoint: checkpointFixture() })).toThrow("VERSION_MISMATCH");
  });
  it("keeps the sealed strategy, translation and review when a later draft exists", () => {
    const f = foundationFixture(), bundle = sealIntelligenceBundle(f.archive, f.binding, artifactRef(f.review), f.canonical);
    if (f.strategy.kind !== "STRATEGY") throw new Error();
    f.add("STRATEGY", strategyDocument({ ...f.strategy.value, parent: artifactRef(f.strategy), version: 2, text: "A later unreviewed draft." }));
    const read = readRetainedBundle(bundle, f.archive);
    expect(read.strategies.map(s => s.id)).toEqual([f.strategy.id]);
    expect(read.strategies[0].value.text).toBe(f.strategy.value.text);
    expect(read.translation.id).toBe(f.translation.id); expect(read.review.id).toBe(f.review.id);
  });
  it("rejects tampered, missing, future-version and differently bound bundles", () => {
    const f = foundationFixture(), bundle = sealIntelligenceBundle(f.archive, f.binding, artifactRef(f.review), f.canonical);
    expect(() => readRetainedBundle({ ...bundle, schemaVersion: 2 }, f.archive)).toThrow();
    expect(() => readRetainedBundle({ ...bundle, archiveAttemptId: id(999) }, f.archive)).toThrow("DIGEST");
    delete f.archive.entries[f.translation.id];
    expect(() => readRetainedBundle(bundle, f.archive)).toThrow("CORRESPONDENCE");
  });
  it("reads an empty v2 operation and rejects foreign archive envelopes", () => {
    expect(readVersionedArtifacts({ compilerVersion: 2, attempt: attemptFixture(), archive: null, checkpoint: null })).toMatchObject({ compilerVersion: 2, kind: "AI_FIRST", checkpoint: null, recovery: "RESUME_STAGE" });
    expect(() => readVersionedArtifacts({ compilerVersion: 2, attempt: { ...attemptFixture(), ownerId: 777 }, archive: foundationFixture().archive, checkpoint: null })).toThrow("OWNER_MISMATCH");
  });
});
