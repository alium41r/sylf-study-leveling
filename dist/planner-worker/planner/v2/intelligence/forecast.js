"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.forecastLearning = forecastLearning;
const capacity_1 = require("./capacity");
const context_1 = require("../server/context");
/** Aggregate phase forecasts are opportunity estimates, never invented tasks
 * or split boundaries. Each uncertainty scenario shares capacity across goals. */
function forecastLearning(snapshot, report, envelope, facts, unreviewed = []) {
    const unavailable = new Set(unreviewed.map(p => `${p.planRef}/${p.phaseRef}`));
    const pin = new Map(facts.pins.map(p => [`${p.planRef}/${p.activityRef}`, p]));
    const phaseCharges = new Map();
    const booked = new Map();
    const last = new Map();
    for (const placement of report.placements) {
        const activity = snapshot.plans.find(p => p.planRef === placement.planRef).blueprint.activities.find(a => a.localId === placement.activityRef);
        const owned = pin.get(`${placement.planRef}/${placement.activityRef}`);
        const remaining = owned?.remainingMinutes ?? placement.minutes;
        if (remaining === 0)
            continue;
        const dayCharge = owned?.alreadyReserved ? 0 : remaining;
        booked.set(placement.date, (booked.get(placement.date) ?? 0) + dayCharge);
        // A shared activity consumes its one owner's capacity once. Phase charges
        // likewise assign that activity to its first declared outcome, not every benefit.
        const phase = activity.outcomeRefs[0];
        if (phase)
            phaseCharges.set(`${placement.planRef}/${phase}`, (phaseCharges.get(`${placement.planRef}/${phase}`) ?? 0) + remaining);
        if (phase)
            last.set(`${placement.planRef}/${phase}`, [last.get(`${placement.planRef}/${phase}`) ?? "", placement.date].sort().at(-1));
    }
    const scenarios = ["lowMinutes", "likelyMinutes", "highMinutes"].map(field => {
        const daily = new Map(envelope.days.map(day => [day.date, Math.max(0, day.availableMinutes - (booked.get(day.date) ?? 0))]));
        const weekly = new Map(facts.weeks.map(week => [week.week, Math.max(0, (0, capacity_1.weeklyRemainingCapacity)(envelope, week) - envelope.days.filter(d => (0, context_1.weekKey)(d.date) === week.week).reduce((n, d) => n + (booked.get(d.date) ?? 0), 0))]));
        const goals = new Map();
        for (const target of envelope.targets)
            for (const week of facts.weeks) {
                const own = report.placements.filter(p => p.planRef === target.planRef && (0, context_1.weekKey)(p.date) === week.week).reduce((n, p) => n + (pin.get(`${p.planRef}/${p.activityRef}`)?.alreadyReserved ? 0 : pin.get(`${p.planRef}/${p.activityRef}`)?.remainingMinutes ?? p.minutes), 0);
                goals.set(`${target.planRef}/${week.week}`, Math.max(0, (0, capacity_1.goalRemainingCapacity)(envelope, target.planRef, week) - own));
            }
        const result = new Map();
        for (const plan of snapshot.plans) {
            let earliest = envelope.today;
            const deadline = envelope.targets.find(t => t.planRef === plan.planRef).deadline;
            for (const phase of plan.blueprint.strategy.phases) {
                if (!phase.effort || unavailable.has(`${plan.planRef}/${phase.localId}`))
                    break;
                earliest = [earliest, last.get(`${plan.planRef}/${phase.localId}`) ?? envelope.today].sort().at(-1);
                let remaining = Math.max(0, phase.effort[field] - (phaseCharges.get(`${plan.planRef}/${phase.localId}`) ?? 0));
                let finish = earliest;
                if (remaining > 0) {
                    finish = undefined;
                    for (const day of envelope.days) {
                        if (day.excluded || day.date < earliest || deadline.kind === "FIXED" && (day.date > deadline.date || day.date === deadline.date && !deadline.examDayStudyAllowed))
                            continue;
                        const week = (0, context_1.weekKey)(day.date), goalKey = `${plan.planRef}/${week}`;
                        const used = Math.min(remaining, daily.get(day.date) ?? 0, weekly.get(week) ?? 0, goals.get(goalKey) ?? 0);
                        if (used <= 0)
                            continue;
                        remaining -= used;
                        daily.set(day.date, daily.get(day.date) - used);
                        weekly.set(week, weekly.get(week) - used);
                        goals.set(goalKey, goals.get(goalKey) - used);
                        finish = day.date;
                        if (remaining === 0)
                            break;
                    }
                }
                if (remaining === 0 && finish) {
                    result.set(`${plan.planRef}/${phase.localId}`, finish);
                    earliest = finish;
                }
                else
                    break;
            }
        }
        return result;
    });
    return snapshot.plans.map(plan => ({ planRef: plan.planRef, phases: plan.blueprint.strategy.phases.map((phase, index) => {
            const id = `${plan.planRef}/${phase.localId}`;
            const likely = scenarios[1].get(id);
            return { phaseRef: phase.localId, ...(phase.effort && !unavailable.has(id) ? { effort: phase.effort, remainingLikelyMinutes: Math.max(0, phase.effort.likelyMinutes - (phaseCharges.get(id) ?? 0)) } : {}),
                status: !phase.effort || unavailable.has(id) ? "UNKNOWN_EFFORT" : likely ? "PROJECTED" : plan.blueprint.strategy.phases.slice(0, index).some(p => !p.effort || unavailable.has(`${plan.planRef}/${p.localId}`)) ? "FORECAST_BLOCKED" : "BEYOND_FORECAST_WINDOW", booked: false,
                ...(scenarios[0].has(id) ? { lowFinishDate: scenarios[0].get(id) } : {}), ...(likely ? { likelyFinishDate: likely } : {}), ...(scenarios[2].has(id) ? { highFinishDate: scenarios[2].get(id) } : {}) };
        }) }));
}
