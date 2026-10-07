"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.projectPlannerInterviewContext = void 0;
exports.projectPlannerContext = projectPlannerContext;
exports.loadPlannerModelContext = loadPlannerModelContext;
exports.loadPlannerInterviewContext = loadPlannerInterviewContext;
const contracts_1 = require("../contracts");
const database_1 = require("../server/database");
const intents_1 = require("../server/intents");
const revisions_1 = require("../server/revisions");
const context_1 = require("../server/context");
const scheduling_1 = require("./schemas/scheduling");
/** Call only with the owned snapshot loaded by the V2 context owner. The
 * registry stays server-side: models refer to local aliases, never mint IDs. */
function projectContext(context, targets, window, options = {}, interview = false) {
    if (!targets.length || targets.length > 2 || new Set(targets.map(t => t.planId)).size !== targets.length ||
        new Set(targets.map(t => t.planRef)).size !== targets.length || targets.some(t => !/^[a-zA-Z][a-zA-Z0-9_]{0,79}$/.test(t.planRef)))
        (0, database_1.reject)("INVALID_OUTPUT", "Context targets need distinct owned plans and local references.", "PREFLIGHT");
    for (const target of targets)
        contracts_1.CanonicalIntentV2Schema.parse(target.intent);
    contracts_1.DateV2Schema.parse(window.start);
    contracts_1.DateV2Schema.parse(window.end);
    const span = (Date.parse(window.end) - Date.parse(window.start)) / 86400000 + 1;
    if (window.start < context.today || span < 1 || span > 500)
        (0, database_1.reject)("PAYLOAD_TOO_LARGE", "The detailed context window must contain at most 500 future dates.", "PREFLIGHT");
    const maxBytes = options.maxBytes ?? 128 * 1024;
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1024 || maxBytes > 4 * 1024 * 1024)
        (0, database_1.reject)("INVALID_OUTPUT", "Invalid model context byte allowance.", "PREFLIGHT");
    const availability = context.globalAvailability ?? options.provisionalAvailability;
    if ((!availability && !interview) || availability && (availability.timezone !== context.timezone || !context.globalAvailability && availability.basis !== "DISCLOSED_PROVISIONAL_CEILING"))
        (0, database_1.reject)("CAPACITY_SHORTFALL", "Context needs confirmed availability or an explicitly disclosed provisional ceiling in the student's timezone.", "PREFLIGHT");
    if (context.legacyExceptions.length && !interview)
        (0, database_1.reject)("CAPACITY_SHORTFALL", "Resolve unknown legacy commitments before projecting capacity.", "PREFLIGHT");
    const targetById = new Map(targets.map(t => [t.planId, t]));
    const specs = new Map(context.quests.filter(q => q.plannerSpec).map(q => [q.id, contracts_1.ExecutionTaskSpecV2Schema.parse(q.plannerSpec)]));
    const relevant = (0, context_1.relevantDependencyQuests)(context.quests, context.sessions, new Set(targets.flatMap(t => [...t.activeActivityKeys])));
    const registry = relevant.map((q, i) => ({ ref: `execution_${i + 1}`, questId: q.id, activityKey: specs.get(q.id)?.activityKey ?? null }));
    const byQuest = new Map(registry.map(r => [r.questId, r.ref]));
    const byActivity = new Map(registry.filter(r => r.activityKey).map(r => [r.activityKey, r.ref]));
    const liveSessions = context.sessions.filter(s => !s.endedAt || s.executionState === "RUNNING" || s.executionState === "PAUSED");
    if (liveSessions.some(s => !s.executionState) && !interview)
        (0, database_1.reject)("PROTECTED_EXECUTION", "An older timer must be explicitly stopped before this context can be used.", "PREFLIGHT");
    const sessionRegistry = liveSessions.map((s, i) => ({ ref: `session_${i + 1}`, sessionId: s.id }));
    const runningSessions = liveSessions.map((s, i) => ({ ref: sessionRegistry[i].ref, executionRef: s.questId === null ? null : byQuest.get(s.questId) ?? null,
        state: s.executionState ?? "UNKNOWN_LEGACY_TIMER", executionVersion: s.executionVersion, acceptedFocusSeconds: s.durationSeconds, acceptedBreakSeconds: s.breakSeconds,
        actualCivilDate: s.executionContext?.actualCivilDate ?? (0, context_1.civilDate)(s.startedAt, context.timezone),
        startedAt: s.startedAt.toISOString(), runningSince: s.runningSince?.toISOString() ?? null,
        accounting: "ALREADY_INCLUDED_IN_ACCEPTED_ACTUALS" }));
    const execution = relevant.map(q => {
        const spec = specs.get(q.id);
        if (!spec) {
            const own = context.sessions.filter(s => s.questId === q.id);
            const state = q.status === "COMPLETED" ? "COMPLETED" : own.some(s => s.executionState === "RUNNING") ? "RUNNING" :
                own.some(s => s.executionState === "PAUSED") ? "PAUSED" : q.elapsedSeconds > 0 || own.length > 0 || q.status === "IN_PROGRESS" ? "ENDED_INCOMPLETE" : "UNSTARTED";
            return { ref: byQuest.get(q.id), planRef: null, source: "LEGACY_EXECUTION",
                title: q.title, instructions: q.description, state, protected: state !== "UNSTARTED" || q.executionVersion > 0, actualSeconds: q.elapsedSeconds,
                remainingMinutes: q.remainingDisposition === "OPEN" ? Number.isSafeInteger(q.requiredMinutes) && q.requiredMinutes > 0 ? Math.max(1, Math.ceil(q.requiredMinutes - q.elapsedSeconds / 60)) : null : 0,
                date: q.scheduledFor, remainingDisposition: q.remainingDisposition, executionVersion: q.executionVersion };
        }
        const live = (0, context_1.liveExecution)(q, context.sessions);
        return { ref: byQuest.get(q.id), planRef: targetById.get(spec.planId)?.planRef ?? null, source: "V2_EXECUTION",
            ...spec.content, hardDependencies: spec.content.hardDependencies.map(key => byActivity.get(key)),
            continuesActivityRef: spec.continuesActivityKey ? byActivity.get(spec.continuesActivityKey) ?? null : null,
            contentDigest: (0, context_1.contentDigest)(spec), state: live.state, actualSeconds: live.actualSeconds,
            remainingMinutes: live.remainingMinutesEstimate, remainingDisposition: live.remainingDisposition,
            requiresReestimate: live.requiresReestimate, executionVersion: live.executionVersion, date: q.scheduledFor,
            estimateBasisActualSeconds: spec.effort.remainingEstimateBasisActualSeconds, plannedMinutes: spec.effort.plannedMinutes };
    });
    const protectedExecution = relevant.flatMap(q => {
        const spec = specs.get(q.id);
        const target = spec && targetById.get(spec.planId);
        if (!spec || !target)
            return [];
        const live = (0, context_1.liveExecution)(q, context.sessions);
        if (live.state === "UNSTARTED")
            return [];
        return [{ planRef: target.planRef, activityRef: byQuest.get(q.id), contentDigest: (0, context_1.contentDigest)(spec),
                executionVersion: live.executionVersion, actualSeconds: live.actualSeconds, remainingMinutes: live.remainingMinutesEstimate,
                state: live.state, remainingDisposition: live.remainingDisposition, date: q.scheduledFor }];
    });
    const ledger = (0, context_1.executionCapacityLedger)(context, new Set(targetById.keys()));
    const days = Array.from({ length: span }, (_, i) => {
        const date = new Date(Date.parse(window.start) + i * 86400000).toISOString().slice(0, 10);
        const index = (0, context_1.mondayIndex)(date);
        const ceilingMinutes = availability?.dailyCeilingMinutes[index] ?? 0;
        const excluded = context.restDays.includes((index + 1) % 7) || context.floatingDates.includes(date) ||
            availability?.restWeekdays.includes(index) || availability?.blockedDates.includes(date) ||
            targets.every(t => t.intent.deadline.kind === "FIXED" && (date > t.intent.deadline.date || date === t.intent.deadline.date && !t.intent.deadline.examDayStudyAllowed));
        const otherCommittedMinutes = (ledger.otherRemaining.get(date) ?? 0) + Math.ceil((ledger.actualSeconds.get(date) ?? 0) / 60);
        const protectedTargetMinutes = protectedExecution.filter(e => e.date === date).reduce((n, e) => n + e.remainingMinutes, 0);
        const recoveryMinutes = Math.ceil(ceilingMinutes * (availability?.recoveryPercent ?? 0) / 100);
        return { date, ceilingMinutes, otherCommittedMinutes, protectedTargetMinutes, recoveryMinutes,
            availableMinutes: excluded ? 0 : Math.max(0, ceilingMinutes - otherCommittedMinutes - protectedTargetMinutes - recoveryMinutes), excluded };
    });
    const envelope = availability && !context.legacyExceptions.length ? scheduling_1.SchedulingEnvelopeSchema.parse({ schemaVersion: 2, timezone: context.timezone, today: context.today, window,
        capacityDigest: context.dependencies.capacityDigest, basis: availability.basis,
        weeklyCeilingMinutes: availability.weeklyCeilingMinutes ?? availability.dailyCeilingMinutes.reduce((a, b) => a + b, 0),
        recoveryPercent: availability.recoveryPercent, targets: targets.map(t => ({ planRef: t.planRef, deadline: t.intent.deadline,
            perGoalWeeklyCeilingMinutes: t.intent.availability?.perGoalWeeklyCeilingMinutes ?? null })), days, protectedExecution,
        timeboxRange: { minMinutes: 5, maxMinutes: 240 } }) : null;
    const plans = targets.map(t => {
        const { scope, evidence, research, ...intent } = t.intent;
        delete intent.subjectId;
        delete intent.goalId;
        const scopeRef = new Map(scope.map(s => [s.scopeKey, s.modelRef]));
        const learning = evidence.map(e => ({ ...e, scopeKeys: undefined, scopeRefs: e.scopeKeys.map(key => scopeRef.get(key)) }));
        // Legacy check item keys cannot be assumed to be V2 activity/scope keys.
        // Keep unresolved provenance visible rather than inventing a scope match.
        const savedChecks = (0, context_1.savedCheckReferences)(context, t.planId).map(({ check: c, ref }) => {
            const matches = context.quests.filter(q => { const s = specs.get(q.id); return s?.planId === t.planId && s.activityKey === c.itemKey; });
            return { ref, source: "CHECK_RESULT", reliability: "SELF_REPORTED", result: c.result,
                observedAt: c.updatedAt.toISOString(), recordedAt: c.createdAt.toISOString(),
                sourceRevisionDigest: (0, database_1.hash)("check-revision", c.revisionId), sourceItemDigest: (0, database_1.hash)("check-item", c.itemKey),
                scopeRefs: matches.length === 1 ? specs.get(matches[0].id).content.scopeRefs : [],
                scopeResolution: matches.length === 1 ? "MATCHED" : "UNRESOLVED", demonstratesReadiness: false };
        });
        const contradictions = scope.flatMap(s => {
            const scoped = learning.filter(e => e.scopeRefs.includes(s.modelRef));
            return scoped.some(e => e.demonstratesReadiness) && scoped.some(e => !e.demonstratesReadiness && !["ACTIVITY_COMPLETION", "SESSION_PACE"].includes(e.source)) ?
                [{ scopeRef: s.modelRef, evidenceRefs: scoped.map(e => e.evidenceId), resolution: "REQUIRES_EDUCATIONAL_JUDGMENT" }] : [];
        });
        return { planRef: t.planRef, intent, scope: scope.map(s => ({ ref: s.modelRef, title: s.title, parentRef: s.parentKey ? scopeRef.get(s.parentKey) : null,
                inclusion: s.inclusion, sourceClaimIds: s.sourceClaimIds })), learning, savedChecks, contradictions,
            research: research ? { ...research, sources: research.sources.map(s => ({ ...s, location: s.location.kind === "OWNED_DOCUMENT" ?
                        { kind: "OWNED_DOCUMENT", documentRef: `document_${s.sourceId}` } : s.location })) } : null };
    });
    // Local scope aliases are meaningful only within their owned Plan.
    const history = context.quests.filter(q => q.status === "COMPLETED" && specs.has(q.id) && targetById.has(specs.get(q.id).planId))
        .sort((a, b) => (a.completedAt?.getTime() ?? 0) - (b.completedAt?.getTime() ?? 0) || a.id - b.id);
    const matchesLegacy = (q, t) => !!t.intent.subjectId && t.intent.subjectId === q.subjectId || !!(t.goalId ?? t.intent.goalId) && (t.goalId ?? t.intent.goalId) === q.goalId;
    const legacyHistory = context.quests.filter(q => q.status === "COMPLETED" && !q.plannerSpec && targets.some(t => matchesLegacy(q, t)))
        .sort((a, b) => (a.completedAt?.getTime() ?? 0) - (b.completedAt?.getTime() ?? 0) || a.id - b.id);
    const historyLimit = Math.max(0, Math.min(20, Math.floor(options.historyExamples ?? 10)));
    const examples = history.filter(q => !byQuest.has(q.id)).slice(-historyLimit || history.length).reverse().map(q => ({
        title: q.title, scopeRefs: specs.get(q.id).content.scopeRefs, completedAt: q.completedAt?.toISOString() ?? null,
        actualSeconds: q.elapsedSeconds, demonstratesReadiness: false
    }));
    if (historyLimit === 0)
        examples.length = 0;
    const legacyExampleCount = Math.max(0, historyLimit - examples.length);
    const legacyExamples = legacyExampleCount ? legacyHistory.slice(-legacyExampleCount).reverse().map(q => ({ title: q.title, instructions: q.description,
        planRefs: targets.filter(t => matchesLegacy(q, t)).map(t => t.planRef), completedAt: q.completedAt?.toISOString() ?? null, actualSeconds: q.elapsedSeconds,
        approvedEstimateMinutes: Number.isSafeInteger(q.requiredMinutes) && q.requiredMinutes > 0 ? q.requiredMinutes : null, demonstratesReadiness: false })) : [];
    const weeks = [...new Set(days.map(d => (0, context_1.weekKey)(d.date)))].map(week => ({ week,
        // Include actuals/commitments outside the detailed window in the same week.
        otherCommittedMinutes: [...ledger.usage].filter(([date]) => (0, context_1.weekKey)(date) === week).reduce((sum, [, n]) => sum + n, 0),
        protectedTargetMinutes: protectedExecution.filter(e => (0, context_1.weekKey)(e.date) === week).reduce((sum, e) => sum + e.remainingMinutes, 0),
        perGoalCommittedMinutes: targets.map(t => { const goalId = t.goalId ?? t.intent.goalId; return { planRef: t.planRef, minutes: goalId ? ledger.perGoal.get(`${goalId}/${week}`) ?? 0 : 0 }; }) }));
    const view = { schemaVersion: 2, projectedAt: context.now.toISOString(), authority: "EXECUTION_CONTEXT", envelope, weeks, plans, execution, runningSessions,
        ...(interview ? { capacityStatus: envelope ? "ACCEPTED_CEILING" : "UNRESOLVED_CAPACITY", timezone: context.timezone,
            restDays: context.restDays, floatingDates: context.floatingDates,
            unresolvedCommitments: context.legacyExceptions.map(e => ({ ref: byQuest.get(e.questId) ?? null, reason: e.reason })) } : {}),
        actuals: days.map(d => ({ date: d.date, acceptedSeconds: ledger.actualSeconds.get(d.date) ?? 0 })),
        academicSources: (options.academicSources ?? (context.academicSource ? [{ planId: targets[0].planId, source: context.academicSource }] : [])).map(({ planId, source }) => {
            const target = targetById.get(planId);
            if (!target)
                (0, database_1.reject)("REFERENCE_NOT_OWNED", "Academic evidence belongs to another selected target.", "PREFLIGHT");
            const nodes = source.nodes.filter(n => target.intent.scope.some(s => s.title === n.title));
            return { planRef: target.planRef, subject: { name: source.subject.name, code: source.subject.code,
                    examBoard: source.subject.examBoard, level: source.subject.level, syllabusNote: source.subject.syllabusNote },
                nodes: nodes.map(n => ({ title: n.title, description: n.description, difficulty: n.difficulty })), nodeSelection: "EXACT_SAVED_TITLE_HINT",
                omittedNodes: source.nodes.length - nodes.length, authority: "SAVED_UNVERIFIED_ASSESSMENT_HINT", sourceDigest: (0, database_1.hash)("subject-academic-source", source) };
        }),
        history: { source: "ACTIVITY_COMPLETION_AND_ACCEPTED_PACE", reliability: "OBSERVED_EXECUTION",
            sourceDigest: (0, database_1.hash)("relevant-history", history.map(q => ({ spec: specs.get(q.id), actualSeconds: q.elapsedSeconds, completedAt: q.completedAt, executionVersion: q.executionVersion }))),
            observedAtRange: { first: history[0]?.completedAt?.toISOString() ?? null, last: history.at(-1)?.completedAt?.toISOString() ?? null },
            relevantCompletedCount: history.length, acceptedSeconds: history.reduce((n, q) => n + q.elapsedSeconds, 0),
            byScope: targets.flatMap(t => t.intent.scope.map(s => {
                const own = history.filter(q => specs.get(q.id).planId === t.planId && specs.get(q.id).content.scopeRefs.includes(s.modelRef));
                return { planRef: t.planRef, scopeRef: s.modelRef, completedCount: own.length, approvedEstimateMinutes: own.reduce((n, q) => n + specs.get(q.id).effort.plannedMinutes, 0),
                    acceptedSeconds: own.reduce((n, q) => n + q.elapsedSeconds, 0), demonstratesReadiness: false };
            })),
            demonstratesReadiness: false, examples, omittedExamples: history.length - examples.length,
            unattributedOrOtherCompletedCount: context.quests.filter(q => q.status === "COMPLETED").length - history.length - legacyHistory.length },
        legacyHistory: { source: "LEGACY_COMPLETION_AND_ACCEPTED_PACE", reliability: "OBSERVED_EXECUTION", scopeResolution: "UNRESOLVED", demonstratesReadiness: false,
            sourceDigest: (0, database_1.hash)("relevant-legacy-history", legacyHistory.map(q => ({ questId: q.id, title: q.title, instructions: q.description,
                goalId: q.goalId, subjectId: q.subjectId, subjectNodeId: q.subjectNodeId, approvedEstimateMinutes: q.requiredMinutes,
                actualSeconds: q.elapsedSeconds, completedAt: q.completedAt, executionVersion: q.executionVersion }))), completedCount: legacyHistory.length,
            byPlan: targets.map(t => {
                const own = legacyHistory.filter(q => matchesLegacy(q, t));
                return { planRef: t.planRef, completedCount: own.length,
                    acceptedSeconds: own.reduce((n, q) => n + q.elapsedSeconds, 0), approvedEstimateMinutes: own.reduce((n, q) => n + (Number.isSafeInteger(q.requiredMinutes) && q.requiredMinutes > 0 ? q.requiredMinutes : 0), 0),
                    unknownEstimateCount: own.filter(q => !Number.isSafeInteger(q.requiredMinutes) || q.requiredMinutes <= 0).length,
                    firstCompletedAt: own[0]?.completedAt?.toISOString() ?? null, lastCompletedAt: own.at(-1)?.completedAt?.toISOString() ?? null };
            }),
            examples: legacyExamples, omittedExamples: legacyHistory.length - legacyExamples.length } };
    // Optional examples can be omitted explicitly. Consequential facts never
    // undergo prefix trimming, even when one note/instruction is very large.
    if (Buffer.byteLength(JSON.stringify(view)) > maxBytes) {
        view.history.examples = [];
        view.history.omittedExamples = history.length;
        view.legacyHistory.examples = [];
        view.legacyHistory.omittedExamples = legacyHistory.length;
    }
    const bytes = Buffer.byteLength(JSON.stringify(view));
    if (bytes > maxBytes)
        (0, database_1.reject)("PAYLOAD_TOO_LARGE", "Required execution and learning evidence exceed the model context allowance; narrow the request.", "PREFLIGHT");
    return { view, registry, sessionRegistry, bytes, digest: (0, database_1.hash)("model-context", { ...view, projectedAt: null }) };
}
function projectPlannerContext(context, targets, window, options = {}) {
    const projection = projectContext(context, targets, window, options);
    if (!projection.view.envelope)
        (0, database_1.reject)("CAPACITY_SHORTFALL", "An accepted capacity envelope is required.", "PREFLIGHT");
    return { ...projection, view: { ...projection.view, envelope: projection.view.envelope } };
}
const projectPlannerInterviewContext = (context, targets, window, options = {}) => projectContext(context, targets, window, options, true);
exports.projectPlannerInterviewContext = projectPlannerInterviewContext;
/** Use within the existing owner-coordinated transaction. Each target keeps its
 * own evidence/dependency seal; joint requests share complete execution facts. */
async function loadContextSnapshot(sql, ownerId, requested, window, options = {}) {
    if (!requested.length || requested.length > 2 || new Set(requested.map(t => t.planId)).size !== requested.length)
        (0, database_1.reject)("INVALID_OUTPUT", "Select one or two distinct context targets.", "PREFLIGHT");
    const plans = [];
    for (const target of [...requested].sort((a, b) => a.planId.localeCompare(b.planId)))
        plans.push(await (0, intents_1.ownedPlan)(sql, ownerId, target.planId));
    const targets = [];
    const contexts = [];
    const academicSources = [];
    for (const target of requested) {
        const plan = plans.find(p => p.id === target.planId);
        const version = await (0, intents_1.loadIntent)(sql, ownerId, target.intentId);
        if (version.planId !== plan.id || plan.workingIntentVersionId !== version.intentVersionId)
            (0, database_1.reject)("STALE_CONTEXT", "The selected context intent is no longer current.", "PREFLIGHT");
        const activeRow = plan.activeRevisionId ? (await (0, database_1.rows)(sql, 'SELECT "schemaVersion" FROM "PlannerRevision" WHERE id=$1 AND "planId"=$2', [plan.activeRevisionId, plan.id]))[0] : null;
        if (plan.activeRevisionId && !activeRow)
            (0, database_1.reject)("REFERENCE_NOT_OWNED", "The active context revision is unavailable.", "PREFLIGHT");
        const active = activeRow?.schemaVersion === 2 ? await (0, revisions_1.loadRevision)(sql, ownerId, plan.activeRevisionId) : null;
        const legacy = plan.migrationEvidence?.baselineSpecs ?? [];
        targets.push({ planId: plan.id, planRef: target.planRef, intent: version.intent,
            goalId: plan.goalId ?? plan.reservedGoalId ?? version.intent.goalId ?? null,
            activeActivityKeys: active?.executable.map(s => s.activityKey) ?? legacy.map(s => contracts_1.ExecutionTaskSpecV2Schema.parse(s).activityKey) });
        const context = await (0, context_1.loadExecutionContext)(sql, ownerId, plans, version.intent);
        contexts.push({ planRef: target.planRef, context });
        if (context.academicSource)
            academicSources.push({ planId: plan.id, source: context.academicSource });
    }
    return { targets, contexts, academicSources, options };
}
async function loadPlannerModelContext(sql, ownerId, requested, window, options = {}) {
    const snapshot = await loadContextSnapshot(sql, ownerId, requested, window, options);
    return { ...projectPlannerContext(snapshot.contexts[0].context, snapshot.targets, window, { ...options, academicSources: snapshot.academicSources }), contexts: snapshot.contexts };
}
async function loadPlannerInterviewContext(sql, ownerId, requested, window, options = {}) {
    const snapshot = await loadContextSnapshot(sql, ownerId, requested, window, options);
    return { ...(0, exports.projectPlannerInterviewContext)(snapshot.contexts[0].context, snapshot.targets, window, { ...options, academicSources: snapshot.academicSources }), contexts: snapshot.contexts };
}
