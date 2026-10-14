"use client";

import { useState, useEffect } from "react";
import { useAuth } from "../../components/AuthProvider";
import { motion, AnimatePresence } from "framer-motion";
import { backdropVariants, bottomSheetVariants } from "@/lib/motion";
import { resolveGoalColor } from "@/lib/goal-theme";
import CustomDatePicker from "../../components/CustomDatePicker";
import { fetchCachedJSON } from "@/lib/client-data-cache";
import { QuestEmblemIcon, StreakFlameIcon, FocusClockIcon } from "@/app/components/icons";
import { Plus, X, Pencil, Trash2, Check } from "lucide-react";
import styles from "../Goals.module.css";

interface Quest {
  id: number;
  title: string;
  status: string;
  xpReward: number;
  sylphReward: number;
  requiredMinutes: number;
  scheduledFor: string;
  difficulty: string;
  goal: { id: number; title: string; color: string } | null;
}

interface GoalOption {
  id: number;
  title: string;
  status: string;
  color: string;
}

export function QuestsTab() {
  const { user } = useAuth();
  const [quests, setQuests] = useState<Quest[]>([]);
  const [weeklyQuest, setWeeklyQuest] = useState<any>(null);
  const [goals, setGoals] = useState<GoalOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedQuestIds, setSelectedQuestIds] = useState<number[]>([]);
  const [isSelectMode, setIsSelectMode] = useState(false);

  // New quest modal state
  const [isNewQuestPanelOpen, setIsNewQuestPanelOpen] = useState(false);
  const [newQuestTitle, setNewQuestTitle] = useState("");
  const [newQuestDescription, setNewQuestDescription] = useState("");
  const [newQuestMinutes, setNewQuestMinutes] = useState(45);
  const [newQuestDifficulty, setNewQuestDifficulty] = useState("NORMAL");
  const [newQuestDate, setNewQuestDate] = useState("");
  const [newQuestGoalId, setNewQuestGoalId] = useState("");
  const [isSubmittingQuest, setIsSubmittingQuest] = useState(false);
  const [questFormError, setQuestFormError] = useState<string | null>(null);

  const getTodayLocalDate = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Editing state for quests
  const [editingQuestId, setEditingQuestId] = useState<number | null>(null);
  const [editQuestTitle, setEditQuestTitle] = useState("");
  const [editQuestMinutes, setEditQuestMinutes] = useState(30);

  const fetchQuests = () => {
    if (!user) return;
    Promise.all([
      // Stale-while-revalidate: repeat visits to /goals paint instantly.
      fetchCachedJSON<any[]>("/api/quests?all=true", {}, { ttlMs: 15_000, staleMs: 120_000 })
        .catch(() => []),
      fetchCachedJSON<any>("/api/quests/weekly", {}, { ttlMs: 30_000, staleMs: 300_000 })
        .catch(() => null),
      fetchCachedJSON<any[]>("/api/goals", {}, { ttlMs: 15_000, staleMs: 120_000 })
        .catch(() => []),
    ])
      .then(([questsData, weeklyData, goalsData]) => {
        setQuests(Array.isArray(questsData) ? questsData : []);
        setWeeklyQuest(weeklyData && !weeklyData.error ? weeklyData : null);
        setGoals(Array.isArray(goalsData) ? goalsData : []);
        setIsLoading(false);
      })
      .catch(console.error);
  };

  useEffect(() => {
    fetchQuests();
    const d = new Date();
    setNewQuestDate(d.toISOString().split("T")[0]);
  }, [user?.id]);

  if (isLoading) {
    return (
      <div className="p-12 text-center text-muted">
        Loading Quests...
      </div>
    );
  }

  const handleDeleteQuest = async (id: number) => {
    if (!confirm("Are you sure you want to delete this quest?")) return;
    try {
      await fetch(`/api/quests/${id}`, { method: "DELETE" });
      setQuests(quests.filter(q => q.id !== id));
      setSelectedQuestIds(prev => prev.filter(selectedId => selectedId !== id));
    } catch (err) {
      console.error(err);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedQuestIds.length === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedQuestIds.length} quests?`)) return;
    try {
      await fetch(`/api/quests`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedQuestIds })
      });
      setQuests(quests.filter(q => !selectedQuestIds.includes(q.id)));
      setSelectedQuestIds([]);
      setIsSelectMode(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveQuest = async (id: number) => {
    try {
      await fetch(`/api/quests/${id}`, { 
        method: "PATCH", 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editQuestTitle, requiredMinutes: editQuestMinutes })
      });
      setEditingQuestId(null);
      fetchQuests();
    } catch (err) {
      console.error(err);
    }
  };

  /** Create a manually dispatched quest, optionally linked to an objective. */
  const handleCreateQuest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingQuest) return;

    const trimmedTitle = newQuestTitle.trim();
    if (!trimmedTitle) {
      setQuestFormError("Please enter a quest title before dispatching.");
      return;
    }

    setQuestFormError(null);
    setIsSubmittingQuest(true);

    // Duration clamp: 15 - 240 minutes
    const durationMinutes = Math.min(240, Math.max(15, Math.round(newQuestMinutes) || 45));
    const targetDate = newQuestDate || getTodayLocalDate();

    try {
      const res = await fetch("/api/quests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: trimmedTitle,
          description: newQuestDescription.trim() || undefined,
          targetMinutes: durationMinutes,
          difficulty: newQuestDifficulty,
          scheduledFor: targetDate,
          goalId: newQuestGoalId ? Number(newQuestGoalId) : undefined,
        }),
      });

      if (res.ok) {
        setNewQuestTitle("");
        setNewQuestDescription("");
        setNewQuestMinutes(45);
        setNewQuestDifficulty("NORMAL");
        setNewQuestGoalId("");
        setQuestFormError(null);
        setIsNewQuestPanelOpen(false);
        fetchQuests();
      } else {
        const errorData = await res.json().catch(() => null);
        setQuestFormError(
          errorData?.message || errorData?.error || `Failed to dispatch quest (HTTP ${res.status})`
        );
      }
    } catch (err: any) {
      console.error("Failed to create quest", err);
      setQuestFormError(err?.message || "A network error occurred. Please try again.");
    } finally {
      setIsSubmittingQuest(false);
    }
  };

  return (
    <div className="w-full">
      {/* Action Header */}
      <div className="mb-6 flex flex-wrap justify-between items-center gap-2">
        <div>
          <h1 className={styles.title}>
            <QuestEmblemIcon size={24} className="text-accent-primary shrink-0" />
            <span>Objectives</span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {isSelectMode ? (
            <>
              <button 
                onClick={() => { setIsSelectMode(false); setSelectedQuestIds([]); }}
                className={styles.ghostBtn}
              >
                Done
              </button>
              {selectedQuestIds.length > 0 && (
                <button 
                  onClick={handleBulkDelete}
                  className="py-2 px-4 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 hover:border-red-500/60 rounded-xl text-red-400 text-xs sm:text-sm font-bold font-['Rajdhani'] tracking-wide uppercase transition-all shadow-[0_0_12px_rgba(239,68,68,0.2)] cursor-pointer"
                >
                  DELETE SELECTED ({selectedQuestIds.length})
                </button>
              )}
            </>
          ) : (
            <div className="flex items-center gap-2.5">
              <button 
                onClick={() => {
                  setQuestFormError(null);
                  if (!newQuestDate) setNewQuestDate(getTodayLocalDate());
                  setIsNewQuestPanelOpen(true);
                }}
                className={styles.btnPrimaryAction}
              >
                <Plus size={15} strokeWidth={2.5} />
                <span>NEW QUEST</span>
              </button>
              {quests.length > 0 && (
                <button 
                  onClick={() => setIsSelectMode(true)}
                  className={styles.ghostBtn}
                >
                  Select
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ─── Streak Quest Card ───────────────────────── */}
      {weeklyQuest && (
        <div className={styles.streakCard}>
          <div
            className={styles.topHighlight}
            style={{ background: "linear-gradient(90deg, transparent, var(--accent-primary), transparent)" }}
          />
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-accent-primary-dim text-accent-text-light border border-accent-primary-mid tracking-wider uppercase font-['Rajdhani'] flex items-center gap-1.5 shadow-sm">
                  <StreakFlameIcon size={12} />
                  <span>Streak Quest</span>
                </span>
                <span className="text-xs font-['Rajdhani'] font-medium" style={{ color: "var(--muted)" }}>
                  Resets in {weeklyQuest.daysRemaining}d (Sunday 23:59)
                </span>
              </div>
              <h2 className="text-xl font-bold font-['Rajdhani'] tracking-wide" style={{ color: "var(--ink)" }}>
                Cumulative Focus
              </h2>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="text-right">
                <span className="text-[10px] font-['Rajdhani'] block uppercase tracking-wider font-bold" style={{ color: "var(--muted)" }}>Level-Scaled Payout</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-accent-text-light font-['Rajdhani']">+{weeklyQuest.xpReward} XP</span>
                  <span className="text-sm font-bold text-accent-text-light/80 font-['Rajdhani']">+{weeklyQuest.sylphReward} Sylph</span>
                </div>
              </div>
              <span className={`px-3 py-1 text-xs font-bold rounded-full font-['Rajdhani'] uppercase tracking-wider border shadow-sm ${
                weeklyQuest.isCompleted 
                  ? "bg-green-500/20 text-green-400 border-green-500/40" 
                  : "bg-accent-primary-dim text-accent-text-light border-accent-primary-mid"
              }`}>
                {weeklyQuest.isCompleted ? "Milestone Achieved" : "In Progress"}
              </span>
            </div>
          </div>

          {/* Progress Bar & Stats */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-['Rajdhani'] font-bold" style={{ color: "var(--muted)" }}>
              <span>{Math.floor(weeklyQuest.progressMinutes / 60)}h {weeklyQuest.progressMinutes % 60}m / 3h 00m</span>
              <span className="text-accent-text-light">{weeklyQuest.percentComplete}%</span>
            </div>
            <div className={styles.progressTrack}>
              <div
                className="h-full bg-gradient-to-r from-accent-primary to-accent-primary-light transition-all duration-1000 ease-out rounded-full shadow-[0_0_8px_var(--accent-dim)]"
                style={{ width: `${weeklyQuest.percentComplete}%` }}
              />
            </div>
          </div>
        </div>
      )}

      <div>
        {quests.length === 0 ? (
          <div className={styles.emptyStateCard}>
            <div className={styles.emptyIconBox}>
              <QuestEmblemIcon size={26} />
            </div>
            <h3 className={styles.emptyTitle}>No Active Quests</h3>
            <p className={styles.emptySubtitle}>
              Sylvie has not issued any quests yet. Establish an Objective to generate quests or dispatch a custom quest.
            </p>
            <button
              type="button"
              onClick={() => {
                setQuestFormError(null);
                if (!newQuestDate) setNewQuestDate(getTodayLocalDate());
                setIsNewQuestPanelOpen(true);
              }}
              className={styles.btnPrimaryAction}
            >
              <Plus size={15} strokeWidth={2.5} />
              <span>Dispatch First Quest</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <AnimatePresence mode="popLayout">
              {quests.map((quest) => {
                // Color inheritance: linked quests carry their parent objective's
                // accent (border, badge, XP chip). Unlinked quests fall back to
                // the default difficulty/system accent.
                const goalTheme = quest.goal ? resolveGoalColor(quest.goal.color) : null;
                const statusColor = quest.status === "COMPLETED"
                  ? "var(--accent-green)"
                  : quest.status === "FAILED"
                  ? "var(--accent-red)"
                  : goalTheme
                  ? goalTheme.base
                  : "var(--accent-primary)";

                return (
                <motion.div 
                  key={quest.id} 
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -10 }}
                  transition={{ type: "spring", damping: 25, stiffness: 350 }}
                  className={`${styles.card} flex flex-col md:flex-row md:items-center justify-between p-4 sm:p-5 rounded-xl w-full ${isSelectMode ? 'cursor-pointer' : ''} transition-all ${
                    isSelectMode && selectedQuestIds.includes(quest.id)
                      ? "!bg-red-900/20 !border-red-500/50"
                      : ""
                  }`}
                  style={{
                    borderLeft: `4px solid ${statusColor}`,
                    ...(goalTheme ? { boxShadow: `inset 0 0 0 1px ${goalTheme.dim}` } : {}),
                  }}
                  onClick={() => {
                    if (isSelectMode) {
                      setSelectedQuestIds(prev => 
                        prev.includes(quest.id) ? prev.filter(id => id !== quest.id) : [...prev, quest.id]
                      );
                    }
                  }}
                >
                  <div className="flex-1 min-w-0 mr-0 md:mr-4 flex items-start gap-3 md:gap-4">
                    {isSelectMode && (
                      <div className={`mt-1.5 shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${selectedQuestIds.includes(quest.id) ? 'bg-red-500 border-red-500' : 'border-border-subtle'}`}>
                        {selectedQuestIds.includes(quest.id) && (
                          <Check size={12} className="text-white" strokeWidth={3} />
                        )}
                      </div>
                    )}
                    <div className="flex-1">
                      {editingQuestId === quest.id ? (
                      <div className="flex flex-col gap-2 mb-2">
                        <input 
                          type="text" 
                          value={editQuestTitle} 
                          onChange={e => setEditQuestTitle(e.target.value)} 
                          className={styles.inputField}
                        />
                        <div className="flex gap-2 items-center">
                          <input 
                            type="number" 
                            value={editQuestMinutes} 
                            onChange={e => setEditQuestMinutes(Number(e.target.value))} 
                            className={`${styles.inputField} w-24`}
                          />
                          <span className="text-xs font-['Rajdhani']" style={{ color: "var(--muted)" }}>min</span>
                        </div>
                      </div>
                    ) : (
                      <>
                        <h3 className="font-bold mb-1 flex items-center gap-2 flex-wrap font-['Rajdhani'] text-base tracking-wide" style={{ color: "var(--ink)" }}>
                          {quest.title}
                          {goalTheme && (
                            <span
                              className="text-[0.65rem] font-['Rajdhani'] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border shadow-sm"
                              style={{
                                color: goalTheme.light,
                                background: goalTheme.dim,
                                borderColor: goalTheme.mid,
                              }}
                            >
                              {quest.goal!.title}
                            </span>
                          )}
                        </h3>
                        <p className="text-xs mb-2 font-mono" style={{ color: "var(--muted)" }}>
                          Part of: {quest.goal?.title || "Unknown Goal"} • {new Date(quest.scheduledFor).toLocaleDateString()}
                        </p>
                        <div className="flex gap-3 text-sm">
                          <span
                            className="font-bold font-['Rajdhani']"
                            style={{ color: goalTheme ? goalTheme.light : "var(--accent-text-light)" }}
                          >
                            +{quest.xpReward} XP
                          </span>
                          <span
                            className="flex items-center gap-1.5 font-bold font-['Rajdhani']"
                            style={{ color: goalTheme ? goalTheme.light : "var(--accent-text-light)" }}
                          >
                            <div className="w-5 h-5 rounded-full overflow-hidden flex items-center justify-center shrink-0">
                              <img src="/sylph-logo.jpg" alt="Sylph" className="w-full h-full object-cover scale-[1.35]" />
                            </div>
                            +{quest.sylphReward}
                          </span>
                          <span className="flex items-center gap-1 font-['Rajdhani'] font-medium" style={{ color: "var(--muted)" }}>
                            <FocusClockIcon size={13} className="text-accent-primary shrink-0" />
                            <span>{quest.requiredMinutes} min</span>
                          </span>
                        </div>
                      </>
                    )}
                    </div>
                  </div>
                  <div className="mt-4 md:mt-0 flex flex-col md:items-end gap-2">
                    {goalTheme ? (
                      <span
                        className="px-3 py-1 text-xs font-bold rounded-full font-['Rajdhani'] uppercase tracking-wider border shadow-sm"
                        style={{
                          color: quest.status === "COMPLETED" ? "var(--accent-green)" : goalTheme.light,
                          background: goalTheme.dim,
                          borderColor: goalTheme.mid,
                        }}
                      >
                        {quest.status}
                      </span>
                    ) : (
                      <span className={`quest-status quest-${
                        quest.status === "COMPLETED" ? "completed"
                        : quest.status === "FAILED" ? "failed"
                        : quest.status === "IN_PROGRESS" ? "progress"
                        : "pending"
                      }`}>
                        {quest.status}
                      </span>
                    )}
                    
                    <div className="flex items-center gap-1.5 mt-1">
                      {editingQuestId === quest.id ? (
                        <>
                          <button
                            onClick={() => handleSaveQuest(quest.id)}
                            className="px-2.5 py-1 rounded-lg text-xs font-bold text-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 transition-all flex items-center gap-1 cursor-pointer"
                          >
                            <Check size={12} />
                            Save
                          </button>
                          <button
                            onClick={() => setEditingQuestId(null)}
                            className={styles.ghostBtn}
                            style={{ padding: "4px 10px", fontSize: "11px" }}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button 
                            onClick={() => { setEditingQuestId(quest.id); setEditQuestTitle(quest.title); setEditQuestMinutes(quest.requiredMinutes); }}
                            className={styles.actionIconBtn}
                            title="Edit Quest"
                            aria-label="Edit Quest"
                          >
                            <Pencil size={13} />
                          </button>
                          <button 
                            onClick={() => handleDeleteQuest(quest.id)} 
                            className={`${styles.actionIconBtn} ${styles.actionIconBtnDelete}`}
                            title="Delete Quest"
                            aria-label="Delete Quest"
                          >
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Manual Quest Creation: mobile bottom sheet → centered modal on sm+ */}
      <AnimatePresence>
        {isNewQuestPanelOpen && (
          <motion.div
            key="new-quest-modal-backdrop"
            variants={backdropVariants}
            initial="closed"
            animate="open"
            exit="closed"
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          >
            <div
              className="absolute inset-0 bg-black/70 backdrop-blur-md"
              onClick={() => setIsNewQuestPanelOpen(false)}
            />

            <motion.div
              key="new-quest-modal-content"
              variants={bottomSheetVariants}
              initial="closed"
              animate="open"
              exit="closed"
              className={`relative z-10 w-full max-w-lg sm:max-w-2xl mx-auto sm:my-8 max-h-[90vh] sm:max-h-[85vh] overflow-y-auto rounded-2xl ${styles.modalContent} p-5 sm:p-7 flex flex-col gap-5`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className={styles.eyebrow}>
                    <span className={styles.eyebrowDot} />
                    Scholar Directive
                  </div>
                  <h2 className={styles.title} style={{ fontSize: "1.5rem" }}>
                    Dispatch New <em>Quest</em>
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setQuestFormError(null);
                    setIsNewQuestPanelOpen(false);
                  }}
                  className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center transition-colors cursor-pointer text-text-muted hover:text-text-primary"
                >
                  <X size={16} />
                </button>
              </div>

              {questFormError && (
                <div className="p-3 rounded-lg bg-rose-950/80 border border-rose-500/50 text-rose-200 text-xs font-['Rajdhani'] flex items-center justify-between gap-2 shadow-lg">
                  <div className="flex items-center gap-2">
                    <span className="text-rose-400 font-bold">⚠️</span>
                    <span>{questFormError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setQuestFormError(null)}
                    className="text-rose-400 hover:text-rose-200 p-1 text-xs"
                  >
                    ✕
                  </button>
                </div>
              )}

              <form onSubmit={handleCreateQuest} className="flex flex-col gap-4 flex-1 pb-6">
                <div>
                  <label className="block mb-1.5 text-xs font-bold uppercase tracking-wider font-['Rajdhani']" style={{ color: "var(--muted)" }}>
                    Title
                  </label>
                  <input
                    type="text"
                    required
                    className={styles.inputField}
                    value={newQuestTitle}
                    onChange={(e) => setNewQuestTitle(e.target.value)}
                    placeholder="e.g. Physics P1 Past Paper — 2025"
                  />
                </div>

                <div>
                  <label className="block mb-1.5 text-xs font-bold uppercase tracking-wider font-['Rajdhani']" style={{ color: "var(--muted)" }}>
                    Description (Optional)
                  </label>
                  <textarea
                    className={`${styles.inputField} min-h-24 resize-none`}
                    value={newQuestDescription}
                    onChange={(e) => setNewQuestDescription(e.target.value)}
                    placeholder="Details about what this quest involves..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block mb-1.5 text-xs font-bold uppercase tracking-wider font-['Rajdhani']" style={{ color: "var(--muted)" }}>
                      Study Duration
                    </label>
                    <input
                      type="number"
                      min={15}
                      max={240}
                      required
                      className={styles.inputField}
                      value={newQuestMinutes}
                      onChange={(e) => setNewQuestMinutes(Number(e.target.value))}
                    />
                    <p className="text-[0.65rem] text-text-muted mt-1 font-['Rajdhani']">Clamped 15–240 min</p>
                  </div>
                  <div>
                    <label className="block mb-1.5 text-xs font-bold uppercase tracking-wider font-['Rajdhani']" style={{ color: "var(--muted)" }}>
                      Scheduled For
                    </label>
                    <CustomDatePicker
                      value={newQuestDate}
                      onChange={setNewQuestDate}
                      minDate={getTodayLocalDate()}
                      placeholder="Select scheduled date..."
                      align="right"
                    />
                  </div>
                </div>

                <div>
                  <label className="block mb-1.5 text-xs font-bold uppercase tracking-wider font-['Rajdhani']" style={{ color: "var(--muted)" }}>
                    Difficulty
                  </label>
                  <select
                    className={styles.inputField}
                    value={newQuestDifficulty}
                    onChange={(e) => setNewQuestDifficulty(e.target.value)}
                  >
                    <option value="EASY">Easy</option>
                    <option value="NORMAL">Normal</option>
                    <option value="HARD">Hard</option>
                    <option value="EXPERT">Expert</option>
                  </select>
                </div>

                <div>
                  <label className="block mb-1.5 text-xs font-bold uppercase tracking-wider font-['Rajdhani']" style={{ color: "var(--muted)" }}>
                    Link to Objective (Optional)
                  </label>
                  <select
                    className={styles.inputField}
                    value={newQuestGoalId}
                    onChange={(e) => setNewQuestGoalId(e.target.value)}
                  >
                    <option value="">— Unlinked (Standalone Quest) —</option>
                    {goals
                      .filter((g) => g.status === "ACTIVE")
                      .map((g) => {
                        const theme = resolveGoalColor(g.color);
                        return (
                          <option key={g.id} value={g.id}>
                            {g.title} ({theme.name})
                          </option>
                        );
                      })}
                  </select>
                  {newQuestGoalId && (
                    <div
                      className="mt-2 flex items-center gap-2 text-xs px-3 py-1.5 rounded border"
                      style={{
                        color: resolveGoalColor(goals.find((g) => String(g.id) === newQuestGoalId)?.color).light,
                        background: resolveGoalColor(goals.find((g) => String(g.id) === newQuestGoalId)?.color).dim,
                        borderColor: resolveGoalColor(goals.find((g) => String(g.id) === newQuestGoalId)?.color).mid,
                      }}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ background: resolveGoalColor(goals.find((g) => String(g.id) === newQuestGoalId)?.color).base }}
                      />
                      Quest inherits this objective's accent color
                    </div>
                  )}
                </div>

                <div className="mt-auto pt-4">
                  <button
                    type="submit"
                    disabled={isSubmittingQuest}
                    className={`w-full py-3.5 ${styles.btnPrimaryAction}`}
                  >
                    {isSubmittingQuest ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>DISPATCHING...</span>
                      </>
                    ) : (
                      "DISPATCH QUEST"
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
