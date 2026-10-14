"use client";

import { useState, useEffect } from "react";
import { useAuth } from "../../components/AuthProvider";
import { motion, AnimatePresence } from "framer-motion";
import { backdropVariants, bottomSheetVariants } from "@/lib/motion";
import MarkdownRenderer from "../../components/MarkdownRenderer";
import CustomDatePicker from "../../components/CustomDatePicker";
import { fetchCachedJSON } from "@/lib/client-data-cache";
import {
  GOAL_COLOR_TOKENS,
  GOAL_COLOR_PALETTE,
  resolveGoalColor,
  formatGoalDeadline,
  formatTargetDateLabel,
  targetDateToWeeks,
  daysUntil,
  type GoalColorToken,
} from "@/lib/goal-theme";
import {
  Calendar,
  CalendarClock,
  Pencil,
  Trash2,
  Check,
  Plus,
  AlertCircle,
  X,
} from "lucide-react";
import {
  ObjectiveTargetIcon,
  QuestEmblemIcon,
  StreakFlameIcon,
} from "@/app/components/icons";
import styles from "../Goals.module.css";

interface Quest {
  id: number;
  title: string;
  status: string;
  xpReward: number;
  requiredMinutes: number;
}

interface Goal {
  id: number;
  title: string;
  description: string;
  targetWeeks: number;
  targetDate: string | null;
  effortLevel: string;
  status: string;
  color: string;
  quests: Quest[];
}

interface GoalsTabProps {
  onOpenNewGoalModal?: () => void;
}

export function GoalsTab() {
  const { user } = useAuth();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedGoalIds, setSelectedGoalIds] = useState<number[]>([]);
  const [isSelectMode, setIsSelectMode] = useState(false);

  // Editing state for goals
  const [editingGoalId, setEditingGoalId] = useState<number | null>(null);
  const [editGoalTitle, setEditGoalTitle] = useState("");
  const [editGoalDescription, setEditGoalDescription] = useState("");
  const [editGoalColor, setEditGoalColor] = useState<GoalColorToken>("EMERALD");

  // New goal form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetWeeks, setTargetWeeks] = useState(4);
  const [effortLevel, setEffortLevel] = useState("NORMAL");
  const [goalColor, setGoalColor] = useState<GoalColorToken>("EMERALD");
  
  // Edit deadline state
  const [editingDeadlineId, setEditingDeadlineId] = useState<number | null>(null);
  const [newDeadline, setNewDeadline] = useState("");

  const [isNewGoalPanelOpen, setIsNewGoalPanelOpen] = useState(false);

  // User-local "today" for date inputs
  const todayStr = (() => {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: user?.timezone || "UTC",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
    } catch {
      return new Date().toISOString().split("T")[0];
    }
  })();

  /** Target date derived from the timeline slider (today + N weeks). */
  const sliderTargetDate = (() => {
    const d = new Date(todayStr + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + targetWeeks * 7);
    return d.toISOString().split("T")[0];
  })();

  const fetchGoals = () => {
    if (!user) return;
    // Stale-while-revalidate: repeat visits to /goals paint instantly.
    fetchCachedJSON<Goal[]>("/api/goals", {}, { ttlMs: 15_000, staleMs: 120_000 })
      .then((data) => {
        setGoals(Array.isArray(data) ? data : []);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setIsLoading(false);
      });
  };

  useEffect(() => {
    fetchGoals();
  }, [user?.id]);

  if (isLoading) {
    return (
      <div className={`${styles.card} p-12 text-center flex flex-col items-center justify-center`}>
        <div className="w-8 h-8 border-2 border-accent-primary-light/30 border-t-accent-primary-light rounded-full animate-spin mb-3" />
        <span className="font-['Rajdhani'] text-sm tracking-widest uppercase font-semibold" style={{ color: "var(--muted)" }}>
          Loading Objectives...
        </span>
      </div>
    );
  }

  const handleDeleteGoal = async (id: number) => {
    if (!confirm("Are you sure you want to abandon this objective? All associated quests will be deleted.")) return;
    try {
      await fetch(`/api/goals/${id}`, { method: "DELETE" });
      setGoals(goals.filter(g => g.id !== id));
      setSelectedGoalIds(prev => prev.filter(selectedId => selectedId !== id));
    } catch (err) {
      console.error(err);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedGoalIds.length === 0) return;
    if (!confirm(`Are you sure you want to abandon ${selectedGoalIds.length} objectives? All associated quests will be deleted.`)) return;
    try {
      await fetch(`/api/goals`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedGoalIds })
      });
      setGoals(goals.filter(g => !selectedGoalIds.includes(g.id)));
      setSelectedGoalIds([]);
      setIsSelectMode(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveGoal = async (id: number) => {
    try {
      await fetch(`/api/goals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editGoalTitle,
          description: editGoalDescription,
          color: editGoalColor,
        })
      });
      setEditingGoalId(null);
      fetchGoals();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveDeadline = async (id: number) => {
    if (!newDeadline) return;
    try {
      const derivedWeeks = targetDateToWeeks(newDeadline);
      await fetch(`/api/goals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetDate: newDeadline, targetWeeks: derivedWeeks })
      });
      setEditingDeadlineId(null);
      setNewDeadline("");
      fetchGoals();
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          targetWeeks,
          targetDate: sliderTargetDate,
          effortLevel,
          color: goalColor,
        }),
      });
      if (res.ok) {
        setTitle("");
        setDescription("");
        setTargetWeeks(4);
        setEffortLevel("NORMAL");
        setGoalColor("EMERALD");
        setIsNewGoalPanelOpen(false);
        fetchGoals();
      }
    } catch (err) {
      console.error("Failed to create goal", err);
    }
  };

  return (
    <div className="w-full">
      {/* ─── Action Header ──────────────────────────── */}
      <div className="mb-6 flex flex-wrap justify-between items-center gap-3">
        <div>
          <h1 className={styles.title}>
            <ObjectiveTargetIcon size={24} className="text-accent-primary shrink-0" />
            <span>Objectives</span>
          </h1>
        </div>
        <div className="flex items-center gap-2.5">
          {isSelectMode ? (
            <>
              <button 
                onClick={() => { setIsSelectMode(false); setSelectedGoalIds([]); }}
                className={styles.ghostBtn}
              >
                Done
              </button>
              {selectedGoalIds.length > 0 && (
                <button 
                  onClick={handleBulkDelete}
                  className="py-2 px-4 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 hover:border-red-500/60 rounded-xl text-red-400 text-xs sm:text-sm font-bold font-['Rajdhani'] tracking-wide uppercase transition-all shadow-[0_0_12px_rgba(239,68,68,0.2)] cursor-pointer"
                >
                  DELETE SELECTED ({selectedGoalIds.length})
                </button>
              )}
            </>
          ) : (
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setIsNewGoalPanelOpen(true)}
                className={styles.btnPrimaryAction}
              >
                <Plus size={15} strokeWidth={2.5} />
                <span>NEW OBJECTIVE</span>
              </button>
              {goals.length > 0 && (
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

      {/* ─── Goals List ─────────────────────────────── */}
      <div className="flex flex-col gap-4">
        {goals.length === 0 ? (
          <div className={styles.emptyStateCard}>
            <div className={styles.emptyIconBox}>
              <ObjectiveTargetIcon size={26} />
            </div>
            <h3 className={styles.emptyTitle}>No Active Objectives</h3>
            <p className={styles.emptySubtitle}>
              Set one above to align your daily focus, generate quests, and level up your mastery.
            </p>
            <button
              type="button"
              onClick={() => setIsNewGoalPanelOpen(true)}
              className={styles.btnPrimaryAction}
            >
              <Plus size={15} strokeWidth={2.5} />
              <span>Create First Objective</span>
            </button>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {goals.map((goal) => {
              const goalTheme = resolveGoalColor(goal.color);
              const isOverdue = goal.targetDate ? daysUntil(goal.targetDate) < 0 : false;
              const completedQuests = goal.quests.filter(q => q.status === "COMPLETED").length;
              const totalQuests = goal.quests.length;

              return (
                <motion.div 
                  key={goal.id} 
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -10 }}
                  transition={{ type: "spring", damping: 25, stiffness: 350 }}
                  className={`${styles.card} p-5 sm:p-6 w-full group ${
                    isSelectMode ? 'cursor-pointer' : ''
                  } ${
                    isSelectMode && selectedGoalIds.includes(goal.id)
                      ? "!bg-red-950/20 !border-red-500/50"
                      : ""
                  }`}
                  style={{
                    overflow: editingDeadlineId === goal.id ? "visible" : "hidden",
                    zIndex: editingDeadlineId === goal.id ? 40 : 1,
                  }}
                  onClick={() => {
                    if (isSelectMode) {
                      setSelectedGoalIds(prev => 
                        prev.includes(goal.id) ? prev.filter(id => id !== goal.id) : [...prev, goal.id]
                      );
                    }
                  }}
                >
                  {/* Signature Specular Top Highlight Line */}
                  <div
                    className={styles.topHighlight}
                    style={{
                      background: `linear-gradient(90deg, transparent, ${goalTheme.base}, transparent)`,
                    }}
                  />

                  {/* Left Ambient Theme Indicator Strip */}
                  <div
                    className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full transition-all duration-300"
                    style={{
                      backgroundColor: goal.status === "ACTIVE" ? goalTheme.base : "var(--subtle-line)",
                      boxShadow: goal.status === "ACTIVE" ? `0 0 10px ${goalTheme.base}` : "none",
                    }}
                  />

                  {/* Header Row: Title & Actions */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4 w-full pl-2">
                    <div className="flex-1 min-w-0 flex gap-3">
                      {isSelectMode && (
                        <div className={`mt-1 shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${selectedGoalIds.includes(goal.id) ? 'bg-red-500 border-red-500' : 'border-border-subtle'}`}>
                          {selectedGoalIds.includes(goal.id) && (
                            <Check size={12} className="text-white" strokeWidth={3} />
                          )}
                        </div>
                      )}
                      <div className="flex-1">
                        {editingGoalId === goal.id ? (
                          <div className="flex flex-col gap-2.5 mb-2">
                            <input 
                              type="text" 
                              value={editGoalTitle} 
                              onChange={e => setEditGoalTitle(e.target.value)} 
                              className={styles.inputField}
                            />
                            <textarea 
                              value={editGoalDescription} 
                              onChange={e => setEditGoalDescription(e.target.value)} 
                              className={`${styles.inputField} min-h-16 resize-none`}
                            />
                            <GoalColorPicker value={editGoalColor} onChange={setEditGoalColor} />
                          </div>
                        ) : (
                          <>
                            <h3 className="text-lg sm:text-xl font-bold font-['Rajdhani'] tracking-wide leading-tight group-hover:text-accent-text-light transition-colors" style={{ color: "var(--ink)" }}>
                              {goal.title}
                            </h3>
                            {goal.description && (
                              <div className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
                                <MarkdownRenderer content={goal.description} compact />
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Status badge & Micro-actions */}
                    <div className="flex items-center gap-2.5 self-end sm:self-start shrink-0">
                      <span
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold font-mono tracking-wider uppercase border shadow-sm"
                        style={{
                          backgroundColor: goalTheme.dim,
                          borderColor: goalTheme.mid,
                          color: goal.status === "ACTIVE" ? goalTheme.base : "var(--muted)",
                        }}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${goal.status === "ACTIVE" ? "animate-pulse" : ""}`}
                          style={{ backgroundColor: goalTheme.base }}
                        />
                        {goal.status}
                      </span>

                      <div className="flex items-center gap-1">
                        {editingGoalId === goal.id ? (
                          <>
                            <button
                              onClick={() => handleSaveGoal(goal.id)}
                              className="px-2.5 py-1 rounded-lg text-xs font-bold text-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 transition-all flex items-center gap-1 cursor-pointer"
                            >
                              <Check size={12} />
                              Save
                            </button>
                            <button
                              onClick={() => setEditingGoalId(null)}
                              className={styles.ghostBtn}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => {
                                setEditingGoalId(goal.id);
                                setEditGoalTitle(goal.title);
                                setEditGoalDescription(goal.description || "");
                                setEditGoalColor((goal.color as GoalColorToken) || "EMERALD");
                              }}
                              className={styles.actionIconBtn}
                              title="Edit Objective"
                              aria-label="Edit Objective"
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              onClick={() => handleDeleteGoal(goal.id)}
                              className={`${styles.actionIconBtn} ${styles.actionIconBtnDelete}`}
                              title="Abandon Objective"
                              aria-label="Abandon Objective"
                            >
                              <Trash2 size={13} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Telemetry & Metrics Row */}
                  <div className="flex flex-wrap items-center gap-2 mb-4 pl-2">
                    {/* Timeline Badge */}
                    <div
                      className={`${styles.telemetryChip} ${
                        isOverdue
                          ? "!bg-rose-500/10 !border-rose-500/30 !text-rose-500"
                          : ""
                      }`}
                    >
                      <Calendar size={13} className={isOverdue ? "text-rose-500" : "opacity-60"} />
                      <span className="tracking-wider text-[11px] font-semibold uppercase font-['Rajdhani'] opacity-70">
                        Timeline:
                      </span>
                      {goal.targetDate ? (
                        <span className="flex flex-col leading-tight">
                          <strong
                            className={isOverdue ? "text-rose-500" : ""}
                            style={!isOverdue ? { color: goalTheme.base } : {}}
                          >
                            {formatGoalDeadline(goal.targetDate)}
                          </strong>
                          <span className="text-[10px] opacity-60 font-mono">
                            {formatTargetDateLabel(goal.targetDate)}
                          </span>
                        </span>
                      ) : (
                        <strong style={{ color: goalTheme.base }}>
                          {goal.targetWeeks} weeks
                        </strong>
                      )}
                    </div>

                    {/* Intensity Badge */}
                    <div className={styles.telemetryChip}>
                      <StreakFlameIcon size={13} className="text-amber-500" />
                      <span className="tracking-wider text-[11px] font-semibold uppercase font-['Rajdhani'] opacity-70">
                        Intensity:
                      </span>
                      <strong>
                        {goal.effortLevel === "RELAXED"
                          ? "Casual"
                          : goal.effortLevel === "NORMAL"
                          ? "Standard"
                          : goal.effortLevel === "INTENSE"
                          ? "Focused"
                          : "Hardcore"}
                      </strong>
                    </div>

                    {/* Quests Count Badge */}
                    <div className={styles.telemetryChip}>
                      <QuestEmblemIcon size={13} style={{ color: goalTheme.base }} />
                      <span className="tracking-wider text-[11px] font-semibold uppercase font-['Rajdhani'] opacity-70">
                        Quests:
                      </span>
                      <strong>{totalQuests}</strong>
                      {totalQuests > 0 && (
                        <span className="text-[11px] opacity-60 font-mono">
                          ({completedQuests} done)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Deadline Action Button Row */}
                  <div className="flex gap-2 pl-2">
                    {editingDeadlineId === goal.id ? (
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-2 rounded-xl border border-subtle bg-surface w-full sm:w-auto">
                        <div className="w-full sm:w-64">
                          <CustomDatePicker
                            value={newDeadline}
                            onChange={setNewDeadline}
                            minDate={todayStr}
                            placeholder="Pick deadline..."
                            compact
                          />
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => handleSaveDeadline(goal.id)}
                            disabled={!newDeadline}
                            className="px-3 py-1.5 bg-accent-primary text-white rounded-lg text-xs font-bold hover:brightness-110 disabled:opacity-50 transition-all font-['Rajdhani'] uppercase cursor-pointer"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => {
                              setEditingDeadlineId(null);
                              setNewDeadline("");
                            }}
                            className={styles.ghostBtn}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingDeadlineId(goal.id);
                          setNewDeadline(goal.targetDate || todayStr);
                        }}
                        className={styles.ghostBtn}
                      >
                        <CalendarClock size={13} />
                        <span>Edit deadline</span>
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      {/* ─── Manual Objective Modal ──────────────────────── */}
      <AnimatePresence>
        {isNewGoalPanelOpen && (
          <motion.div
            key="new-goal-modal-backdrop"
            variants={backdropVariants}
            initial="closed"
            animate="open"
            exit="closed"
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          >
            <div
              className={styles.modalOverlay}
              onClick={() => setIsNewGoalPanelOpen(false)}
            />

            <motion.div
              key="new-goal-modal-content"
              variants={bottomSheetVariants}
              initial="closed"
              animate="open"
              exit="closed"
              className={`${styles.modalContent} relative z-20 w-full max-w-lg sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-5 sm:p-7 flex flex-col gap-5`}
            >
              {/* Specular Top Highlight */}
              <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-transparent via-accent-primary to-transparent opacity-60 pointer-events-none" />

              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={styles.eyebrowDot} />
                    <span className={styles.eyebrow}>
                      Scholar Directive
                    </span>
                  </div>
                  <h2 className={styles.title}>
                    Establish <em>Objective</em>
                  </h2>
                </div>
                <button 
                  onClick={() => setIsNewGoalPanelOpen(false)}
                  className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center transition-colors cursor-pointer text-text-muted hover:text-text-primary"
                >
                  <X size={16} />
                </button>
              </div>
              
              <form onSubmit={handleCreateGoal} className="flex flex-col gap-4 flex-1 pb-6">
                <div>
                  <label className="block mb-1.5 text-xs font-bold uppercase tracking-wider font-['Rajdhani']" style={{ color: "var(--muted)" }}>
                    Objective Title
                  </label>
                  <input
                    type="text"
                    required
                    className={styles.inputField}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Master CAIE AS Pure Maths Chapter 1-3"
                  />
                </div>
                
                <div>
                  <label className="block mb-1.5 text-xs font-bold uppercase tracking-wider font-['Rajdhani']" style={{ color: "var(--muted)" }}>
                    Description & Milestones (Optional)
                  </label>
                  <textarea
                    className={`${styles.inputField} min-h-24 resize-none`}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Break down syllabus coverage, chapters, and topics..."
                  />
                </div>
                
                {/* Cyber Accent Color Selector */}
                <div>
                  <label className="block mb-2 text-xs font-bold uppercase tracking-wider font-['Rajdhani']" style={{ color: "var(--muted)" }}>
                    Accent Theme
                  </label>
                  <GoalColorPicker value={goalColor} onChange={setGoalColor} />
                </div>
                
                {/* Target Date Input (Synchronized with Timeline Slider) */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider font-['Rajdhani']" style={{ color: "var(--muted)" }}>
                      Target Date
                    </label>
                    <span className="text-[11px] font-mono text-accent-text-light font-bold">
                      {formatTargetDateLabel(sliderTargetDate)}
                    </span>
                  </div>
                  <CustomDatePicker
                    value={sliderTargetDate}
                    minDate={todayStr}
                    placeholder="Select target deadline date..."
                    onChange={(dateStr) => {
                      if (!dateStr) return;
                      const weeks = targetDateToWeeks(dateStr, todayStr);
                      if (weeks !== null) setTargetWeeks(weeks);
                    }}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider font-['Rajdhani']" style={{ color: "var(--muted)" }}>
                      Timeline: {targetWeeks} {targetWeeks === 1 ? "Week" : "Weeks"}
                    </label>
                    <span className="text-[11px] font-mono text-accent-text-light font-bold">
                      {targetWeeks * 7} Days
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="52"
                    value={targetWeeks}
                    onChange={(e) => setTargetWeeks(Number(e.target.value))}
                    className="w-full accent-accent-primary cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] font-mono mt-1" style={{ color: "var(--muted)" }}>
                    <span>1 Week</span>
                    <span>1 Month</span>
                    <span>6 Months</span>
                    <span>1 Year</span>
                  </div>
                </div>
                
                <div>
                  <label className="block mb-1.5 text-xs font-bold uppercase tracking-wider font-['Rajdhani']" style={{ color: "var(--muted)" }}>
                    Daily Effort Level
                  </label>
                  <select
                    className={styles.inputField}
                    value={effortLevel}
                    onChange={(e) => setEffortLevel(e.target.value)}
                  >
                    <option value="LIGHT">Casual (1 hour/day)</option>
                    <option value="NORMAL">Standard (2 hours/day)</option>
                    <option value="INTENSE">Focused (4 hours/day)</option>
                    <option value="EXTREME">Hardcore (6+ hours/day)</option>
                  </select>
                </div>
                
                <div className="mt-auto pt-4">
                  <button
                    type="submit"
                    className={`w-full py-3.5 ${styles.btnPrimaryAction}`}
                  >
                    COMMIT OBJECTIVE
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

/**
 * Curated 6-token cyber/neon swatch picker for objective accent theming.
 * Fully controlled via value/onChange.
 */
function GoalColorPicker({
  value,
  onChange,
}: {
  value: GoalColorToken;
  onChange: (token: GoalColorToken) => void;
}) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 items-center">
      {GOAL_COLOR_TOKENS.map((token) => {
        const theme = GOAL_COLOR_PALETTE[token];
        const isSelected = value === token;
        return (
          <button
            key={token}
            type="button"
            title={theme.name}
            aria-label={`Set ${theme.name} accent`}
            onClick={() => onChange(token)}
            className="relative w-9 h-9 rounded-full transition-all flex items-center justify-center cursor-pointer"
            style={{
              background: theme.swatch,
              boxShadow: isSelected
                ? `0 0 0 2px var(--surface), 0 0 0 4px ${theme.base}, 0 0 12px ${theme.mid}`
                : `0 0 0 1px ${theme.mid}`,
              transform: isSelected ? "scale(1.08)" : "scale(1)",
            }}
          >
            {isSelected && (
              <Check size={16} strokeWidth={3} className="text-white" />
            )}
          </button>
        );
      })}
    </div>
  );
}
