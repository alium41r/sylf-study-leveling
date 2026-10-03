"use strict";
// ============================================================
// Agent Router — Intent Classification & Multi-Engine Dispatch
// ============================================================
// Lightweight deterministic classifier that routes user messages
// to the most appropriate specialist agent and specialized model tier
// across DeepSeek, Google Gemini, and Groq.
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.WORKLOAD_ROUTING_TABLE = exports.STEM_PATTERNS = void 0;
exports.hasMediaAttachments = hasMediaAttachments;
exports.routeMessage = routeMessage;
exports.classifyWorkload = classifyWorkload;
exports.dispatchWithFallback = dispatchWithFallback;
const factory_1 = require("./providers/factory");
const config_1 = require("./config");
const message_intent_1 = require("./message-intent");
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
exports.STEM_PATTERNS = [
    /\b(derive|derivation|proof|prove|theorem|lemma|corollary)\b/i,
    /\b(schrodinger|lagrangian|hamiltonian|taylor series|fourier transform|eigenvalue|eigenvector|matrix proof)\b/i,
    /\b(differential equation|calculus proof|integration by parts derivation|kinematics derivation)\b/i,
    /\b(maxwell equations|quantum mechanics|thermodynamics derivation|rotational dynamics proof)\b/i,
    /\b(show that|solve step by step|rigorous proof|mathematical proof|formal proof)\b/i,
    // Deep-reasoning escalation markers → routed to reasoner models + Tier 3 verbosity
    /\b(laplace transform|maclaurin series|proof by induction|induction proof|series convergence|power series)\b/i,
    /\b(integrate|differentiate)\b.*\b(function|equation|expression|by parts)\b/i,
];
/**
 * Short imperative verbs that mark the lightweight "simple" tier.
 * These are quick CRUD / lookup-style requests that don't need reasoning
 * tokens or heavyweight context. Note: messages matching PLANNER_PATTERNS
 * or STEM_PATTERNS are explicitly excluded by the classifier.
 */
const SIMPLE_ACTION_VERB = /^(create|add|delete|remove|complete|finish|mark|move|reschedule|swap|clear|start|set|show|list|check)\b/i;
/**
 * Question-form quest lookups ("what quests do i have right now") belong to
 * the cheap tier too. The normalizer canonicalizes them to "my quests …"
 * statements, so the pattern matches both the raw and canonical forms.
 * Date-specific phrasings ("next Tuesday") are excluded by the classifier —
 * those need the full Calendar context.
 */
const QUEST_LOOKUP_QUESTION = /^(my |the )?(quests?|tasks?|schedule)( (do i have|are due|are pending|right now|today|for today))?$|^(whats? (are )?(my |the )?quests?|what quests? do i have|which quests?|any quests?|quests? (do i have|are due|are pending)|are (my )?quests? (due|pending)|show (me )?(my )?quests?|how many quests?)/i;
// ─── Workload Routing Configuration Matrix ───────────────────
exports.WORKLOAD_ROUTING_TABLE = {
    multimodal_vision: {
        workload: "multimodal_vision",
        // Gemini 3.7 Flash is the dedicated primary vision model; DeepSeek's
        // vision-exp tier is the fallback when Gemini fails (unavailable,
        // rate-limited, network error — the chat route cascades automatically).
        primary: { provider: "gemini", model: config_1.GEMINI_MODELS.vision },
        fallback: { provider: "deepseek", model: config_1.DEEPSEEK_MODELS.vision },
        description: "Multimodal Vision & Diagram Ingestion Engine",
        outputTokenCap: 1024,
    },
    planner: {
        workload: "planner",
        // In-chat planning = goal/quest CRUD via tools. Runs on the cheap flash
        // tier; the shared Flash model is reserved for the dedicated /api/ai-planner
        // orchestration (research + structured plan synthesis).
        primary: { provider: "deepseek", model: config_1.DEEPSEEK_MODELS.chat },
        fallback: { provider: "groq", model: config_1.GROQ_MODELS.chatFallback },
        secondaryFallback: { provider: "gemini", model: config_1.GEMINI_MODELS.default },
        description: "In-Chat Goal & Quest Structuring (CRUD via tools)",
        outputTokenCap: 1024,
        thinking: "disabled",
    },
    syllabus: {
        workload: "syllabus",
        primary: { provider: "deepseek", model: config_1.DEEPSEEK_MODELS.compiler },
        fallback: { provider: "gemini", model: config_1.GEMINI_MODELS.research },
        description: "AI Syllabus Constellation 48-Node Compiler",
        outputTokenCap: 8192,
    },
    complex_stem: {
        workload: "complex_stem",
        primary: { provider: "deepseek", model: config_1.DEEPSEEK_MODELS.stem },
        fallback: { provider: "deepseek", model: config_1.DEEPSEEK_MODELS.chat },
        secondaryFallback: { provider: "gemini", model: config_1.GEMINI_MODELS.stemFallback },
        description: "Complex STEM Derivations & Algorithmic Proof Engine",
        outputTokenCap: 4096,
    },
    focus_chat: {
        workload: "focus_chat",
        primary: { provider: "deepseek", model: config_1.DEEPSEEK_MODELS.focus },
        fallback: { provider: "gemini", model: config_1.GEMINI_MODELS.focus },
        description: "Focus Timer In-Session Assistant",
        outputTokenCap: 512,
        thinking: "disabled",
    },
    general_chat: {
        workload: "general_chat",
        primary: { provider: "deepseek", model: config_1.DEEPSEEK_MODELS.chat },
        fallback: { provider: "groq", model: config_1.GROQ_MODELS.chatFallback },
        secondaryFallback: { provider: "gemini", model: config_1.GEMINI_MODELS.default },
        description: "General System Chat & Companion Assistant",
        outputTokenCap: 768,
        thinking: "disabled",
    },
    calendar: {
        workload: "calendar",
        primary: { provider: "deepseek", model: config_1.DEEPSEEK_MODELS.chat },
        fallback: { provider: "groq", model: config_1.GROQ_MODELS.chatFallback },
        secondaryFallback: { provider: "gemini", model: config_1.GEMINI_MODELS.default },
        description: "Calendar & Schedule Adjustment Specialist",
        outputTokenCap: 640,
        thinking: "disabled",
    },
    coach: {
        workload: "coach",
        primary: { provider: "deepseek", model: config_1.DEEPSEEK_MODELS.chat },
        fallback: { provider: "groq", model: config_1.GROQ_MODELS.chatFallback },
        secondaryFallback: { provider: "gemini", model: config_1.GEMINI_MODELS.default },
        description: "Progress Coach & Burnout Detection Specialist",
        outputTokenCap: 768,
    },
    analyst: {
        workload: "analyst",
        primary: { provider: "deepseek", model: config_1.DEEPSEEK_MODELS.chat },
        fallback: { provider: "groq", model: config_1.GROQ_MODELS.chatFallback },
        secondaryFallback: { provider: "gemini", model: config_1.GEMINI_MODELS.default },
        description: "Study Analytics & Performance Trend Specialist",
        outputTokenCap: 1024,
    },
    simple: {
        workload: "simple",
        // Lightweight tier: short imperative CRUD/factual requests. Same cheap
        // model as general chat, but with core-only context, no reasoning
        // tokens (thinking disabled) and a tiny output budget.
        primary: { provider: "deepseek", model: config_1.DEEPSEEK_MODELS.chat },
        fallback: { provider: "groq", model: config_1.GROQ_MODELS.chatFallback },
        secondaryFallback: { provider: "gemini", model: config_1.GEMINI_MODELS.default },
        description: "Simple Action & Quick Fact Tier (no reasoning tokens)",
        outputTokenCap: 384,
        thinking: "disabled",
    },
};
// ─── Scoring Functions ───────────────────────────────────────
function scorePatterns(message, patterns) {
    let matches = 0;
    for (const pattern of patterns) {
        if (pattern.test(message))
            matches++;
    }
    return matches;
}
// ─── Media Attachment Detector ───────────────────────────────
function hasMediaAttachments(messagesOrParts) {
    if (!messagesOrParts)
        return false;
    if (Array.isArray(messagesOrParts)) {
        for (const item of messagesOrParts) {
            if (item?.parts && Array.isArray(item.parts)) {
                if (item.parts.some((p) => p && (p.inlineData || p.imageUrl || p.image_url))) {
                    return true;
                }
            }
            if (item?.inlineData || item?.imageUrl || item?.image_url) {
                return true;
            }
        }
    }
    else if (typeof messagesOrParts === "object") {
        if (messagesOrParts.inlineData || messagesOrParts.imageUrl || messagesOrParts.image_url) {
            return true;
        }
        if (Array.isArray(messagesOrParts.parts)) {
            return messagesOrParts.parts.some((p) => p && (p.inlineData || p.imageUrl || p.image_url));
        }
    }
    return false;
}
// ─── Context-Based Boosting ──────────────────────────────────
function applyContextBoosts(scores, message, context) {
    if (context.today.overdueCount > 0 && /\b(overdue|late|behind|missed)\b/i.test(message)) {
        scores.calendar += 1;
        scores.coach += 0.5;
    }
    if (context.user.hp < context.user.maxHp * 0.3) {
        if (/\b(tired|overwhelmed|too much|difficult|hard|struggling)\b/i.test(message)) {
            scores.coach += 1;
        }
    }
    if (/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|next week)\b/i.test(message)) {
        scores.calendar += 0.5;
    }
    if (context.subjectNames) {
        for (const name of context.subjectNames) {
            if (message.toLowerCase().includes(name.toLowerCase())) {
                scores.analyst += 0.5;
                break;
            }
        }
    }
    if (context.memoryKeys?.some(k => k.includes("exam"))) {
        if (/\b(exam|test|midterm|final)\b/i.test(message)) {
            scores.planner += 0.5;
        }
    }
}
// ─── Main Intent Classifier ──────────────────────────────────
/**
 * Route a user message to the most appropriate specialist agent.
 * Returns the agent type, confidence level, and reasoning.
 */
function routeMessage(message, context) {
    const scores = {
        general: 0,
        planner: 0,
        calendar: 0,
        coach: 0,
        analyst: 0,
    };
    scores.planner = scorePatterns(message, PLANNER_PATTERNS);
    scores.calendar = scorePatterns(message, CALENDAR_PATTERNS);
    scores.coach = scorePatterns(message, COACH_PATTERNS);
    scores.analyst = scorePatterns(message, ANALYST_PATTERNS);
    applyContextBoosts(scores, message, context);
    let bestAgent = "general";
    let bestScore = 0;
    for (const [agent, score] of Object.entries(scores)) {
        if (score > bestScore) {
            bestScore = score;
            bestAgent = agent;
        }
    }
    const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
    const confidence = totalScore > 0 ? bestScore / totalScore : 0;
    if (bestScore === 0 || confidence < 0.3) {
        return {
            agent: "general",
            confidence: 1.0,
            reason: "No specialist pattern matched — using general assistant",
        };
    }
    const sortedScores = Object.entries(scores)
        .filter(([, s]) => s > 0)
        .sort((a, b) => b[1] - a[1]);
    if (sortedScores.length >= 2 &&
        sortedScores[0][1] - sortedScores[1][1] < 0.5 &&
        sortedScores[0][1] < 1.5 &&
        sortedScores[0][0] !== "general" &&
        sortedScores[1][0] !== "general") {
        return {
            agent: "general",
            confidence: 0.5,
            reason: `Ambiguous between ${sortedScores[0][0]} and ${sortedScores[1][0]} — using general assistant`,
        };
    }
    const reasons = {
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
// ─── Multi-Engine Dynamic Workload Router ─────────────────────
/**
 * Classify inbound workload and select primary & fallback model route specs.
 */
function classifyWorkload(message, context, options) {
    const hasMedia = options?.hasMedia === true ||
        (options?.messages ? hasMediaAttachments(options.messages) : false);
    // 1. Multimodal Vision override
    if (hasMedia) {
        return {
            workload: "multimodal_vision",
            agent: "general",
            route: exports.WORKLOAD_ROUTING_TABLE.multimodal_vision,
            reason: "Image or diagram attachment detected; routed to multimodal vision pipeline.",
            hasMedia: true,
        };
    }
    // 2. Syllabus Compiler workload override
    if (options?.isSyllabus) {
        return {
            workload: "syllabus",
            agent: "planner",
            route: exports.WORKLOAD_ROUTING_TABLE.syllabus,
            reason: "Syllabus Constellation 48-node compilation request.",
            hasMedia: false,
        };
    }
    // 3. Autonomous Planner workload override
    if (options?.isPlanner) {
        return {
            workload: "planner",
            agent: "planner",
            route: exports.WORKLOAD_ROUTING_TABLE.planner,
            reason: "Autonomous Study Planner generation request.",
            hasMedia: false,
        };
    }
    // 4. Complex STEM Derivations & Proofs check
    const isStemMatch = exports.STEM_PATTERNS.some((p) => p.test(message));
    if (isStemMatch) {
        return {
            workload: "complex_stem",
            agent: "general",
            route: exports.WORKLOAD_ROUTING_TABLE.complex_stem,
            reason: "Complex STEM derivation or mathematical proof prompt detected.",
            hasMedia: false,
        };
    }
    // 5. In-session Focus Assistant override
    if (options?.isFocusMode) {
        return {
            workload: "focus_chat",
            agent: "general",
            route: exports.WORKLOAD_ROUTING_TABLE.focus_chat,
            reason: "In-session Focus Timer academic study assistance request.",
            hasMedia: false,
        };
    }
    // 6. Simple Action Tier — short imperative CRUD / quest-lookup requests
    //    get the lightweight route: cheap model, no reasoning tokens, and the
    //    caller skips heavyweight context for this workload. Lead-ins are
    //    normalized away so "can you tell me what quests do i have" still lands
    //    here, while date-specific queries stay on the full Calendar tier.
    const trimmed = (0, message_intent_1.normalizeMessage)(message);
    const isQuestLookup = QUEST_LOOKUP_QUESTION.test(trimmed) && !(0, message_intent_1.isDateSpecificQuery)(trimmed);
    if (trimmed.length <= 80 &&
        (SIMPLE_ACTION_VERB.test(trimmed) || isQuestLookup) &&
        !PLANNER_PATTERNS.some((p) => p.test(trimmed)) &&
        !exports.STEM_PATTERNS.some((p) => p.test(trimmed))) {
        const simpleCtx = context || {
            user: { hp: 100, maxHp: 100 },
            today: { overdueCount: 0 },
        };
        const simpleAgent = routeMessage(trimmed, simpleCtx);
        if (simpleAgent.agent === "calendar" || simpleAgent.agent === "general") {
            return {
                workload: "simple",
                agent: simpleAgent.agent,
                route: exports.WORKLOAD_ROUTING_TABLE.simple,
                reason: "Short imperative action — simple tier (no reasoning tokens).",
                hasMedia: false,
            };
        }
    }
    // 7. General Agent Classification
    const defaultCtx = context || {
        user: { hp: 100, maxHp: 100 },
        today: { overdueCount: 0 },
    };
    const agentRoute = routeMessage(message, defaultCtx);
    let workload = "general_chat";
    if (agentRoute.agent === "planner")
        workload = "planner";
    else if (agentRoute.agent === "calendar")
        workload = "calendar";
    else if (agentRoute.agent === "coach")
        workload = "coach";
    else if (agentRoute.agent === "analyst")
        workload = "analyst";
    return {
        workload,
        agent: agentRoute.agent,
        route: exports.WORKLOAD_ROUTING_TABLE[workload],
        reason: agentRoute.reason,
        hasMedia: false,
    };
}
/**
 * Executes an LLM generation with automated primary -> fallback -> secondaryFallback cascades.
 */
async function dispatchWithFallback(workload, messages, systemInstruction, tools = [], options) {
    const config = exports.WORKLOAD_ROUTING_TABLE[workload];
    const candidates = [
        config.primary,
        config.fallback,
        ...(config.secondaryFallback ? [config.secondaryFallback] : []),
    ];
    const attempts = [];
    for (let i = 0; i < candidates.length; i++) {
        const spec = candidates[i];
        options?.onAttempt?.({ provider: spec.provider, model: spec.model, attempt: i + 1 });
        try {
            const adapter = factory_1.LLMFactory.getAdapter(spec.provider, spec.model);
            const response = await adapter.generateResponse(messages, systemInstruction, tools, {
                responseFormat: options?.responseFormat,
                signal: options?.signal,
                maxTokens: config.outputTokenCap,
                thinking: config.thinking,
            });
            attempts.push({
                provider: spec.provider,
                model: spec.model,
                success: true,
            });
            return {
                response,
                providerUsed: spec.provider,
                modelUsed: spec.model,
                fallbackOccurred: i > 0,
                attempts,
            };
        }
        catch (err) {
            console.warn(`[MultiEngineRouter] Model ${spec.provider}/${spec.model} failed on workload '${workload}':`, err.message || err);
            attempts.push({
                provider: spec.provider,
                model: spec.model,
                error: err.message || String(err),
                success: false,
            });
            const nextSpec = candidates[i + 1];
            if (nextSpec) {
                options?.onFallback?.(spec, nextSpec, err);
            }
        }
    }
    // If all candidates in the routing table failed, throw structured error with complete audit trail
    throw new Error(`[MultiEngineRouter] All model candidates failed for workload '${workload}'. Audit: ${JSON.stringify(attempts)}`);
}
