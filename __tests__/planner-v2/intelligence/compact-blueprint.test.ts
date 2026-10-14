// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  blueprintInstruction, blueprintRequest, blueprintResponseContract,
  compactBlueprintInstruction, validateCompactLearningProposal, validateLearningProposal,
} from '@/lib/planner/v2/intelligence/blueprint';
import { CompactBlueprintProposalSchema, compactBlueprintResponseContract } from '@/lib/planner/v2/intelligence/schemas/blueprint-response';
import { boundedProviderInput } from '@/lib/planner/v2/intelligence/provider';
import { PLANNER_V2_ENVELOPE as E, plannerSerializedBytes } from '@/lib/planner/v2/contracts';
import { compactProposal } from './compact-blueprint-fixture';
import { planningFixture } from './planning-fixtures';

const wire = (f: ReturnType<typeof planningFixture>) => CompactBlueprintProposalSchema.parse(compactProposal(f.response));
const mapped = (f: ReturnType<typeof planningFixture>, adaptation = false) => validateCompactLearningProposal(wire(f), f.input, adaptation);

describe('compact educational blueprint and deterministic canonical assembly', () => {
  it('preserves every educational capability and owned retained work exactly', () => {
    const f = planningFixture([45, 20, 10, 30]);
    const b = f.response.plans[0].blueprint;
    b.strategy.phases[0].effort = { lowMinutes: 50, likelyMinutes: 70, highMinutes: 95 };
    b.strategy.phases[0].readinessCriterion = 'Explain and apply the circuit law without hints.';
    const kept = b.activities.shift()!;
    f.input.plans[0].kept = [kept];
    f.input.plans[0].keptPhases = b.strategy.phases;
    b.strategy.phases = [{ localId: 'transfer', title: 'Changed circuit', outcome: 'Independent method transfer' }];
    f.input.plans[0].allowed = { scopeRefs: ['scope_electricity', 'secure', 'check', 'later', 'excluded'],
      excludedScopeRefs: ['excluded'], evidenceRefs: ['assessed_1'], resourceRefs: ['source_1'], externalActivityRefs: ['external_1'] };
    f.input.plans[0].readiness = new Map([['secure', ['assessed_1']]]);
    b.scope.push(
      { scopeRef: 'secure', disposition: 'CREDITED', contribution: 'Already independently demonstrated', reason: 'Owned assessment result', evidenceRefs: ['assessed_1'] },
      { scopeRef: 'check', disposition: 'VERIFY_FIRST', contribution: 'Resolve conflicting readiness evidence' },
      { scopeRef: 'later', disposition: 'DEFERRED', contribution: 'Later transfer outcome', reason: 'Beyond the next checkpoint' },
      { scopeRef: 'excluded', disposition: 'EXCLUDED', contribution: 'Removed by the accepted request', reason: 'Explicit exclusion' },
    );
    b.activities[0].commitment = { category: 'OPTIONAL', reason: 'Only if the student wants further exploration' };
    b.activities[1].commitment = { category: 'CONTINGENT', trigger: { checkpointActivityId: kept.localId, condition: 'An independently checked law-selection error' } };
    Object.assign(b.activities[2], {
      outcomeRefs: ['transfer'], hardDependencies: [kept.localId], advisoryOrderAfter: ['external_1'],
      resourceRefs: ['source_1'], evidenceRefs: ['assessed_1'], stage: 'Transfer', cognitiveDemand: 'HEAVY',
      stoppingCondition: 'Stop once the changed circuit is solved and explained correctly.',
      instructions: 'Use the original "quoted" method.\nاختر قانوناً مناسباً; do not replace the input dataset.',
      splitPoints: [{ afterMinutes: 10, completionCriterion: 'Choose and justify the law' }, { afterMinutes: 20, completionCriterion: 'Solve the specified circuit' }],
      learningWindow: { anchorActivityId: 'external_1', minimumGapDays: 0, preferredGapDays: 1, maximumGapDays: 3, strength: 'ADVISORY', reason: 'Allow a useful retention check' },
    });
    b.decisions = { assumptions: ['Prior teaching is uncertain'], tradeOffs: ['Defer later scope'],
      unresolvedUncertainty: ['Assessment weights are unknown'], stoppingConditions: ['A correct independent changed application'] };
    const before = structuredClone(f.input), expected = validateLearningProposal(f.response, f.input), result = mapped(f);
    expect(result).toEqual(expected);
    expect(f.input).toEqual(before);
    if (result.decision !== 'REVISE') throw new Error('Replacement required');
    expect(result.snapshot.plans[0].blueprint.activities[0]).toEqual(kept);
    expect(result.unreviewedPhaseRefs).toEqual([{ planRef: 'physics', phaseRef: 'phase_practice' }]);
    expect(result.snapshot.plans[0].blueprint.strategy.phases[1]).not.toHaveProperty('effort');
  });

  it('supplies only accepted policy/version and permits zero education with honest explicit decisions', () => {
    const f = planningFixture([]);
    f.input.plans[0].intent.policy = 'GENERAL';
    f.response.plans[0].blueprint.strategy.policy = 'GENERAL';
    f.response.plans[0].blueprint.strategy.recommendedEffort = { lowMinutes: 0, likelyMinutes: 0, highMinutes: 0 };
    f.response.plans[0].blueprint.strategy.phases = [];
    f.response.plans[0].blueprint.scope[0] = { scopeRef: 'scope_electricity', disposition: 'DEFERRED', contribution: 'Retain the requested outcome strategically', reason: 'No new activities were authorized' };
    const result = mapped(f);
    expect(result).toEqual(validateLearningProposal(f.response, f.input));
    if (result.decision !== 'REVISE') throw new Error();
    expect(result.snapshot.plans[0].blueprint).toMatchObject({ schemaVersion: 2, strategy: { policy: 'GENERAL' }, activities: [] });
  });

  it('preserves joint ownership, shared edges and carried edges without minting identities', () => {
    const f = planningFixture([20]);
    const second = structuredClone(f.response.plans[0]);
    second.planRef = 'maths'; second.blueprint.activities[0].localId = 'transfer';
    second.blueprint.activities[0].instructions = 'Apply the learned law to the specified second circuit.';
    f.response.plans.push(second);
    f.input.plans = [...f.input.plans, { ...f.input.plans[0], planRef: 'maths' }];
    f.response.sharedDependencies = [{ prerequisite: { planRef: 'physics', activityId: 'work_0' }, dependent: { planRef: 'maths', activityId: 'transfer' }, strength: 'HARD', reason: 'One owner for the necessary shared method' }];
    expect(mapped(f)).toEqual(validateLearningProposal(f.response, f.input));
    f.input.sharedDependencies = f.response.sharedDependencies; f.response.sharedDependencies = [];
    expect(mapped(f)).toEqual(validateLearningProposal(f.response, f.input));
  });

  it('keeps adaptation decisions explicit and applies the existing recovery restrictions', () => {
    const f = planningFixture();
    expect(() => validateCompactLearningProposal({ decision: 'KEEP', reason: 'Required work cannot be reduced' }, f.input)).toThrow();
    expect(validateCompactLearningProposal({ decision: 'KEEP', reason: 'Required work cannot be reduced' }, f.input, true)).toEqual({ decision: 'KEEP', reason: 'Required work cannot be reduced' });
    f.envelope.recoveryPercent = 15;
    const revised = { ...wire(f), recoveryAdjustment: { percent: 5, reason: 'An explicit soft-margin trade-off' } };
    expect(() => validateCompactLearningProposal(revised, f.input)).toThrow(/Only adaptation/);
    expect(validateCompactLearningProposal(revised, f.input, true).decision).toBe('REVISE');
    expect(() => validateCompactLearningProposal({ ...revised, recoveryAdjustment: { ...revised.recoveryAdjustment, percent: 20 } }, f.input, true)).toThrow();
  });

  it('keeps complete scope, phases and the joint 60-new/400-total boundary', () => {
    const f = planningFixture(Array(30).fill(5));
    const b = f.response.plans[0].blueprint;
    b.scope = Array.from({ length: E.scopeNodes }, (_, i) => ({ scopeRef: i === 0 ? 'scope_electricity' : `scope_${i}`, disposition: 'INCLUDED', contribution: 'A specific part of the requested strategic outcome' }));
    b.strategy.phases = Array.from({ length: E.milestones }, (_, i) => ({ localId: i === 0 ? 'phase_practice' : `phase_${i}`, title: `Outcome ${i}`, outcome: `Demonstrate capability ${i}`, effort: { lowMinutes: 5, likelyMinutes: 10, highMinutes: 20 } }));
    const kept = Array.from({ length: 170 }, (_, i) => ({ ...structuredClone(b.activities[0]), localId: `kept_${i}` }));
    f.input.plans[0].allowed.scopeRefs = b.scope.map(s => s.scopeRef); f.input.plans[0].kept = kept;
    const second = structuredClone(f.response.plans[0]); second.planRef = 'maths';
    f.response.plans.push(second); f.input.plans = [...f.input.plans, { ...f.input.plans[0], planRef: 'maths' }];
    const result = mapped(f);
    expect(result).toEqual(validateLearningProposal(f.response, f.input));
    if (result.decision !== 'REVISE') throw new Error();
    expect(result.snapshot.plans.map(p => [p.blueprint.activities.length, p.blueprint.scope.length, p.blueprint.strategy.phases.length])).toEqual([[200, 500, 100], [200, 500, 100]]);
    f.response.plans[0].blueprint.activities.push({ ...b.activities[0], localId: 'excess' });
    expect(() => mapped(f)).toThrow(/bounded/);
  });

  it.each([
    ['echoed schemaVersion', (v: ReturnType<typeof wire>) => Object.assign(v.plans[0], { schemaVersion: 2 })],
    ['echoed policy', (v: ReturnType<typeof wire>) => Object.assign(v.plans[0].strategy, { policy: 'GENERAL' })],
    ['canonical wrapper', (v: ReturnType<typeof wire>) => Object.assign(v.plans[0], { blueprint: {} })],
    ['derived receipt', (v: ReturnType<typeof wire>) => Object.assign(v.plans[0], { digest: 'a'.repeat(64) })],
    ['REVISE marker', (v: ReturnType<typeof wire>) => Object.assign(v, { decision: 'REVISE' })],
    ['scalar reference', (v: ReturnType<typeof wire>) => Object.assign(v.plans[0].activities[0], { resourceRefs: 'source_1' })],
    ['missing educational contribution', (v: ReturnType<typeof wire>) => Object.assign(v.plans[0].scope[0], { contribution: undefined })],
    ['missing explicit decisions', (v: ReturnType<typeof wire>) => Object.assign(v.plans[0], { decisions: undefined })],
    ['missing estimate', (v: ReturnType<typeof wire>) => Object.assign(v.plans[0].activities[0], { effort: undefined })],
    ['null optional field', (v: ReturnType<typeof wire>) => Object.assign(v.plans[0].activities[0], { stoppingCondition: null })],
    ['unordered estimate', (v: ReturnType<typeof wire>) => { v.plans[0].activities[0].effort = [30, 10, 20]; }],
    ['fractional estimate', (v: ReturnType<typeof wire>) => { v.plans[0].activities[0].effort = [1, 2.5, 3]; }],
    ['short estimate', (v: ReturnType<typeof wire>) => Object.assign(v.plans[0].activities[0], { effort: [10, 20] })],
    ['unknown phase', (v: ReturnType<typeof wire>) => { v.plans[0].activities[0].outcomeRefs = ['invented']; }],
    ['self dependency', (v: ReturnType<typeof wire>) => { v.plans[0].activities[0].hardDependencies = ['work_0']; }],
    ['unknown resource', (v: ReturnType<typeof wire>) => { v.plans[0].activities[0].resourceRefs = ['invented']; }],
    ['invented credit', (v: ReturnType<typeof wire>) => Object.assign(v.plans[0].scope[0], { disposition: 'CREDITED', reason: 'Self-report', evidenceRefs: ['invented'] })],
    ['empty consequence reason', (v: ReturnType<typeof wire>) => { v.plans[0].scope[0].disposition = 'DEFERRED'; }],
    ['unselected Plan', (v: ReturnType<typeof wire>) => { v.plans[0].planRef = 'unselected'; }],
    ['duplicate target', (v: ReturnType<typeof wire>) => { v.plans.push(structuredClone(v.plans[0])); }],
    ['unowned dependency', (v: ReturnType<typeof wire>) => { v.plans[0].activities[0].hardDependencies = ['invented']; }],
    ['invalid day-gap order', (v: ReturnType<typeof wire>) => { v.plans[0].activities[0].learningWindow = { anchorActivityId: 'external_1', minimumGapDays: 3, maximumGapDays: 1, strength: 'HARD', reason: 'A retention check' }; }],
  ])('rejects %s through transport or canonical authority', (_, mutate) => {
    const f = planningFixture(), v = wire(f); mutate(v);
    expect(() => validateCompactLearningProposal(v, f.input)).toThrow();
  });

  it('retains canonical exclusion, credit evidence and protected content checks after transport parsing', () => {
    const f = planningFixture();
    f.input.plans[0].allowed.excludedScopeRefs = ['scope_electricity'];
    expect(() => mapped(f)).toThrow(/EXPLICIT_EXCLUSION/);
    f.input.plans[0].allowed.excludedScopeRefs = [];
    f.input.plans[0].kept = f.response.plans[0].blueprint.activities;
    expect(() => mapped(f)).toThrow(/overwrite/);
    f.input.plans[0].kept = [];
    f.input.plans[0].keptPhases = structuredClone(f.response.plans[0].blueprint.strategy.phases);
    f.response.plans[0].blueprint.strategy.phases[0].title = 'Changed protected phase';
    expect(() => mapped(f)).toThrow(/Retained phase/);
    f.input.plans[0].keptPhases = [];
    f.input.plans[0].allowed.evidenceRefs = ['owned_self_report'];
    Object.assign(f.response.plans[0].blueprint.scope[0], { disposition: 'CREDITED', reason: 'Confidence', evidenceRefs: ['owned_self_report'] });
    expect(() => mapped(f)).toThrow(/scoped demonstrated-readiness/);
  });

  it('keeps one schema-owned field inventory with stage-specific adaptation guidance', () => {
    const contract = compactBlueprintResponseContract(['physics']);
    expect(contract.objects.plan.required).toEqual(['planRef', 'strategy', 'scope', 'activities', 'decisions']);
    expect(contract.objects.strategy.required).not.toContain('policy');
    expect(contract.objects.root.optional).toEqual([]);
    expect(contract.objects.activity.optional).toEqual(blueprintResponseContract(planningFixture().input).objects.activity.optional);
    expect(contract.objects).not.toHaveProperty('blueprint');
    expect(compactBlueprintInstruction()).not.toContain('ADAPTATION is available');
    expect(compactBlueprintInstruction(true)).toContain('ADAPTATION is available');
    expect(compactBlueprintInstruction(true)).not.toContain('return complete REVISE');
    expect(compactBlueprintResponseContract(['physics'], true).objects.root.optional).toEqual(['recoveryAdjustment']);
  });

  it('preserves precise structural diagnostics for the existing provider boundary', () => {
    const f = planningFixture(), v = wire(f);
    Object.assign(v.plans[0].activities[0], { effort: [10, 20] });
    try { validateCompactLearningProposal(v, f.input); throw new Error('Malformed effort accepted'); }
    catch (error) {
      expect(error).toBeInstanceOf(z.ZodError);
      expect((error as z.ZodError).issues).toContainEqual(expect.objectContaining({ path: ['plans', 0, 'activities', 0, 'effort'] }));
      expect((error as z.ZodError).issues.some(issue => issue.code === 'invalid_union')).toBe(false);
    }
  });

  it('measures real request and response reduction for identical education, including Unicode and maximum detail', () => {
    const observations = [];
    for (const count of [1, 12, 60]) for (const adaptation of [false, true]) {
      const f = planningFixture(Array(count).fill(30), Array(28).fill(120));
      f.input.context = { envelope: structuredClone(f.envelope), evidence: { quotation: 'Use the original "dataset".\nصحیح قانون', hash: 'owned-source-digest' } };
      if (adaptation) f.input.previous = structuredClone(f.snapshot);
      const request = blueprintRequest(f.input, adaptation), payload = JSON.parse(request.messages[0].content);
      const legacy = { ...request, systemInstruction: blueprintInstruction,
        messages: [{ role: 'user' as const, content: JSON.stringify({ ...payload, responseContract: blueprintResponseContract(f.input) }) }] };
      const newInput = boundedProviderInput(request), oldInput = boundedProviderInput(legacy);
      const newOutput = plannerSerializedBytes(wire(f)), oldOutput = plannerSerializedBytes(f.response);
      expect(newInput).toBeLessThan(oldInput); expect(newOutput).toBeLessThan(oldOutput);
      expect(mapped(f, adaptation)).toEqual(validateLearningProposal(f.response, f.input, adaptation));
      const { responseContract: compactContract, ...newContext } = payload;
      const { responseContract: legacyContract, ...oldContext } = JSON.parse(legacy.messages[0].content);
      expect(newContext).toEqual(oldContext); expect(compactContract).not.toEqual(legacyContract);
      observations.push({ activities: count, adaptation, inputReservationUnits: { before: oldInput, after: newInput },
        outputUtf8Bytes: { before: oldOutput, after: newOutput }, systemUtf8Bytes: { before: Buffer.byteLength(blueprintInstruction), after: Buffer.byteLength(request.systemInstruction) },
        inputReductionPercent: +(100 * (oldInput - newInput) / oldInput).toFixed(2), outputReductionPercent: +(100 * (oldOutput - newOutput) / oldOutput).toFixed(2) });
    }
    if (process.env.PLANNER_COMPACT_BLUEPRINT_EVIDENCE) {
      const path = process.env.PLANNER_COMPACT_BLUEPRINT_EVIDENCE; mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, JSON.stringify({ status: 'PASSED', method: 'Exact old/new requests with identical consequential input and canonical results. Input uses existing conservative UTF-8 reservation units, not measured provider tokens. Output counts UTF-8 JSON bytes. No live calls.', observations }, null, 2) + '\n');
    }
  });
});
