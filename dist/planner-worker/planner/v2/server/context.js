"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mondayIndex = exports.externalActivityAlias = exports.contextInputDigest = exports.contentDigest = exports.specDigest = void 0;
exports.liveExecution = liveExecution;
exports.civilDate = civilDate;
exports.weekKey = weekKey;
exports.questDependency = questDependency;
exports.relevantDependencyQuests = relevantDependencyQuests;
exports.loadExecutionContext = loadExecutionContext;
exports.verifyContextCorrespondence = verifyContextCorrespondence;
exports.executionCapacityLedger = executionCapacityLedger;
exports.verifyPlacement = verifyPlacement;
exports.contextForPlans = contextForPlans;
const contracts_1 = require("../contracts");
const database_1 = require("./database");
const intents_1 = require("./intents");
const timezone_service_1 = require("../../../timezone-service");
const specDigest = (spec) => (0, database_1.hash)("execution-spec", {
    ...spec, content: JSON.parse((0, contracts_1.canonicalExecutionContent)(spec)),
});
exports.specDigest = specDigest;
const contentDigest = (spec) => (0, database_1.hash)("execution-content", JSON.parse((0, contracts_1.canonicalExecutionContent)(spec)));
exports.contentDigest = contentDigest;
/** The Attempt pins input facts before educational work. Cross-plan edges are
 * derived educational output, sealed by the full Revision digest afterward.
 * Their referenced content/execution facts are already in the pinned registry. */
const contextInputDigest = (context) => (0, database_1.hash)("context-dependencies", { ...context, externalActivityDependencies: [] });
exports.contextInputDigest = contextInputDigest;
const externalActivityAlias = (activityKey) => `external_${activityKey.replaceAll("-", "")}`;
exports.externalActivityAlias = externalActivityAlias;
function liveExecution(quest, sessions) {
    const spec = contracts_1.ExecutionTaskSpecV2Schema.parse(quest.plannerSpec);
    const own = sessions.filter(session => session.questId === quest.id);
    if (own.some(session => !session.endedAt && !session.executionState))
        (0, database_1.reject)("PROTECTED_EXECUTION", "An older timer must be explicitly stopped before this work can be adopted.");
    const actualSeconds = quest.elapsedSeconds;
    const forecast = (0, contracts_1.deriveRemainingWorkV2)(spec.effort, actualSeconds, quest.remainingDisposition);
    const state = quest.status === "COMPLETED" ? "COMPLETED" : own.some(session => session.executionState === "RUNNING") ? "RUNNING" :
        own.some(session => session.executionState === "PAUSED") ? "PAUSED" : actualSeconds > 0 || own.length > 0 || quest.status === "IN_PROGRESS" ? "ENDED_INCOMPLETE" : "UNSTARTED";
    return { schemaVersion: 2, activityKey: spec.activityKey, state, actualSeconds, executionVersion: quest.executionVersion,
        remainingDisposition: quest.remainingDisposition, ...forecast };
}
function civilDate(date, timezone) {
    return timezone_service_1.TimezoneService.getUserLocalDate(timezone, date);
}
const mondayIndex = (date) => (new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7;
exports.mondayIndex = mondayIndex;
function weekKey(date) {
    const d = new Date(date + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() - (0, exports.mondayIndex)(date));
    return d.toISOString().slice(0, 10);
}
function questDependency(quest) {
    return { questId: quest.id, contentDigest: quest.plannerSpec ? (0, exports.contentDigest)(contracts_1.ExecutionTaskSpecV2Schema.parse(quest.plannerSpec)) : (0, database_1.hash)("legacy-quest", {
            title: quest.title, description: quest.description, requiredMinutes: quest.requiredMinutes, goalId: quest.goalId, subjectId: quest.subjectId,
        }), executionVersion: quest.executionVersion };
}
/** Raw owned execution remains complete. Only the bounded dependency registry is
 * projected; open commitments, current education and their closed prerequisites
 * are never removed to make that registry fit. */
function relevantDependencyQuests(quests, sessions, activeKeys, pinnedQuestIds = []) {
    const parsed = new Map(quests.filter(quest => quest.plannerSpec).map(quest => [quest.id, contracts_1.ExecutionTaskSpecV2Schema.parse(quest.plannerSpec)]));
    const byKey = new Map(quests.filter(quest => quest.plannerSpec).map(quest => [parsed.get(quest.id).activityKey, quest]));
    if (byKey.size !== parsed.size)
        (0, database_1.reject)("INVALID_OUTPUT", "Execution activity identity is ambiguous.", "PREFLIGHT");
    const running = new Set(sessions.filter(session => !session.endedAt).map(session => session.questId));
    const pinned = new Set(pinnedQuestIds);
    const selected = new Map(quests.filter(quest => quest.status !== "COMPLETED" && quest.remainingDisposition === "OPEN" || running.has(quest.id) ||
        activeKeys.has(parsed.get(quest.id)?.activityKey ?? "") || pinned.has(quest.id)).map(quest => [quest.id, quest]));
    if (pinnedQuestIds.some(id => !quests.some(quest => quest.id === id)))
        (0, database_1.reject)("REFERENCE_NOT_OWNED", "A required execution reference is unavailable.", "PREFLIGHT");
    const queue = [...selected.values()];
    for (let i = 0; i < queue.length; i++)
        for (const key of [...(parsed.get(queue[i].id)?.content.hardDependencies ?? []),
            ...(parsed.get(queue[i].id)?.continuesActivityKey ? [parsed.get(queue[i].id).continuesActivityKey] : [])]) {
            const prerequisite = byKey.get(key);
            if (!prerequisite)
                (0, database_1.reject)("PROTECTED_EXECUTION", "A required prerequisite is unavailable.", "PREFLIGHT");
            if (!selected.has(prerequisite.id)) {
                selected.set(prerequisite.id, prerequisite);
                queue.push(prerequisite);
            }
        }
    if (selected.size > contracts_1.PLANNER_V2_ENVELOPE.outstandingActivitiesPerPlan * contracts_1.PLANNER_V2_ENVELOPE.targets)
        (0, database_1.reject)("PAYLOAD_TOO_LARGE", "Required execution dependencies exceed the bounded Planner context; resolve or narrow the request.", "PREFLIGHT");
    return quests.filter(quest => selected.has(quest.id));
}
async function loadExecutionContext(sql, ownerId, plans, intent, pinnedQuestIds = []) {
    const user = (await (0, database_1.rows)(sql, 'SELECT timezone,"restDays" FROM "User" WHERE id=$1', [ownerId]))[0];
    if (!user)
        (0, database_1.reject)("REFERENCE_NOT_OWNED", "Student unavailable.");
    const now = await (0, database_1.clock)(sql);
    // Availability is a global accepted fact. Derive its latest consequential
    // acceptance from immutable intents, not whichever Plan happens to generate.
    // Repeated copies during unrelated edits/research do not create new events.
    const availabilityEvent = (await (0, database_1.rows)(sql, `
    SELECT i.id,i.artifact->'intent'->'availability' AS availability FROM "PlannerIntentVersion" i
    LEFT JOIN "PlannerIntentVersion" parent ON parent.id=i."parentId"
    WHERE i."userId"=$1 AND i.artifact->'intent'->'availability' IS NOT NULL
      AND ((i.artifact->'intent'->'availability')-'perGoalWeeklyCeilingMinutes') IS DISTINCT FROM
          ((parent.artifact->'intent'->'availability')-'perGoalWeeklyCeilingMinutes')
    ORDER BY (i.artifact->'intent'->'availability'->>'basis'='CONFIRMED_AVAILABILITY') DESC,
      (i.artifact->>'acceptedAt')::timestamptz DESC,i.id DESC LIMIT 1`, [ownerId]))[0];
    const globalAvailability = availabilityEvent ? contracts_1.AvailabilityIntentV2Schema.parse(availabilityEvent.availability) : null;
    const quests = await (0, database_1.rows)(sql, 'SELECT * FROM "Quest" WHERE "userId"=$1 ORDER BY id', [ownerId]);
    const sessions = await (0, database_1.rows)(sql, 'SELECT * FROM "StudySession" WHERE "userId"=$1 ORDER BY id', [ownerId]);
    const floatingDates = (await (0, database_1.rows)(sql, 'SELECT "dateKey" FROM "FloatingRestDay" WHERE "userId"=$1 ORDER BY "dateKey"', [ownerId])).map(row => row.dateKey);
    const legacyExceptions = [];
    let requiresReestimate = false;
    const commitments = quests.filter(quest => quest.status !== "COMPLETED").map(quest => {
        if (quest.plannerSpec) {
            const execution = liveExecution(quest, sessions);
            requiresReestimate ||= execution.requiresReestimate;
            return { id: quest.id, date: quest.scheduledFor, remaining: execution.remainingMinutesEstimate, disposition: execution.remainingDisposition,
                contentDigest: (0, exports.contentDigest)(contracts_1.ExecutionTaskSpecV2Schema.parse(quest.plannerSpec)), executionVersion: quest.executionVersion };
        }
        const valid = Number.isInteger(quest.requiredMinutes) && quest.requiredMinutes > 0 && contracts_1.DateV2Schema.safeParse(quest.scheduledFor).success;
        if (!valid)
            legacyExceptions.push({ questId: quest.id, reason: "Legacy duration or placement is unresolved." });
        return { id: quest.id, date: quest.scheduledFor, remaining: valid ? Math.max(1, Math.ceil(quest.requiredMinutes - quest.elapsedSeconds / 60)) : null,
            disposition: quest.remainingDisposition, contentDigest: (0, database_1.hash)("legacy-quest", { title: quest.title, description: quest.description, requiredMinutes: quest.requiredMinutes, goalId: quest.goalId, subjectId: quest.subjectId }), executionVersion: quest.executionVersion };
    });
    // Accepted actual seconds are attributed to the actual session date, never the Quest placement.
    const actualByDate = new Map();
    for (const session of sessions) {
        const date = session.executionContext?.actualCivilDate ?? civilDate(session.startedAt, user.timezone);
        actualByDate.set(date, (actualByDate.get(date) ?? 0) + session.durationSeconds);
    }
    const evidence = intent.evidence.map(value => ({ ref: value.evidenceId, digest: (0, database_1.hash)("learning-evidence", value) }));
    let academicSource;
    // Academic source changes are consequential; cosmetic fields and XP are not.
    // Keep these in the existing evidence projection rather than another version table.
    if (intent.subjectId) {
        const subject = (await (0, database_1.rows)(sql, 'SELECT id,name,code,"examBoard",level,"syllabusNote","archivedAt" FROM "Subject" WHERE id=$1 AND "userId"=$2', [intent.subjectId, ownerId]))[0];
        if (!subject || subject.archivedAt)
            (0, database_1.reject)("REFERENCE_NOT_OWNED", "The selected subject is unavailable.");
        const nodes = await (0, database_1.rows)(sql, 'SELECT id,"nodeId",title,description,difficulty FROM "SubjectNode" WHERE "subjectId"=$1 ORDER BY id', [intent.subjectId]);
        academicSource = { subject, nodes };
        evidence.push({ ref: `subject_${intent.subjectId}`, digest: (0, database_1.hash)("subject-academic-source", { subject, nodes }) });
    }
    for (const source of intent.research?.sources ?? [])
        evidence.push({ ref: `source_${(0, database_1.hash)("source-ref", source.sourceId).slice(0, 48)}`, digest: (0, database_1.hash)("research-source", source) });
    const checks = await (0, database_1.rows)(sql, 'SELECT id,"planId","itemKey","revisionId",result,"createdAt","updatedAt" FROM "PlannerCheckResult" WHERE "userId"=$1 AND "planId"=ANY($2::uuid[]) ORDER BY id', [ownerId, plans.map(plan => plan.id)]);
    // Preserve the existing result pin. New model projections separately pin
    // provenance/timestamps so an old sealed artifact is not relabeled.
    if (checks.length)
        evidence.push({ ref: "saved_checks", digest: (0, database_1.hash)("saved-checks", checks.map(({ id, planId, itemKey, result }) => ({ id, planId, itemKey, result }))) });
    // New reviews also pin dated check provenance and the complete relevant
    // completion/pace source. Keep the older saved_checks pin intact so sealed
    // Phase 1 artifacts retain exactly the facts they originally reviewed.
    const selectedPlans = new Set(plans.map(plan => plan.id));
    const learningHistory = quests.filter(quest => quest.status === "COMPLETED" && quest.plannerSpec && selectedPlans.has(contracts_1.ExecutionTaskSpecV2Schema.parse(quest.plannerSpec).planId));
    evidence.push({ ref: "model_learning_evidence", digest: (0, database_1.hash)("model-learning-evidence", { checks,
            history: learningHistory.map(quest => ({ spec: quest.plannerSpec, actualSeconds: quest.elapsedSeconds, completedAt: quest.completedAt, executionVersion: quest.executionVersion })) }) });
    let dependencyQuests = quests;
    if (quests.length > contracts_1.PLANNER_V2_ENVELOPE.outstandingActivitiesPerPlan * contracts_1.PLANNER_V2_ENVELOPE.targets || pinnedQuestIds.length) {
        const revisions = await (0, database_1.rows)(sql, 'SELECT "v2Artifact" FROM "PlannerRevision" WHERE "planId"=ANY($1::uuid[]) AND id=ANY($2::uuid[])', [plans.map(plan => plan.id), plans.map(plan => plan.activeRevisionId).filter(Boolean)]);
        const activeKeys = new Set(revisions.filter(row => row.v2Artifact).flatMap(row => contracts_1.PlannerRevisionV2Schema.parse(row.v2Artifact).executable.map(spec => spec.activityKey)));
        for (const plan of plans)
            for (const spec of plan.migrationEvidence?.baselineSpecs ?? [])
                activeKeys.add(contracts_1.ExecutionTaskSpecV2Schema.parse(spec).activityKey);
        dependencyQuests = relevantDependencyQuests(quests, sessions, activeKeys, pinnedQuestIds);
    }
    const planBases = plans.map(plan => ({ planId: plan.id, revisionId: plan.activeRevisionId, planningVersion: plan.version }));
    const checkedDependencies = contracts_1.ContextDependenciesV2Schema.safeParse({
        intentDigest: (0, database_1.hash)("canonical-intent", intent), capacityDigest: (0, database_1.hash)("capacity", { timezone: user.timezone, restDays: [...user.restDays].sort(), floatingDates,
            availability: globalAvailability, availabilityIntentVersionId: availabilityEvent?.id ?? null, commitments, actualByDate: [...actualByDate].sort() }), evidence,
        quests: dependencyQuests.map(questDependency),
        planBases, externalActivityDependencies: [],
    });
    if (!checkedDependencies.success)
        (0, database_1.reject)("PAYLOAD_TOO_LARGE", "Consequential evidence or execution dependencies exceed the Planner context envelope.", "PREFLIGHT");
    return { now, today: civilDate(now, user.timezone), timezone: user.timezone, restDays: user.restDays, floatingDates, quests, sessions, dependencies: checkedDependencies.data, requiresReestimate, legacyExceptions, globalAvailability, availabilityIntentVersionId: availabilityEvent?.id ?? null, checks, academicSource };
}
/** Live progress/capacity can be revalidated against fixed placements. It cannot
 * waive changes to intent, academic sources, execution generations or Plan bases. */
function verifyContextCorrespondence(sealed, current, ownedQuests) {
    const provenancePinned = sealed.evidence.some(e => e.ref === "model_learning_evidence");
    const relevant = (value) => ({ intentDigest: value.intentDigest, evidence: value.evidence.filter(e => provenancePinned || e.ref !== "model_learning_evidence").sort((a, b) => a.ref.localeCompare(b.ref)),
        planBases: [...value.planBases].sort((a, b) => a.planId.localeCompare(b.planId)) });
    if ((0, database_1.hash)("relevant-context", relevant(sealed)) !== (0, database_1.hash)("relevant-context", relevant(current)))
        (0, database_1.reject)("STALE_CONTEXT", "The goal, academic evidence or active baseline changed.", "APPLY");
    for (const pinned of sealed.quests) {
        const owned = ownedQuests?.find(quest => quest.id === pinned.questId);
        const fresh = current.quests.find(quest => quest.questId === pinned.questId) ?? (owned ? questDependency(owned) : undefined);
        if (!fresh || fresh.contentDigest !== pinned.contentDigest || fresh.executionVersion !== pinned.executionVersion)
            (0, database_1.reject)("STALE_CONTEXT", "A reviewed execution dependency changed.", "APPLY");
    }
}
/** Shared by confirmation and model envelopes. Actual time is charged to its
 * session civil date; only open remaining work is added, once. Selected target
 * work is replaced by the proposal, never charged as both old and new. */
function executionCapacityLedger(context, selectedIds) {
    const usage = new Map();
    const perGoal = new Map();
    const actualSeconds = new Map();
    const otherRemaining = new Map();
    for (const session of context.sessions) {
        const date = session.executionContext?.actualCivilDate ?? civilDate(session.startedAt, context.timezone);
        actualSeconds.set(date, (actualSeconds.get(date) ?? 0) + session.durationSeconds);
        usage.set(date, (usage.get(date) ?? 0) + session.durationSeconds / 60);
        const goal = context.quests.find(quest => quest.id === session.questId)?.goalId;
        if (goal)
            perGoal.set(`${goal}/${weekKey(date)}`, (perGoal.get(`${goal}/${weekKey(date)}`) ?? 0) + session.durationSeconds / 60);
    }
    for (const quest of context.quests) {
        if (quest.status === "COMPLETED" || quest.remainingDisposition !== "OPEN")
            continue;
        const spec = quest.plannerSpec ? contracts_1.ExecutionTaskSpecV2Schema.parse(quest.plannerSpec) : null;
        if (spec && selectedIds.has(spec.planId))
            continue;
        const remaining = spec ? liveExecution(quest, context.sessions).remainingMinutesEstimate : Math.max(1, Math.ceil(quest.requiredMinutes - quest.elapsedSeconds / 60));
        otherRemaining.set(quest.scheduledFor, (otherRemaining.get(quest.scheduledFor) ?? 0) + remaining);
        usage.set(quest.scheduledFor, (usage.get(quest.scheduledFor) ?? 0) + remaining);
        if (quest.goalId)
            perGoal.set(`${quest.goalId}/${weekKey(quest.scheduledFor)}`, (perGoal.get(`${quest.goalId}/${weekKey(quest.scheduledFor)}`) ?? 0) + remaining);
    }
    return { usage, perGoal, actualSeconds, otherRemaining };
}
/** Validate fixed placements; this is not the Phase 2 allocator/compiler. */
function verifyPlacement(context, targets) {
    if (context.legacyExceptions.length)
        (0, database_1.reject)("CAPACITY_SHORTFALL", "Resolve unknown legacy commitments before confirming new work.", "APPLY");
    if (!targets.length || !context.globalAvailability)
        (0, database_1.reject)("CAPACITY_SHORTFALL", "Confirmation needs an accepted availability ceiling.", "APPLY");
    const global = context.globalAvailability;
    const selectedIds = new Set(targets.map(target => target.plan.id));
    for (const quest of context.quests)
        if (quest.plannerSpec && liveExecution(quest, context.sessions).requiresReestimate) {
            const current = contracts_1.ExecutionTaskSpecV2Schema.parse(quest.plannerSpec);
            const replacement = targets.flatMap(target => target.specs).find(spec => spec.activityKey === current.activityKey);
            if (!selectedIds.has(current.planId) || replacement && (0, contracts_1.deriveRemainingWorkV2)(replacement.effort, quest.elapsedSeconds).requiresReestimate)
                (0, database_1.reject)("CAPACITY_SHORTFALL", "Some unfinished work needs a reviewed remaining estimate.", "APPLY");
        }
    const { usage, perGoal } = executionCapacityLedger(context, selectedIds);
    for (const { plan, intent, specs } of targets)
        for (const spec of specs) {
            const date = spec.placement.date;
            const quest = context.quests.find(quest => quest.plannerSpec && contracts_1.ExecutionTaskSpecV2Schema.parse(quest.plannerSpec).activityKey === spec.activityKey);
            if (quest?.status === "COMPLETED" || quest?.remainingDisposition !== "OPEN" && quest)
                continue;
            if (spec.placement.timezone !== context.timezone || global.timezone !== context.timezone || date < context.today ||
                context.restDays.includes(((0, exports.mondayIndex)(date) + 1) % 7) || context.floatingDates.includes(date) || global.restWeekdays.includes((0, exports.mondayIndex)(date)) || global.blockedDates.includes(date) ||
                intent.deadline.kind === "FIXED" && (date > intent.deadline.date || date === intent.deadline.date && !intent.deadline.examDayStudyAllowed))
                (0, database_1.reject)("SCHEDULE_CONFLICT", "A reviewed activity conflicts with a date, timezone, rest day or deadline.", "APPLY");
            if (spec.goalId !== (plan.goalId ?? plan.reservedGoalId))
                (0, database_1.reject)("REFERENCE_NOT_OWNED", "An activity does not belong to its plan's goal.", "APPLY");
            const remaining = (0, contracts_1.deriveRemainingWorkV2)(spec.effort, quest?.elapsedSeconds ?? 0).remainingMinutesEstimate;
            usage.set(date, (usage.get(date) ?? 0) + remaining);
            perGoal.set(`${spec.goalId}/${weekKey(date)}`, (perGoal.get(`${spec.goalId}/${weekKey(date)}`) ?? 0) + remaining);
        }
    for (const date of new Set(targets.flatMap(target => target.specs.map(spec => spec.placement.date)))) {
        const maximum = global.dailyCeilingMinutes[(0, exports.mondayIndex)(date)];
        if ((usage.get(date) ?? 0) > maximum)
            (0, database_1.reject)("SCHEDULE_CONFLICT", "The calendar no longer has enough capacity for this proposal.", "APPLY");
        const week = weekKey(date);
        const weeklyUse = [...usage].filter(([day]) => weekKey(day) === week).reduce((sum, [, minutes]) => sum + minutes, 0);
        if (global.weeklyCeilingMinutes !== undefined && weeklyUse > global.weeklyCeilingMinutes)
            (0, database_1.reject)("SCHEDULE_CONFLICT", "Weekly availability has been exceeded.", "APPLY");
        for (const target of targets)
            if (target.intent.availability?.perGoalWeeklyCeilingMinutes !== undefined &&
                (perGoal.get(`${target.plan.goalId ?? target.plan.reservedGoalId}/${week}`) ?? 0) > target.intent.availability.perGoalWeeklyCeilingMinutes)
                (0, database_1.reject)("SCHEDULE_CONFLICT", "The goal's accepted weekly ceiling has been exceeded.", "APPLY");
    }
}
async function contextForPlans(sql, ownerId, plans) {
    const intent = (await (0, intents_1.loadIntent)(sql, ownerId, plans[0].workingIntentVersionId)).intent;
    return loadExecutionContext(sql, ownerId, plans, intent);
}
