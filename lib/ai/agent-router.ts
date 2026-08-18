// ============================================================
// Agent Router — Intent Classification for Specialized Agents
// ============================================================
// Lightweight deterministic classifier that routes user messages
// to the most appropriate specialist agent. Uses keyword patterns
// combined with contextual heuristics — NOT an LLM call.
//
// Only needs CoreContext-level data for routing (no expensive
// dynamic sections required). This keeps routing fast and free.
// ============================================================

/**
 * Minimal context required for routing decisions.
 * Intentionally small — uses only core context data.
 */
export interface RouterContext {
  user: { hp: number; maxHp: number };
  today: { overdueCount: number };
  // Optional enrichment data (only if cheaply available)
  subjectNames?: string[];
  memoryKeys?: string[];
}

export type AgentType = "general" | "planner" | "calendar" | "coach" | "analyst";

interface RouteResult {
  agent: AgentType;
  confidence: number; // 0-1 how confident the router is
  reason: string;     // Human-readable explanation for debugging
}

// ─── Pattern Definitions ─────────────────────────────────────

const PLANNER_PATTERNS = [
  /\b(create|make|generate|build|plan|design|edit|change|update|modify|adjust|rename)\b.*\b(plan|schedule|study plan|quest(?:s)?|task(?:s)?|routine|timetable|curriculum|duration|time)\b/i,
  /\b(plan|schedule|organize|arrange|structure)\b.*\b(study|week|month|revision|exam|test)\b/i,
  /\b(study plan|weekly plan|daily plan|revision plan|exam prep)\b/i,
  /\bhow should i (study|prepare|revise|plan)\b/i,
  /\bi have (an? )?exam/i,
  /\b(prepare|prep) for\b/i,
  /\b(start|begin) (studying|learning|revising)\b/i,
  /\bspread (these|my|the)?\s*(quests?|tasks?|work)\b/i,
  /\bmake .*(easier|harder|lighter|heavier)\b/i,
  /\b(lighter|heavier|easier|harder) (schedule|workload|week|day)\b/i,
  /\blighten (my )?workload\b/i,
  /\b(delete|remove|wipe|cancel|drop)\b.*\b(quest(?:s)?|task(?:s)?|goal(?:s)?|everything|all)\b/i,
  /\b(change|edit|update|increase|decrease|set)\b.*\b(duration|minutes?|hours?|time)\b/i,
];

const CALENDAR_PATTERNS = [
  /\b(move|reschedule|shift|push|postpone|delay|bring forward)\b.*\b(quest|task|session|everything|all)\b/i,
  /\b(move|reschedule|shift|push|postpone)\b.*\b(to|from|until|after|before)\b.*\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|next week|next month)\b/i,
  /\b(swap|switch|exchange)\b.*\b(quest|task)\b/i,
  /\b(clear|free up|empty)\b.*\b(day|monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today)\b/i,
  /\b(leave|keep)\b.*\b(free|empty|open)\b/i,
  /\bmove (everything|all|my)\b/i,
  /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b.*\b(free|busy|full|empty)\b/i,
  /\bi (have|got|need)\b.*\b(on|this|next)\b.*\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  /\bi('m| am) (busy|unavailable|traveling|travelling|sick|ill)\b/i,
  /\bfootball|soccer|practice|training|appointment|doctor|meeting\b.*\b(on|this)\b/i,
  /\b(sort|fix|handle|deal with)\b.*\b(overdue|late|behind|missed|backlog)\b/i,
];

const COACH_PATTERNS = [
  /\bhow (am i|did i|have i) (doing|do|done|performed|been)\b/i,
  /\bmy (progress|performance|stats|statistics|streak|growth|improvement)\b/i,
  /\b(how|what) (is|are) my\b.*\b(stats|progress|rank|level|streak)\b/i,
  /\bam i (improving|getting better|on track|falling behind)\b/i,
  /\b(motivate|encourage|coach|advise|guide) me\b/i,
  /\bwhat should i (focus on|improve|work on|prioritize)\b/i,
  /\bgive me (feedback|advice|tips|suggestions|recommendations)\b/i,
  /\b(burnout|overwork|tired|exhausted|stressed|overwhelmed)\b/i,
  /\bshould i (take a break|rest|stop)\b/i,
  /\bweekly (review|summary|report)\b/i,
];

const ANALYST_PATTERNS = [
  /\bwhich (subject|topic|area) (am i|do i|is)\b/i,
  /\b(best|worst|strongest|weakest) (subject|topic|at)\b/i,
  /\b(compare|comparison|vs|versus)\b.*\b(subject|topic)\b/i,
  /\b(analytics|analysis|breakdown|detailed stats|statistics)\b/i,
  /\bstudy (pattern|habits|trends|history)\b/i,
  /\b(average|avg) (time|duration|focus|session)\b/i,
  /\b(completion|success|failure|focus) rate\b/i,
  /\bwhen do i (study best|focus best|perform best)\b/i,
  /\b(time|hours) (spent|studied|logged)\b/i,
  /\bsubject (stats|data|performance|intelligence)\b/i,
];

// ─── Scoring Function ────────────────────────────────────────

function scorePatterns(message: string, patterns: RegExp[]): number {
  let matches = 0;
  for (const pattern of patterns) {
    if (pattern.test(message)) matches++;
  }
  return matches;
}

// ─── Context-Based Boosting ──────────────────────────────────

function applyContextBoosts(
  scores: Record<AgentType, number>,
  message: string,
  context: RouterContext
): void {
  // If user has overdue quests and mentions them, boost calendar
  if (context.today.overdueCount > 0 && /\b(overdue|late|behind|missed)\b/i.test(message)) {
    scores.calendar += 1;
    scores.coach += 0.5;
  }

  // If user's HP is low, boost coach for burnout detection
  if (context.user.hp < context.user.maxHp * 0.3) {
    if (/\b(tired|overwhelmed|too much|difficult|hard|struggling)\b/i.test(message)) {
      scores.coach += 1;
    }
  }

  // If user mentions a specific day name, boost calendar
  if (/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|next week)\b/i.test(message)) {
    scores.calendar += 0.5;
  }

  // If message mentions a known subject name, boost analyst
  if (context.subjectNames) {
    for (const name of context.subjectNames) {
      if (message.toLowerCase().includes(name.toLowerCase())) {
        scores.analyst += 0.5;
        break;
      }
    }
  }

  // If user has exam-related memories and mentions exam, boost planner
  if (context.memoryKeys?.some(k => k.includes("exam"))) {
    if (/\b(exam|test|midterm|final)\b/i.test(message)) {
      scores.planner += 0.5;
    }
  }
}

// ─── Main Router ─────────────────────────────────────────────

/**
 * Route a user message to the most appropriate specialist agent.
 * Returns the agent type, confidence level, and reasoning.
 *
 * This is a fast deterministic classifier — NOT an LLM call.
 */
export function routeMessage(message: string, context: RouterContext): RouteResult {
  const scores: Record<AgentType, number> = {
    general: 0,
    planner: 0,
    calendar: 0,
    coach: 0,
    analyst: 0,
  };

  // Score each agent
  scores.planner = scorePatterns(message, PLANNER_PATTERNS);
  scores.calendar = scorePatterns(message, CALENDAR_PATTERNS);
  scores.coach = scorePatterns(message, COACH_PATTERNS);
  scores.analyst = scorePatterns(message, ANALYST_PATTERNS);

  // Apply context-based boosting
  applyContextBoosts(scores, message, context);

  // Find the highest-scoring agent
  let bestAgent: AgentType = "general";
  let bestScore = 0;

  for (const [agent, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestAgent = agent as AgentType;
    }
  }

  // Calculate confidence
  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
  const confidence = totalScore > 0 ? bestScore / totalScore : 0;

  // If no pattern matched at all, or confidence is too low, default to general
  if (bestScore === 0 || confidence < 0.3) {
    return {
      agent: "general",
      confidence: 1.0,
      reason: "No specialist pattern matched — using general assistant",
    };
  }

  // If two agents are very close in score, only fall back to general when
  // the winning score is itself low. Strong matches (>=1.5) are trusted
  // even with close runners-up, since context boosts create fractional noise.
  const sortedScores = Object.entries(scores)
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1]);

  if (
    sortedScores.length >= 2 &&
    sortedScores[0][1] - sortedScores[1][1] < 0.5 &&
    sortedScores[0][1] < 1.5 &&
    sortedScores[0][0] !== "general" &&
    sortedScores[1][0] !== "general"
  ) {
    return {
      agent: "general",
      confidence: 0.5,
      reason: `Ambiguous between ${sortedScores[0][0]} and ${sortedScores[1][0]} — using general assistant`,
    };
  }

  const reasons: Record<AgentType, string> = {
    general: "General conversation detected",
    planner: "Study planning or schedule creation intent detected",
    calendar: "Calendar manipulation or scheduling intent detected",
    coach: "Progress coaching or performance review intent detected",
    analyst: "Analytics or subject comparison intent detected",
  };

  return {
    agent: bestAgent,
    confidence: Math.min(confidence, 1.0),
    reason: reasons[bestAgent],
  };
}
