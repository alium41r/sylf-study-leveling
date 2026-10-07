"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.weeklyRemainingCapacity = weeklyRemainingCapacity;
exports.goalRemainingCapacity = goalRemainingCapacity;
exports.maximumNewTimebox = maximumNewTimebox;
const context_1 = require("../server/context");
const database_1 = require("../server/database");
/** Daily and weekly ceilings are concurrent upper bounds, not two debits.
 * Reserve a single disclosed percentage at each bound. In a partial week only
 * the remaining bookable days contribute recovery; excluded days reserve none. */
function weeklyRemainingCapacity(envelope, week) {
    const dailyMargin = envelope.days.filter(d => !d.excluded && (0, context_1.weekKey)(d.date) === week.week).reduce((n, d) => n + d.recoveryMinutes, 0);
    const recovery = Math.min(dailyMargin, Math.ceil(envelope.weeklyCeilingMinutes * envelope.recoveryPercent / 100));
    return Math.max(0, envelope.weeklyCeilingMinutes - Math.ceil(week.otherCommittedMinutes) - week.protectedTargetMinutes - recovery);
}
function goalRemainingCapacity(envelope, planRef, week) {
    const ceiling = envelope.targets.find(t => t.planRef === planRef)?.perGoalWeeklyCeilingMinutes;
    if (ceiling === undefined)
        (0, database_1.reject)('REFERENCE_NOT_OWNED', 'Unknown allocation target.', 'ALLOCATION');
    if (ceiling === null)
        return Infinity;
    const base = week.perGoalCommittedMinutes.find(p => p.planRef === planRef)?.minutes;
    if (base === undefined)
        (0, database_1.reject)('INVALID_OUTPUT', 'Owned per-goal week usage is missing.', 'ALLOCATION');
    const protectedRemaining = envelope.protectedExecution.filter(p => p.planRef === planRef && (0, context_1.weekKey)(p.date) === week.week).reduce((n, p) => n + p.remainingMinutes, 0);
    return Math.max(0, ceiling - Math.ceil(base) - protectedRemaining);
}
/** Upper bound for a new indivisible activity, after exact retained unstarted
 * reservations. This chooses only whether declared pieces need expansion. */
function maximumNewTimebox(envelope, facts, planRef) {
    const target = envelope.targets.find(t => t.planRef === planRef);
    if (!target)
        (0, database_1.reject)('REFERENCE_NOT_OWNED', 'Unknown split target.', 'BLUEPRINT');
    const kept = facts.pins.filter(p => !p.alreadyReserved), maximum = facts.preferences.find(p => p.planRef === planRef)?.maximumTimeboxMinutes ?? 240;
    return Math.min(maximum, Math.max(0, ...envelope.days.filter(d => !d.excluded && d.date >= envelope.today && (target.deadline.kind !== 'FIXED' || d.date < target.deadline.date || d.date === target.deadline.date && target.deadline.examDayStudyAllowed)).map(day => {
        const week = facts.weeks.find(w => w.week === (0, context_1.weekKey)(day.date));
        if (!week)
            (0, database_1.reject)('INVALID_OUTPUT', 'Owned weekly split facts are missing.', 'BLUEPRINT');
        const dailyKept = kept.filter(p => p.date === day.date).reduce((n, p) => n + p.remainingMinutes, 0), weeklyKept = kept.filter(p => (0, context_1.weekKey)(p.date) === week.week).reduce((n, p) => n + p.remainingMinutes, 0), goalKept = kept.filter(p => p.planRef === planRef && (0, context_1.weekKey)(p.date) === week.week).reduce((n, p) => n + p.remainingMinutes, 0);
        return Math.max(0, Math.min(day.availableMinutes - dailyKept, weeklyRemainingCapacity(envelope, week) - weeklyKept, goalRemainingCapacity(envelope, planRef, week) - goalKept));
    })));
}
