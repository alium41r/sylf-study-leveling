"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.allocateLearning = allocateLearning;
const scheduling_1 = require("./schemas/scheduling");
const capacity_1 = require("./capacity");
const planning_1 = require("./schemas/planning");
const checkpoint_1 = require("./schemas/checkpoint");
const context_1 = require("../server/context");
const database_1 = require("../server/database");
const key = (plan, activity) => `${plan}/${activity}`;
const gap = (before, after) => (Date.parse(after) - Date.parse(before)) / 86400000;
/** Remaining/actual/week facts come from the Phase 1 owner, never model output. */
function allocateLearning(raw, rawEnvelope, rawFacts, options = {}) {
    const snapshot = checkpoint_1.BlueprintSnapshotSchema.parse(raw), envelope = scheduling_1.SchedulingEnvelopeSchema.parse(rawEnvelope), facts = planning_1.AllocationFactsSchema.parse(rawFacts);
    const limit = options.maximumSearchNodes ?? 20000;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100000)
        (0, database_1.reject)("INVALID_OUTPUT", "Invalid bounded allocation search allowance.", "ALLOCATION");
    const target = new Map(envelope.targets.map(t => [t.planRef, t]));
    if (snapshot.plans.length !== target.size || snapshot.plans.some(p => !target.has(p.planRef)))
        (0, database_1.reject)("INVALID_OUTPUT", "Allocation targets differ from the accepted envelope.", "ALLOCATION");
    const pins = new Map(facts.pins.map(p => [key(p.planRef, p.activityRef), p]));
    const external = new Map(facts.externalActivities.map(a => [a.ref, a]));
    const weeks = new Map(facts.weeks.map(w => [w.week, w]));
    if (pins.size !== facts.pins.length || external.size !== facts.externalActivities.length || weeks.size !== facts.weeks.length)
        (0, database_1.reject)("INVALID_OUTPUT", "Ambiguous owned allocation facts.", "ALLOCATION");
    if (facts.preferences.length !== target.size || new Set(facts.preferences.map(p => p.planRef)).size !== target.size || facts.preferences.some(p => !target.has(p.planRef)) || facts.weeks.some(w => new Set(w.perGoalCommittedMinutes.map(p => p.planRef)).size !== w.perGoalCommittedMinutes.length))
        (0, database_1.reject)("INVALID_OUTPUT", "Ambiguous target preference/weekly facts.", "ALLOCATION");
    if (facts.pins.some(pin => pin.alreadyReserved && !envelope.protectedExecution.some(p => p.planRef === pin.planRef && p.activityRef === pin.activityRef)))
        (0, database_1.reject)("PROTECTED_EXECUTION", "A retained reservation must match the authoritative envelope.", "ALLOCATION");
    for (const date of envelope.days)
        if (!weeks.has((0, context_1.weekKey)(date.date)))
            (0, database_1.reject)("INVALID_OUTPUT", "Same-week commitments outside the detailed window are required.", "ALLOCATION");
    for (const protectedWork of envelope.protectedExecution) {
        const pin = pins.get(key(protectedWork.planRef, protectedWork.activityRef));
        if (!pin || !pin.alreadyReserved || ["date", "contentDigest", "executionVersion", "actualSeconds", "remainingMinutes", "state", "remainingDisposition"].some(field => Reflect.get(pin, field) !== Reflect.get(protectedWork, field)))
            (0, database_1.reject)("PROTECTED_EXECUTION", "Protected work lacks its exact owned pin.", "ALLOCATION");
    }
    const nodes = new Map();
    let priority = 0;
    for (const plan of snapshot.plans)
        for (const activity of plan.blueprint.activities)
            if (activity.commitment.category === "COMMITTED") {
                const id = key(plan.planRef, activity.localId), pin = pins.get(id);
                if (!pin && (activity.timeboxMinutes < envelope.timeboxRange.minMinutes || activity.timeboxMinutes > envelope.timeboxRange.maxMinutes))
                    (0, database_1.reject)("INVALID_OUTPUT", "A timebox exceeds the accepted technical range.", "ALLOCATION");
                if (pin && pin.state === "UNSTARTED" && (pin.remainingMinutes !== activity.timeboxMinutes || pin.actualSeconds !== 0))
                    (0, database_1.reject)("INVALID_OUTPUT", "Kept unstarted work must reserve its approved timebox.", "ALLOCATION");
                nodes.set(id, { key: id, planRef: plan.planRef, activity, priority: priority++, pin, charge: pin?.alreadyReserved ? 0 : pin?.remainingMinutes ?? activity.timeboxMinutes });
            }
    if (facts.pins.some(p => !nodes.has(key(p.planRef, p.activityRef))))
        (0, database_1.reject)("PROTECTED_EXECUTION", "Retained work cannot disappear from the allocation.", "ALLOCATION");
    const edges = [];
    const externalEdges = [];
    const add = (ref, node, minimum = 0, maximum) => { const before = key(node.planRef, ref); if (nodes.has(before))
        edges.push({ before, after: node.key, minimum, maximum });
    else {
        const owned = external.get(ref);
        if (!owned?.available)
            (0, database_1.reject)("REFERENCE_NOT_OWNED", "A committed prerequisite/window anchor is unavailable or uncommitted.", "ALLOCATION");
        externalEdges.push({ ref, node: node.key, minimum, maximum });
    } };
    for (const node of nodes.values()) {
        node.activity.hardDependencies.forEach(ref => add(ref, node));
        const window = node.activity.learningWindow;
        if (window?.strength === "HARD")
            add(window.anchorActivityId, node, window.minimumGapDays ?? 0, window.maximumGapDays);
    }
    for (const edge of snapshot.sharedDependencies)
        if (edge.strength === "HARD") {
            const before = key(edge.prerequisite.planRef, edge.prerequisite.activityId), after = key(edge.dependent.planRef, edge.dependent.activityId);
            if (nodes.has(after)) {
                if (!nodes.has(before))
                    (0, database_1.reject)("INVALID_OUTPUT", "Committed joint work cannot depend on optional work.", "ALLOCATION");
                edges.push({ before, after, minimum: 0 });
            }
        }
    const visiting = new Set(), visited = new Set();
    const walk = (id) => { if (visiting.has(id))
        (0, database_1.reject)("INVALID_OUTPUT", "Hard dependency/window cycle.", "ALLOCATION"); if (visited.has(id))
        return; visiting.add(id); for (const edge of edges.filter(e => e.after === id))
        walk(edge.before); visiting.delete(id); visited.add(id); };
    for (const id of nodes.keys())
        walk(id);
    const days = new Map(envelope.days.map(d => [d.date, d]));
    const anchorDate = (node, date) => node.pin?.state === "COMPLETED" ? node.pin.completionDate ?? date : date;
    const domains = new Map();
    for (const node of nodes.values()) {
        const deadline = target.get(node.planRef).deadline;
        const allowed = envelope.days.filter(d => !d.excluded && d.date >= envelope.today && (deadline.kind !== "FIXED" || d.date < deadline.date || d.date === deadline.date && deadline.examDayStudyAllowed)).map(d => d.date).sort();
        const candidates = (node.pin?.remainingMinutes ?? node.activity.timeboxMinutes) > (facts.preferences.find(p => p.planRef === node.planRef)?.maximumTimeboxMinutes ?? 240) ? [] : node.pin?.state === "COMPLETED" ? [node.pin.date] : node.pin ? allowed.filter(date => date === node.pin.date) : allowed;
        domains.set(node.key, candidates.filter(date => externalEdges.filter(e => e.node === node.key).every(edge => { const interval = gap(external.get(edge.ref).date, date); return interval >= edge.minimum && (edge.maximum === undefined || interval <= edge.maximum); })));
    }
    // Arc consistency narrows necessary date sets; it never changes pedagogy.
    let changed = true;
    while (changed) {
        changed = false;
        for (const edge of edges) {
            const a = domains.get(edge.before), b = domains.get(edge.after);
            const compatible = (x, y) => { const interval = gap(anchorDate(nodes.get(edge.before), x), y); return interval >= edge.minimum && (edge.maximum === undefined || interval <= edge.maximum); };
            const aa = a.filter(x => b.some(y => compatible(x, y))), bb = b.filter(y => a.some(x => compatible(x, y)));
            if (aa.length !== a.length) {
                domains.set(edge.before, aa);
                changed = true;
            }
            if (bb.length !== b.length) {
                domains.set(edge.after, bb);
                changed = true;
            }
        }
    }
    const dayUsed = new Map(), weekUsed = new Map(), goalUsed = new Map();
    const weekRemaining = (week) => (0, capacity_1.weeklyRemainingCapacity)(envelope, weeks.get(week));
    const goalRemaining = (plan, week) => (0, capacity_1.goalRemainingCapacity)(envelope, plan, weeks.get(week));
    const available = (node, date) => { if (node.pin?.state === "COMPLETED")
        return Infinity; const day = days.get(date); if (!day || day.excluded)
        return 0; const week = (0, context_1.weekKey)(date); return Math.max(0, Math.min(day.availableMinutes - (dayUsed.get(date) ?? 0), weekRemaining(week) - (weekUsed.get(week) ?? 0), goalRemaining(node.planRef, week) - (goalUsed.get(`${node.planRef}/${week}`) ?? 0))); };
    const consume = (node, date, direction) => { if (!node.charge)
        return; const week = (0, context_1.weekKey)(date); for (const [map, id] of [[dayUsed, date], [weekUsed, week], [goalUsed, `${node.planRef}/${week}`]])
        map.set(id, (map.get(id) ?? 0) + node.charge * direction); };
    const chargeable = [...nodes.values()].filter(n => n.charge > 0);
    const proof = (subset, single = false) => {
        const dates = [...new Set(subset.flatMap(n => domains.get(n.key)))].sort();
        const required = subset.reduce((n, t) => n + t.charge, 0);
        let capacity = 0;
        for (const week of new Set(dates.map(context_1.weekKey))) {
            const same = dates.filter(d => (0, context_1.weekKey)(d) === week);
            let daily = 0;
            for (const date of same) {
                const cap = days.get(date)?.availableMinutes ?? 0;
                const possible = subset.filter(n => domains.get(n.key).includes(date)).map(n => n.charge);
                // Indivisible timeboxes give a tighter necessary bound than raw minutes.
                const reachable = new Uint8Array(cap + 1);
                reachable[0] = 1;
                for (const amount of possible)
                    for (let m = cap; m >= amount; m--)
                        if (reachable[m - amount])
                            reachable[m] = 1;
                let maximum = cap;
                while (maximum > 0 && !reachable[maximum])
                    maximum--;
                daily += single ? Math.min(maximum, goalRemaining(subset[0].planRef, week)) : maximum;
            }
            const goals = [...new Set(subset.map(n => n.planRef))].reduce((n, p) => n + goalRemaining(p, week), 0);
            capacity += Math.min(daily, weekRemaining(week), goals);
        }
        if (single)
            capacity = Math.max(0, ...dates.map(date => Math.min(days.get(date)?.availableMinutes ?? 0, weekRemaining((0, context_1.weekKey)(date)), goalRemaining(subset[0].planRef, (0, context_1.weekKey)(date)))));
        if (required > capacity)
            return { planRefs: [...new Set(subset.map(n => n.planRef))], dates: dates.length ? dates : envelope.days.map(d => d.date).length ? envelope.days.map(d => d.date) : [envelope.window.start], requiredMinutes: required, availableMinutes: Math.floor(capacity),
                explanation: `${required} remaining minutes require ${single ? "one indivisible valid day" : "the constrained dates"}; the necessary upper bound is ${Math.floor(capacity)} minutes under the disclosed ${envelope.recoveryPercent}% recovery margin. This is a capacity bound, not a failed heuristic.` };
        return null;
    };
    let capacityProof = null;
    for (const day of envelope.days)
        if (day.otherCommittedMinutes + day.protectedTargetMinutes > day.ceilingMinutes) {
            capacityProof = { planRefs: envelope.targets.map(t => t.planRef), dates: [day.date], requiredMinutes: Math.ceil(day.otherCommittedMinutes + day.protectedTargetMinutes), availableMinutes: day.ceilingMinutes, explanation: "Existing actual/remaining commitments already exceed the accepted daily ceiling. They have not been trimmed." };
            break;
        }
    for (const week of facts.weeks.filter(w => envelope.days.some(d => (0, context_1.weekKey)(d.date) === w.week))) {
        const existing = Math.ceil(week.otherCommittedMinutes) + week.protectedTargetMinutes;
        if (!capacityProof && existing > envelope.weeklyCeilingMinutes)
            capacityProof = { planRefs: envelope.targets.map(t => t.planRef), dates: envelope.days.filter(d => (0, context_1.weekKey)(d.date) === week.week).map(d => d.date).length ? envelope.days.filter(d => (0, context_1.weekKey)(d.date) === week.week).map(d => d.date) : [envelope.window.start], requiredMinutes: existing, availableMinutes: envelope.weeklyCeilingMinutes, explanation: "Owned same-week actual and protected commitments already exceed the global ceiling; none was removed." };
        for (const t of envelope.targets) {
            const used = Math.ceil(week.perGoalCommittedMinutes.find(p => p.planRef === t.planRef)?.minutes ?? 0) + envelope.protectedExecution.filter(p => p.planRef === t.planRef && (0, context_1.weekKey)(p.date) === week.week).reduce((n, p) => n + p.remainingMinutes, 0);
            if (!capacityProof && t.perGoalWeeklyCeilingMinutes !== null && used > t.perGoalWeeklyCeilingMinutes)
                capacityProof = { planRefs: [t.planRef], dates: [week.week], requiredMinutes: used, availableMinutes: t.perGoalWeeklyCeilingMinutes, explanation: "Owned per-goal same-week commitments exceed the accepted goal ceiling; no effort was counted twice or trimmed." };
        }
    }
    for (const node of chargeable)
        capacityProof ??= proof([node], true);
    capacityProof ??= proof(chargeable);
    for (const plan of snapshot.plans)
        capacityProof ??= proof(chargeable.filter(n => n.planRef === plan.planRef));
    for (const end of [...new Set(chargeable.map(n => domains.get(n.key).at(-1)).filter((d) => !!d))])
        capacityProof ??= proof(chargeable.filter(n => (domains.get(n.key).at(-1) ?? "") <= end));
    const assigned = new Map();
    let best = new Map();
    let attempts = 0;
    const validEdges = (id, date) => edges.every(edge => {
        const before = edge.before === id ? date : assigned.get(edge.before), after = edge.after === id ? date : assigned.get(edge.after);
        if (!before || !after)
            return true;
        const interval = gap(anchorDate(nodes.get(edge.before), before), after);
        return interval >= edge.minimum && (edge.maximum === undefined || interval <= edge.maximum);
    });
    // Exact pins are immutable. Started minutes are already subtracted by the
    // envelope; unstarted kept work is charged here once.
    for (const node of nodes.values())
        if (node.pin && domains.get(node.key).length) {
            const date = node.pin.date;
            if (available(node, date) >= node.charge && validEdges(node.key, date)) {
                assigned.set(node.key, date);
                consume(node, date, 1);
            }
        }
    best = new Map(assigned);
    const candidateDates = (node) => domains.get(node.key).filter(date => available(node, date) >= node.charge && validEdges(node.key, date)).sort((a, b) => {
        const window = node.activity.learningWindow;
        const known = (ref) => { const own = nodes.get(key(node.planRef, ref)); return own && assigned.has(own.key) ? anchorDate(own, assigned.get(own.key)) : external.get(ref)?.date; };
        const anchor = window ? known(window.anchorActivityId) : undefined;
        if (anchor && window?.preferredGapDays !== undefined) {
            const difference = Math.abs(gap(anchor, a) - window.preferredGapDays) - Math.abs(gap(anchor, b) - window.preferredGapDays);
            if (difference)
                return difference;
        }
        const heavy = (date) => [...assigned].filter(([id, d]) => d === date && nodes.get(id).activity.cognitiveDemand === "HEAVY").length;
        if (node.activity.cognitiveDemand === "HEAVY" && heavy(a) !== heavy(b))
            return heavy(a) - heavy(b);
        if (facts.preferences.find(p => p.planRef === node.planRef)?.pacing === "SPREAD") {
            const load = (date) => (dayUsed.get(date) ?? 0) / Math.max(1, days.get(date)?.availableMinutes ?? 1);
            if (load(a) !== load(b))
                return load(a) - load(b);
        }
        return a.localeCompare(b);
    });
    const search = () => {
        if (assigned.size > best.size)
            best = new Map(assigned);
        if (assigned.size === nodes.size)
            return true;
        if (++attempts > limit)
            return false;
        const ready = [...nodes.values()].filter(n => !assigned.has(n.key) && !n.pin && edges.filter(e => e.after === n.key).every(e => assigned.has(e.before)));
        ready.sort((a, b) => domains.get(a.key).length - domains.get(b.key).length || a.priority - b.priority || a.key.localeCompare(b.key));
        const node = ready[0];
        if (!node)
            return false;
        for (const date of candidateDates(node)) {
            assigned.set(node.key, date);
            consume(node, date, 1);
            if (search())
                return true;
            consume(node, date, -1);
            assigned.delete(node.key);
            if (attempts >= limit)
                break;
        }
        return false;
    };
    search();
    assigned.clear();
    for (const [id, date] of best)
        assigned.set(id, date);
    dayUsed.clear();
    weekUsed.clear();
    goalUsed.clear();
    for (const [id, date] of assigned)
        consume(nodes.get(id), date, 1);
    // One bounded local improvement pass toward the accepted pacing and the
    // AI-declared advisory windows. Exact pins and all hard constraints survive.
    for (const node of [...nodes.values()].reverse())
        if (!node.pin && assigned.has(node.key)) {
            const old = assigned.get(node.key);
            consume(node, old, -1);
            assigned.delete(node.key);
            const date = candidateDates(node)[0] ?? old;
            assigned.set(node.key, date);
            consume(node, date, 1);
        }
    const placements = [...nodes.values()].filter(n => assigned.has(n.key)).map(n => ({ planRef: n.planRef, activityRef: n.activity.localId, date: assigned.get(n.key), minutes: n.activity.timeboxMinutes }));
    const unscheduled = [...nodes.values()].filter(n => !assigned.has(n.key)).map(n => ({ planRef: n.planRef, activityRef: n.activity.localId, minutes: n.activity.timeboxMinutes }));
    const findings = [];
    const finding = (category, consequential, planRefs, activityRefs, evidence, consequence) => findings.push({ findingId: `finding_${(0, database_1.hash)("allocation-finding", { category, planRefs, evidence }).slice(0, 20)}`, category, consequential, planRefs, activityRefs: activityRefs.slice(0, 60), evidence: evidence.slice(0, 1000), consequence });
    if (capacityProof)
        finding("SHORTFALL", true, capacityProof.planRefs, unscheduled.map(t => t.activityRef), capacityProof.explanation, "The AI must explain triage, use declared meaningful chunks, or request an explicit constraint decision. No work or timebox was silently removed.");
    else if (unscheduled.length)
        finding("LEARNING_WINDOW", true, envelope.targets.map(t => t.planRef), unscheduled.map(t => t.activityRef), `${unscheduled.length} committed activities remain unplaced after bounded dependency/window/capacity search (${attempts} nodes, limit ${limit}). ${unscheduled.slice(0, 8).map(t => { const n = nodes.get(key(t.planRef, t.activityRef)); return `${t.planRef}/${t.activityRef}: approved ${t.minutes} minutes, ${domains.get(n.key).length} hard-valid dates${n.pin ? `, exact owned placement ${n.pin.date}` : ""}, accepted maximum ${facts.preferences.find(p => p.planRef === t.planRef)?.maximumTimeboxMinutes ?? 240}`; }).join("; ")}`, "This is ALLOCATION_UNRESOLVED, not proof of an impossible deadline. Consider a declared split or a targeted educational change.");
    for (const plan of snapshot.plans) {
        const own = [...nodes.values()].filter(n => n.planRef === plan.planRef && assigned.has(n.key));
        const compromises = [];
        const order = [];
        for (const node of own) {
            const date = assigned.get(node.key);
            const refDate = (ref) => { const owned = nodes.get(key(node.planRef, ref)); const date = assigned.get(key(node.planRef, ref)); return owned && date ? anchorDate(owned, date) : external.get(ref)?.date; };
            const window = node.activity.learningWindow;
            if (window) {
                const anchor = refDate(window.anchorActivityId);
                if (anchor) {
                    const interval = gap(anchor, date);
                    if (window.strength === "ADVISORY" && (window.minimumGapDays !== undefined && interval < window.minimumGapDays || window.maximumGapDays !== undefined && interval > window.maximumGapDays) || window.preferredGapDays !== undefined && interval !== window.preferredGapDays)
                        compromises.push(`${node.activity.localId}: actual gap ${interval} days versus ${JSON.stringify(window)}`);
                }
            }
            for (const ref of node.activity.advisoryOrderAfter ?? [])
                if (refDate(ref) && refDate(ref) > date)
                    order.push(`${node.activity.localId} precedes advisory ${ref}`);
        }
        if (compromises.length)
            finding("LEARNING_WINDOW", true, [plan.planRef], own.map(n => n.activity.localId), compromises.join("; "), "Ask the AI whether the actual spacing meaningfully changes learning; advisory guidance remains advisory.");
        if (order.length)
            finding("ADVISORY_ORDER", false, [plan.planRef], own.map(n => n.activity.localId), order.join("; "), "The AI can explain or revise the compromise without treating it as a hard prerequisite.");
        for (const edge of snapshot.sharedDependencies.filter(e => e.strength === "ADVISORY" && e.dependent.planRef === plan.planRef)) {
            const before = assigned.get(key(edge.prerequisite.planRef, edge.prerequisite.activityId)), after = assigned.get(key(edge.dependent.planRef, edge.dependent.activityId));
            if (before && after && before > after)
                order.push(`${edge.dependent.activityId} precedes advisory shared ${edge.prerequisite.activityId}`);
        }
        const last = own.filter(n => n.pin?.state !== "COMPLETED").map(n => assigned.get(n.key)).sort().at(-1);
        if (last)
            finding("FINISH", false, [plan.planRef], [], `Committed remaining work finishes on ${last}; the detailed window ends ${envelope.window.end}.${target.get(plan.planRef).deadline.kind === "SOFT" && last > target.get(plan.planRef).deadline.date ? " This exceeds the accepted soft target date, which was not made a hard deadline." : ""}`, "This is the finish of booked detail, not proof of overall readiness or completion of future strategic phases.");
        const risk = own.filter(n => !n.pin && n.activity.effort.highMinutes > n.activity.timeboxMinutes);
        if (risk.length)
            finding("ESTIMATE_RISK", false, [plan.planRef], risk.map(n => n.activity.localId), risk.map(n => `${n.activity.localId}: timebox ${n.activity.timeboxMinutes}, likely ${n.activity.effort.likelyMinutes}, high ${n.activity.effort.highMinutes}`).join("; "), "Reaching a timebox boundary does not prove completion; later reflection may require a reviewed remaining estimate.");
    }
    const crowded = envelope.days.filter(day => { const own = [...nodes.values()].filter(n => assigned.get(n.key) === day.date && n.pin?.state !== "COMPLETED"); return own.filter(n => n.activity.cognitiveDemand === "HEAVY").length > 1; });
    if (crowded.length)
        finding("DENSITY", true, envelope.targets.map(t => t.planRef), [], crowded.map(d => `${d.date}: multiple AI-declared heavy activities share the day`).join("; "), "This is cognitive/intensity feedback for educational judgment, not a new capacity limit or mandatory practice rule.");
    const switching = envelope.days.filter(day => new Set([...nodes.values()].filter(n => assigned.get(n.key) === day.date).flatMap(n => n.activity.scopeRefs.map(ref => `${n.planRef}/${ref}`))).size > 3);
    if (switching.length)
        finding("SWITCHING", false, envelope.targets.map(t => t.planRef), [], switching.map(d => d.date).join(", ") + ": several scope contexts share these dates.", "The AI can assess switching cost; no work is dropped or added.");
    return scheduling_1.AllocationReportSchema.parse({ schemaVersion: 2, status: capacityProof ? "CAPACITY_SHORTFALL" : unscheduled.length ? "ALLOCATION_UNRESOLVED" : "FEASIBLE", placements, unscheduled, committedMinutes: [...nodes.values()].reduce((n, t) => n + t.activity.timeboxMinutes, 0), capacityProof, findings });
}
