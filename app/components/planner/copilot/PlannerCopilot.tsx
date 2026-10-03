"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { IntakeView } from "@/lib/planner/intake/actions";
import {
  applyCopilotProposal,
  sendCopilotMessage,
  type CopilotRecentTurn,
  type CopilotTurnPayload,
} from "@/lib/planner/copilot/client";
import {
  sendDesignerMessage,
  isDesignerLifecycle,
  DESIGNER_SUGGESTIONS,
  type DesignerTurnPayload,
} from "@/lib/planner/designer/client";
import type {
  CopilotPrerequisite,
  CopilotProposalView,
} from "@/lib/planner/copilot/contracts";
import type {
  DesignerProposal,
  DesignerQuestion,
  DesignerModeRecommendation,
  DesignerGuidance,
  DesignerSummary,
} from "@/lib/planner/designer/contracts";
import { acceptReoffer, declineReoffer, fetchReoffers } from "@/lib/planner/reoffer-client";
import { reofferDisclosure, type ReofferOffer } from "@/lib/planner/reoffer";
import { Sparkles, X, ArrowRight, CheckCircle2, AlertCircle } from "lucide-react";
import base from "../ExamPlanner.module.css";
import s from "./copilot.module.css";

/**
 * Sylf Unified Assistant
 *
 * ONE persistent assistant surface for the entire Planner lifecycle:
 * - Pre-generation: powered by the Plan Designer (lib/planner/designer/)
 * - Draft review & Confirmed: powered by the Planner Copilot (lib/planner/copilot/)
 * - Shared atomic proposal apply path via applyCopilotProposal
 * - Strict client-side bounds: tab-local transcript (max 8 turns), no secret mutations
 */

const COPILOT_SUGGESTIONS: Record<string, string[]> = {
  PRE_GENERATION: [
    "Change my weekly hours",
    "I never studied matrices",
    "Make weekends lighter",
    "Why is this topic included?",
  ],
  DRAFT_REVIEW: [
    "Make this plan lighter",
    "Remove the final mock exam",
    "Why is this scheduled here?",
  ],
  CONFIRMED: [
    "Rebalance the rest of my plan",
    "I have less time this week",
    "I'm behind",
  ],
};

const PREREQUISITE_ACTION: Record<CopilotPrerequisite, string> = {
  GOAL_REQUIRED: "Set the goal",
  BACKGROUND_CURRICULUM_REQUIRED: "Add my background curriculum",
  CONFIRMED_SCOPE_REQUIRED: "Review my scope",
  DRAFT_REQUIRED: "Generate a draft",
  CONFIRMED_PLAN_REQUIRED: "Confirm the plan",
};

const MODE_NAMES: Record<string, string> = {
  EXAM: "Exam Planner",
  ROADMAP: "Course Roadmap",
  MASTERY: "Unit Mastery",
};

interface ProposalState {
  token: string;
  summary: string;
  preview: Array<{ command: string; consequence: string }>;
  requiresAcknowledgement: string[];
  route?: string;
  request?: unknown;
}

export interface SylfAssistantProps {
  view: IntakeView;
  onView: (next: IntakeView) => void;
  onRoute: (
    route: "RESEARCH" | "COMPARISON" | "DRAFT_EDIT" | "REPLAN" | "RELEASE",
    request: unknown,
    summary: string
  ) => void;
  onPrerequisite?: (prerequisite: CopilotPrerequisite) => void;
  onViewRefresh?: () => void;
  onOpenChange?: (open: boolean) => void;
  lifecycle?: string;
  onSwitchMode?: (mode: "EXAM" | "ROADMAP" | "MASTERY") => void;
  isMobileSheet?: boolean;
  onCloseMobile?: () => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

export default function PlannerCopilot({
  view,
  onView,
  onRoute,
  onPrerequisite,
  onViewRefresh,
  lifecycle = "PRE_GENERATION",
  onSwitchMode,
  isMobileSheet = false,
  onCloseMobile,
  inputRef,
}: SylfAssistantProps) {
  const [message, setMessage] = useState("");
  const [turns, setTurns] = useState<CopilotRecentTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [proposal, setProposal] = useState<ProposalState | null>(null);
  const [unresolved, setUnresolved] = useState<string[]>([]);
  const [designerQuestion, setDesignerQuestion] = useState<DesignerQuestion | null>(null);
  const [modeRecommendation, setModeRecommendation] = useState<DesignerModeRecommendation | null>(null);
  const [guidanceList, setGuidanceList] = useState<DesignerGuidance[]>([]);
  const [researchRoute, setResearchRoute] = useState<{
    route: "RESEARCH" | "COMPARISON";
    request: unknown;
    summary: string;
  } | null>(null);
  const [importRefusal, setImportRefusal] = useState(false);
  const [copilotReply, setCopilotReply] = useState<CopilotTurnPayload | null>(null);
  const [reoffers, setReoffers] = useState<ReofferOffer[]>([]);
  const [designerSummary, setDesignerSummary] = useState<DesignerSummary | null>(null);

  const proposalRef = useRef<HTMLDivElement | null>(null);
  const localInputRef = useRef<HTMLInputElement | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  const effectiveInputRef = inputRef ?? localInputRef;

  const preGen = isDesignerLifecycle(view) && lifecycle === "PRE_GENERATION";

  // Auto-scroll transcript on new turns
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [turns, busy, proposal, designerQuestion, researchRoute]);

  // Focus proposal when one arrives
  useEffect(() => {
    if (proposal) proposalRef.current?.focus();
  }, [proposal]);

  // Fetch re-offers on confirmed plan
  useEffect(() => {
    const planId = view.planId;
    if (!planId || lifecycle !== "CONFIRMED") {
      setReoffers([]);
      return;
    }
    let cancelled = false;
    void fetchReoffers(planId)
      .then((offers) => {
        if (!cancelled) setReoffers(offers);
      })
      .catch(() => {
        if (!cancelled) setReoffers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [view.planId, lifecycle, view.version]);

  const answerReoffer = useCallback(
    async (offer: ReofferOffer, answer: "accept" | "decline") => {
      if (!view.planId) return;
      setBusy(true);
      try {
        if (answer === "accept") {
          const accepted = await acceptReoffer(view.planId, {
            expectedVersion: view.version,
            releasedItemKey: offer.releasedItemKey,
          });
          setNotice(
            accepted.created
              ? `Added “${offer.replacement.title}” — ${offer.replacement.minutes} minutes. It is ordinary work in your plan now.`
              : `“${offer.replacement.title}” is already in your plan.`
          );
        } else {
          await declineReoffer(view.planId, {
            expectedVersion: view.version,
            releasedItemKey: offer.releasedItemKey,
          });
          setNotice(`Left out. Sylf will not suggest it again.`);
        }
        setReoffers((prev) => prev.filter((entry) => entry.releasedItemKey !== offer.releasedItemKey));
        onViewRefresh?.();
      } catch {
        setNotice("That did not go through. Nothing was changed.");
      } finally {
        setBusy(false);
      }
    },
    [onViewRefresh, view.planId, view.version]
  );

  const send = useCallback(
    async (text: string, clarificationAnswer?: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setBusy(true);
      setNotice("");
      setProposal(null);
      setUnresolved([]);
      setDesignerQuestion(null);
      setResearchRoute(null);
      setImportRefusal(false);
      setModeRecommendation(null);

      try {
        if (preGen) {
          // Pre-generation -> Plan Designer turn
          const payload: DesignerTurnPayload = await sendDesignerMessage(view.id, {
            expectedVersion: view.version,
            message: trimmed,
            recent: turns,
          });

          setDesignerSummary(payload.designer.summary);
          setModeRecommendation(payload.designer.mode);
          setGuidanceList(payload.designer.guidance);
          setUnresolved(payload.designer.unresolved);

          const result = payload;
          let sylfResponseText = result.outcome === "DESIGNER_REFUSED" ? result.message : result.summary;

          if (result.outcome === "DESIGNER_APPLIED") {
            sylfResponseText = result.summary;
            onView(payload.view);
            setNotice(result.summary);
          } else if (result.outcome === "DESIGNER_PROPOSED") {
            sylfResponseText = result.summary;
            setProposal({
              token: result.proposal.token,
              summary: result.proposal.summary,
              preview: result.proposal.changes.map((c) => ({
                command: c.command,
                consequence: c.consequence,
              })),
              requiresAcknowledgement: result.proposal.requiresAcknowledgement,
            });
          } else if (result.outcome === "DESIGNER_QUESTION") {
            sylfResponseText = result.summary;
            setDesignerQuestion(result.question);
          } else if (result.outcome === "DESIGNER_RECOMMENDATION") {
            sylfResponseText = result.summary;
          } else if (result.outcome === "DESIGNER_ROUTED") {
            sylfResponseText = result.summary;
            setResearchRoute({
              route: result.route,
              request: result.request,
              summary: result.summary,
            });
            setProposal({
              token: result.proposal.token,
              summary: result.proposal.summary,
              preview: result.proposal.changes.map((c) => ({
                command: c.command,
                consequence: c.consequence,
              })),
              requiresAcknowledgement: result.proposal.requiresAcknowledgement,
              route: result.route,
              request: result.request,
            });
          } else if (result.outcome === "DESIGNER_ANSWERED") {
            sylfResponseText = result.phrasing ?? result.summary;
          } else if (result.outcome === "DESIGNER_REFUSED") {
            sylfResponseText = result.message;
            setNotice(result.message);
            if (result.code === "IMPORT_IN_SCOPE_STEP" || result.routeTo === "SCOPE") {
              setImportRefusal(true);
            }
            if (result.prerequisite && onPrerequisite) {
              onPrerequisite(result.prerequisite);
            }
          }

          // If turn carries question alongside proposal
          if (payload.designer.question && result.outcome !== "DESIGNER_QUESTION") {
            setDesignerQuestion(payload.designer.question);
          }

          setTurns((prev) =>
            [
              ...prev,
              { role: "STUDENT" as const, text: trimmed },
              { role: "SYLF" as const, text: sylfResponseText },
            ].slice(-8)
          );
        } else {
          // Post-generation -> Existing Copilot turn
          const payload = await sendCopilotMessage(view.id, {
            expectedVersion: view.version,
            message: trimmed,
            recent: turns,
            clarificationAnswer: clarificationAnswer ?? null,
          });

          const said =
            payload.outcome === "REFUSED"
              ? payload.message
              : payload.outcome === "ANSWERED"
                ? payload.phrasing ?? payload.summary
                : payload.summary;

          setTurns((prev) =>
            [
              ...prev,
              { role: "STUDENT" as const, text: trimmed },
              { role: "SYLF" as const, text: said },
            ].slice(-8)
          );
          setCopilotReply(payload);
          onView(payload.view);

          if (payload.outcome === "PROPOSED") {
            setProposal({
              token: payload.proposal.token,
              summary: payload.proposal.summary,
              preview: payload.proposal.preview,
              requiresAcknowledgement: payload.proposal.requiresAcknowledgement,
              route: payload.proposal.route ?? undefined,
            });
          }
          if (payload.outcome === "ROUTED" && payload.route) {
            onRoute(payload.route, payload.request, payload.summary);
          }
          if (payload.outcome === "REFUSED") {
            setNotice(payload.message);
          }
        }
      } catch (error) {
        const code = (error as { code?: string }).code ?? "";
        setNotice(
          code === "COPILOT_PROPOSAL_STALE" || code === "INTAKE_STALE"
            ? "The plan changed while I was reading that. Ask me again against the current plan."
            : "Sylf could not reach the planner assistant just now. The structured controls still work."
        );
      } finally {
        setBusy(false);
        setMessage("");
      }
    },
    [onPrerequisite, onRoute, onView, preGen, turns, view.id, view.version]
  );

  const confirmProposal = useCallback(async () => {
    if (!proposal) return;
    setBusy(true);
    setNotice("");
    try {
      const applied = await applyCopilotProposal(view.id, {
        expectedVersion: view.version,
        token: proposal.token,
      });
      onView(applied.view);
      setProposal(null);
      setUnresolved([]);
      setResearchRoute(null);
      setNotice(applied.summary);
      if (applied.route) {
        onRoute(applied.route, applied.request, applied.summary);
      }
    } catch (error) {
      const code = (error as { code?: string }).code ?? "";
      setNotice(
        code === "COPILOT_PROPOSAL_STALE" || code === "COPILOT_PROPOSAL_EXPIRED"
          ? "That proposal no longer matches your plan, so I did not apply it. Ask me again."
          : code === "RELEASE_NOT_ALLOWED"
            ? "That work has already started or finished, so it stays in your plan."
            : "I could not apply that change. Nothing was written; your plan is unchanged."
      );
      setProposal(null);
      setUnresolved([]);
    } finally {
      setBusy(false);
    }
  }, [onRoute, onView, proposal, view.id, view.version]);

  const cancelProposal = useCallback(() => {
    setProposal(null);
    setUnresolved([]);
    setResearchRoute(null);
    setNotice("Nothing was changed.");
  }, []);

  const suggestions = preGen
    ? DESIGNER_SUGGESTIONS
    : COPILOT_SUGGESTIONS[lifecycle] ?? COPILOT_SUGGESTIONS.PRE_GENERATION;

  const isReady = designerSummary?.readyToGenerate ?? view.readiness.canGenerate;
  const missingList = designerSummary?.missing ?? view.readiness.missing;

  return (
    <div className={s.sylfPanel} role="region" aria-label="Sylf assistant">
      {/* Panel Header */}
      <div className={s.sylfHeader}>
        <div className={s.sylfHeaderLeft}>
          <div className={s.sylfIconBadge}>
            <Sparkles className="w-4 h-4 text-violet-400" />
          </div>
          <div>
            <h3 className={s.sylfTitle}>
              Sylf
              {isReady ? (
                <span className={s.statusReady}>
                  <CheckCircle2 className="w-3 h-3" /> Ready
                </span>
              ) : missingList && missingList.length > 0 ? (
                <span className={s.statusMissing}>
                  <AlertCircle className="w-3 h-3" /> Needs setup
                </span>
              ) : null}
            </h3>
            <p className={s.sylfSubtitle}>
              {preGen ? "Setup designer · Speaks your intent" : "Study copilot · Plan changes & questions"}
            </p>
          </div>
        </div>

        {isMobileSheet && onCloseMobile && (
          <button
            type="button"
            className={s.closeBtn}
            onClick={onCloseMobile}
            aria-label="Close Sylf"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Main Body */}
      <div className={s.sylfBody}>
        <div
          ref={transcriptRef}
          role="log"
          aria-label="Conversation with Sylf"
          aria-live="polite"
          className={s.transcriptContainer}
        >
          {turns.length === 0 && (
            <div className={s.bubbleSylf}>
              <strong>Sylf:</strong>{" "}
              {preGen
                ? "Tell me what exam, course, or topic you're preparing for, how much time you have, and when you need it done. I'll shape the plan with you."
                : "Ask me to change something, or ask why the plan looks the way it does."}
            </div>
          )}

          {turns.map((turn, index) => (
            <div
              key={`${turn.role}-${index}`}
              className={turn.role === "STUDENT" ? s.bubbleStudent : s.bubbleSylf}
            >
              <strong>{turn.role === "STUDENT" ? "You" : "Sylf"}:</strong> {turn.text}
            </div>
          ))}

          {busy && (
            <div className={s.bubbleSylf} role="status">
              <span className="animate-pulse">Sylf is thinking…</span>
            </div>
          )}

          {/* Mode Recommendation */}
          {modeRecommendation && (
            <div className={s.modeCard} role="status">
              <div className={s.modeCardHeader}>
                <span>Planner Mode Suggestion</span>
                {modeRecommendation.switchable && (
                  <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300">
                    Switchable
                  </span>
                )}
              </div>
              <p className="text-text-secondary text-xs mb-2">{modeRecommendation.text}</p>
              {modeRecommendation.switchable && onSwitchMode ? (
                <button
                  type="button"
                  className={`${base.primary} text-xs py-1 px-3`}
                  onClick={() => onSwitchMode(modeRecommendation.mode)}
                >
                  Use {MODE_NAMES[modeRecommendation.mode] || modeRecommendation.mode}
                </button>
              ) : (
                <p className="text-[11px] text-text-muted italic">
                  Your current brief has already started, so mode cannot be reset here.
                </p>
              )}
            </div>
          )}

          {/* Explicit Research Route */}
          {researchRoute && (
            <div className={s.actionCard}>
              <h4 className="text-xs font-bold font-['Rajdhani'] uppercase tracking-wider text-sky-400 mb-1">
                Official Syllabus Search
              </h4>
              <p className="text-xs text-text-secondary mb-2">{researchRoute.summary}</p>
              <button
                type="button"
                className={`${base.primary} text-xs py-1.5 px-3 flex items-center gap-1.5`}
                disabled={busy}
                onClick={() => {
                  onRoute(researchRoute.route, researchRoute.request, researchRoute.summary);
                  setResearchRoute(null);
                }}
              >
                <span>Find syllabus</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Import Limitation */}
          {importRefusal && (
            <div className={s.actionCard}>
              <h4 className="text-xs font-bold font-['Rajdhani'] uppercase tracking-wider text-amber-400 mb-1">
                Syllabus Upload & Paste
              </h4>
              <p className="text-xs text-text-secondary mb-2">
                I can't switch the syllabus from this chat. Uploading and pasting happen in the scope section.
              </p>
              <button
                type="button"
                className="text-xs py-1.5 px-3 rounded-lg border border-white/20 bg-white/5 hover:bg-white/10 text-white"
                onClick={() => {
                  const scopeEl = document.getElementById("quick-plan-scope-step");
                  scopeEl?.scrollIntoView({ block: "center" });
                  if (onCloseMobile) onCloseMobile();
                }}
              >
                Go to scope
              </button>
            </div>
          )}

          {/* Material Essential Question */}
          {designerQuestion && (
            <div className={s.actionCard} aria-labelledby="designer-question-title">
              <h4 id="designer-question-title" className="text-xs font-bold font-['Rajdhani'] uppercase tracking-wider text-violet-400 mb-1">
                {designerQuestion.question}
              </h4>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {designerQuestion.options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    className="text-xs px-2.5 py-1 rounded-lg border border-violet-500/30 bg-violet-500/10 hover:bg-violet-500/20 text-violet-200"
                    disabled={busy}
                    onClick={() => void send(opt)}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Advisory Guidance */}
          {guidanceList.length > 0 && (
            <div className="flex flex-col gap-1 my-1">
              {guidanceList.map((g, idx) => (
                <div key={idx} className="text-[11px] text-text-muted px-2 py-1 rounded bg-white/[0.02] border border-white/5">
                  💡 {g.text}
                </div>
              ))}
            </div>
          )}

          {/* Proposal Card */}
          {proposal && (
            <div
              className={s.proposal}
              tabIndex={-1}
              ref={proposalRef}
              role="region"
              aria-labelledby="sylf-proposal-title"
            >
              <h4 id="sylf-proposal-title" className="text-sm font-bold font-['Rajdhani'] uppercase tracking-wider text-text-primary mb-1">
                {proposal.summary || "What I understood"}
              </h4>
              <ul className="text-xs space-y-1 mb-2">
                {proposal.preview.map((entry, index) => (
                  <li key={`${entry.command}-${index}`} className="text-text-secondary">
                    • {entry.consequence}
                  </li>
                ))}
              </ul>

              {/* Unresolved items */}
              {unresolved.length > 0 && (
                <div className={s.unresolvedBox}>
                  <p className={s.unresolvedTitle}>I couldn't place yet:</p>
                  <ul className={s.unresolvedList}>
                    {unresolved.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                  <p className="text-[11px] text-amber-300/80 mt-1">
                    These were not found in your confirmed scope, so they were left out of this setup.
                  </p>
                </div>
              )}

              {proposal.requiresAcknowledgement.length > 0 && (
                <p className={s.hint}>
                  {proposal.requiresAcknowledgement.includes("RELEASE")
                    ? "This removes work from your plan. It is recorded as your decision, so Sylf will not put it back."
                    : proposal.requiresAcknowledgement.includes("REPLAN")
                      ? "Nothing changes until you approve the proposal that comes next."
                      : "Confirm to apply these changes. Nothing has been saved yet."}
                </p>
              )}

              <div className={`${base.actions} mt-3 flex items-center gap-2`}>
                <button
                  type="button"
                  className={base.primary}
                  disabled={busy}
                  onClick={() => void confirmProposal()}
                >
                  {proposal.route ? "Go ahead" : "Apply setup"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={cancelProposal}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Reoffers for confirmed plan */}
          <ReofferOffers
            offers={reoffers}
            busy={busy}
            onAccept={(offer) => void answerReoffer(offer, "accept")}
            onDecline={(offer) => void answerReoffer(offer, "decline")}
          />

          {/* Status Notice */}
          {notice && !proposal && (
            <p className={s.notice} role="status" aria-live="polite">
              {notice}
            </p>
          )}
        </div>

        {/* Panel Footer: Chips & Pinned Composer */}
        <div className={s.sylfFooter}>
          <div className={s.suggestionsBar} aria-label="Quick suggestions">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className={s.chipBtn}
                disabled={busy}
                onClick={() => void send(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>

          <form
            className={s.pinnedComposer}
            onSubmit={(event) => {
              event.preventDefault();
              void send(message);
            }}
          >
            <label htmlFor="sylf-message-input" className="sr-only">
              Ask Sylf about this plan
            </label>
            <input
              id="sylf-message-input"
              ref={effectiveInputRef}
              className={s.composerInput}
              type="text"
              value={message}
              maxLength={600}
              disabled={busy}
              placeholder={preGen ? "Describe your goal, deadline or hours…" : "Ask Sylf to adjust your plan…"}
              onChange={(event) => setMessage(event.target.value)}
            />
            <button
              type="submit"
              className={s.composerSendBtn}
              disabled={busy || !message.trim()}
              aria-label="Send message to Sylf"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function ReofferOffers({
  offers,
  busy,
  onAccept,
  onDecline,
}: {
  offers: ReofferOffer[];
  busy: boolean;
  onAccept: (offer: ReofferOffer) => void;
  onDecline: (offer: ReofferOffer) => void;
}) {
  if (!offers.length) return null;
  return (
    <div className={s.reoffer} role="status" aria-live="polite" aria-labelledby="copilot-reoffer">
      <h4 id="copilot-reoffer">
        {offers.length === 1 ? "Something you removed" : "Things you removed"}
      </h4>
      <ul className={s.reofferList}>
        {offers.map((offer) => (
          <li key={offer.releasedItemKey}>
            <p>{reofferDisclosure(offer)}</p>
            <div className={base.actions}>
              <button type="button" disabled={busy} onClick={() => onAccept(offer)}>
                Add replacement
              </button>
              <button type="button" disabled={busy} onClick={() => onDecline(offer)}>
                Leave it out
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export { PlannerCopilot as SylfAssistant };
