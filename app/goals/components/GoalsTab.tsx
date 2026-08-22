"use client";

import { useState, useEffect } from "react";
import { useAuth } from "../../components/AuthProvider";
import { motion, AnimatePresence } from "framer-motion";
import MarkdownRenderer from "../../components/MarkdownRenderer";
import {
  GOAL_COLOR_TOKENS,
  GOAL_COLOR_PALETTE,
  resolveGoalColor,
  formatGoalDeadline,
  formatTargetDateLabel,
  targetDateToWeeks,
  type GoalColorToken,
} from "@/lib/goal-theme";

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
  const { token, user } = useAuth();
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
    if (!token) return;
    fetch("/api/goals", { headers: { Authorization: `Bearer ${token}` } })
      .then(async (r) => (r.ok ? r.json().catch(() => []) : []))
      .then((data) => {
        setGoals(Array.isArray(data) ? data : []);
        setIsLoading(false);
      })
      .catch(console.error);
  };

  useEffect(() => {
    fetchGoals();
  }, [token]);

  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    
    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title,
          description,
          targetWeeks,
          effortLevel,
          color: goalColor,
          targetDate: sliderTargetDate,
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

  const handleAdjustEffort = async (goalId: number, newWeeks: number) => {
    if (!token) return;
    
    // First, ask for confirmation because this is a destructive action
    const proceed = confirm(
      `Warning: You are about to change the timeline to ${newWeeks} weeks. \n\nThe System will recalculate your quests and your daily effort requirement will change. Proceed?`
    );
    
    if (!proceed) return;

    try {
      const res = await fetch(`/api/goals/${goalId}/adjust`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ targetWeeks: newWeeks }),
      });
      if (res.ok) {
        const data = await res.json();
        alert(
          `TIMELINE COMPRESSED!\n\n` +
          `New Effort Level: ${data.newEffortLevel}\n` +
          `Estimated Daily Study: ${data.preview.newDailyMinutes} minutes\n\n` +
          `The System has regenerated your quests.`
        );
        fetchGoals(); // Refresh the list
      } else {
        alert("The System encountered an error. Adjustment failed.");
      }
    } catch (err) {
      console.error("Failed to adjust effort", err);
    }
  };

  const handleDeleteGoal = async (id: number) => {
    if (!confirm("Are you sure you want to abandon this goal and delete all its quests?")) return;
    try {
      await fetch(`/api/goals/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      setGoals(goals.filter(g => g.id !== id));
      setSelectedGoalIds(prev => prev.filter(selectedId => selectedId !== id));
    } catch (err) {
      console.error(err);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedGoalIds.length === 0) return;
    if (!confirm(`Are you sure you want to abandon ${selectedGoalIds.length} goals and delete all their quests?`)) return;
    try {
      await fetch(`/api/goals`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
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
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: editGoalTitle, description: editGoalDescription, color: editGoalColor })
      });
      setEditingGoalId(null);
      fetchGoals();
    } catch (err) {
      console.error(err);
    }
  };

  /**
   * Exact-deadline save: stores the UTC representational midnight of the
   * picked YYYY-MM-DD and keeps the legacy week count in sync.
   */
  const handleSaveDeadline = async (goal: Goal) => {
    if (!newDeadline) return;
    try {
      const parsed = new Date(`${newDeadline}T00:00:00Z`);
      const weeks = targetDateToWeeks(parsed);
      await fetch(`/api/goals/${goal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ targetDate: newDeadline, targetWeeks: weeks }),
      });
      setEditingDeadlineId(null);
      fetchGoals();
    } catch (err) {
      console.error(err);
    }
  };

  if (isLoading) {
    return (
      <div className="p-12 text-center text-muted">
        Loading Goals...
      </div>
    );
  }

  return (
    <div className="w-full">      {/* Action Header */}
      <div className="mb-6 flex flex-wrap justify-between items-center gap-2">
        <div>
          <p className="text-xs tracking-widest mb-1 text-accent-text-light font-['Rajdhani'] font-bold">
            SCHOLAR OBJECTIVES
          </p>
          <h2 className="text-2xl font-bold" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
            Active Goals
          </h2>
        </div>
        <div className="flex gap-2">
          {isSelectMode ? (
            <>
              <button 
                onClick={() => { setIsSelectMode(false); setSelectedGoalIds([]); }}
                className="py-2 px-4 bg-bg-abyss hover:bg-bg-shadow border border-border-subtle hover:border-border-active rounded-lg text-text-secondary font-bold transition-all flex items-center justify-center shrink-0"
              >
                Done
              </button>
              {selectedGoalIds.length > 0 && (
                <button 
                  onClick={handleBulkDelete}
                  className="py-2 px-4 bg-red-900/40 hover:bg-red-800/60 border border-red-500/30 hover:border-red-400 rounded-lg text-red-400 text-sm font-bold tracking-wide transition-all"
                >
                  DELETE SELECTED ({selectedGoalIds.length})
                </button>
              )}
            </>
          ) : (
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setIsNewGoalPanelOpen(true)}
                className="px-4 py-2 bg-accent-primary text-white font-bold rounded-lg hover:opacity-90 hover:scale-105 active:scale-95 transition-all text-sm shadow-md flex items-center gap-1.5"
                style={{ fontFamily: "'Rajdhani', sans-serif" }}
              >
                <span>+</span> NEW OBJECTIVE
              </button>
              {goals.length > 0 && (
                <button 
                  onClick={() => setIsSelectMode(true)}
                  className="py-2 px-4 bg-bg-abyss hover:bg-bg-shadow border border-border-subtle hover:border-border-active rounded-lg text-text-secondary font-bold transition-all"
                >
                  Select
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Goals List */}
      <div className="flex flex-col gap-4">
        {goals.length === 0 ? (
          <div className="system-card p-8 text-center text-text-secondary">
            You have no active objectives. Set one to begin.
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {goals.map((goal) => (
              <motion.div 
                key={goal.id} 
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -10 }}
                transition={{ type: "spring", damping: 25, stiffness: 350 }}
                className={`system-card p-6 w-full ${isSelectMode ? 'cursor-pointer' : ''} transition-colors ${
                  isSelectMode && selectedGoalIds.includes(goal.id)
                    ? "bg-red-900/20 border-red-500/50"
                    : ""
                }`}
                style={{
                  borderLeft: `4px solid ${
                    goal.status === "ACTIVE"
                      ? resolveGoalColor(goal.color).base
                      : "var(--border-subtle)"
                  }`,
                }}
                onClick={() => {
                  if (isSelectMode) {
                    setSelectedGoalIds(prev => 
                      prev.includes(goal.id) ? prev.filter(id => id !== goal.id) : [...prev, goal.id]
                    );
                  }
                }}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 w-full">
                  <div className="flex-1 min-w-0 mr-0 sm:mr-4 flex gap-3 sm:gap-4">
                    {isSelectMode && (
                      <div className={`mt-1.5 shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${selectedGoalIds.includes(goal.id) ? 'bg-red-500 border-red-500' : 'border-border-subtle'}`}>
                        {selectedGoalIds.includes(goal.id) && (
                          <svg className="w-3 h-3 text-text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    )}
                    <div className="flex-1">
                      {editingGoalId === goal.id ? (
                        <div className="flex flex-col gap-2 mb-2">
                          <input 
                            type="text" 
                            value={editGoalTitle} 
                            onChange={e => setEditGoalTitle(e.target.value)} 
                            className="input-field text-xl font-bold py-1 px-2"
                          />
                          <textarea 
                            value={editGoalDescription} 
                            onChange={e => setEditGoalDescription(e.target.value)} 
                            className="input-field text-sm py-1 px-2 min-h-16"
                          />
                          <GoalColorPicker value={editGoalColor} onChange={setEditGoalColor} />
                        </div>
                      ) : (
                        <>
                          <h3 className="text-xl font-bold" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
                            {goal.title}
                          </h3>
                          {goal.description && (
                            <div className="mt-1">
                              <MarkdownRenderer content={goal.description} compact />
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                    <span className={`quest-status ${goal.status === "ACTIVE" ? "quest-progress" : ""}`}>
                      {goal.status}
                    </span>
                    <div className="flex gap-2 mt-0">
                      {editingGoalId === goal.id ? (
                        <>
                          <button onClick={() => handleSaveGoal(goal.id)} className="text-xs text-green-400 hover:text-green-300">Save</button>
                          <button onClick={() => setEditingGoalId(null)} className="text-xs text-text-muted hover:text-text-secondary">Cancel</button>
                        </>
                      ) : (
                        <>
                          <button 
                            onClick={() => { setEditingGoalId(goal.id); setEditGoalTitle(goal.title); setEditGoalDescription(goal.description || ""); setEditGoalColor((goal.color as GoalColorToken) || "EMERALD"); }}
                            className="text-xs text-accent-primary hover:text-accent-primary-light"
                          >Edit</button>
                          <button onClick={() => handleDeleteGoal(goal.id)} className="text-xs text-red-400 hover:text-red-300">Abandon</button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="flex flex-wrap gap-2 text-xs mb-5">
                  <div className="px-3 py-1.5 rounded bg-white/5 border border-white/10 flex items-center gap-2">
                    <span className="text-muted tracking-wider">Timeline:</span> 
                    {goal.targetDate ? (
                      <span className="flex flex-col leading-tight">
                        <span
                          className="font-medium"
                          style={{ color: resolveGoalColor(goal.color).light }}
                        >
                          {formatGoalDeadline(goal.targetDate)}
                        </span>
                        <span className="text-[0.65rem] text-text-secondary font-['Rajdhani']">
                          {formatTargetDateLabel(goal.targetDate)}
                        </span>
                      </span>
                    ) : (
                      <span
                        className="font-medium"
                        style={{ color: resolveGoalColor(goal.color).light }}
                      >
                        {goal.targetWeeks} weeks
                      </span>
                    )}
                  </div>
                  <div className="px-3 py-1.5 rounded bg-white/5 border border-white/10 flex items-center gap-2">
                    <span className="text-muted tracking-wider">Intensity:</span> 
                    <span className="font-medium text-accent-light">
                      {goal.effortLevel === "RELAXED" ? "Casual" : 
                       goal.effortLevel === "NORMAL" ? "Standard" : 
                       goal.effortLevel === "INTENSE" ? "Focused" : "Hardcore"}
                    </span>
                  </div>
                  <div className="px-3 py-1.5 rounded bg-white/5 border border-white/10 flex items-center gap-2">
                    <span className="text-muted tracking-wider">Quests:</span> 
                    <span className="font-medium text-accent-light">{goal.quests.length}</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  {editingDeadlineId === goal.id ? (
                    <div className="flex items-center gap-2">
                      <input 
                        type="date"
                        min={todayStr}
                        className="input-field py-1 px-2 text-xs"
                        style={{ colorScheme: "dark" }}
                        value={newDeadline}
                        onChange={(e) => setNewDeadline(e.target.value)}
                      />
                      <button 
                        className="text-xs text-green-400 hover:text-green-300 font-bold"
                        onClick={() => handleSaveDeadline(goal)}
                      >
                        Save
                      </button>
                      <button 
                        className="text-xs text-text-muted hover:text-text-secondary font-bold"
                        onClick={() => setEditingDeadlineId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button 
                      className="btn-secondary text-xs py-1.5 px-3"
                      style={{ textTransform: 'none' }}
                      onClick={() => {
                        setEditingDeadlineId(goal.id);
                        // Prefill with the stored exact date (UTC representational day),
                        // falling back to targetWeeks * 7 from today for legacy goals.
                        if (goal.targetDate) {
                          setNewDeadline(goal.targetDate.slice(0, 10));
                        } else {
                          const d = new Date(todayStr + "T00:00:00Z");
                          d.setUTCDate(d.getUTCDate() + goal.targetWeeks * 7);
                          setNewDeadline(d.toISOString().split("T")[0]);
                        }
                      }}
                    >
                      Edit deadline
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* New Objective Modal: mobile bottom sheet → centered modal on sm+ */}
      <AnimatePresence>
        {isNewGoalPanelOpen && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 bg-black/70 backdrop-blur-md"
              onClick={() => setIsNewGoalPanelOpen(false)}
            />

            {/* Sheet / Dialog */}
            <motion.div 
              initial={{ y: "100%", opacity: 1 }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 350 }}
              className="relative z-10 w-full max-w-lg sm:max-w-2xl mx-auto sm:my-8 max-h-[90vh] sm:max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-bg-panel border border-border-subtle p-4 sm:p-6 shadow-2xl flex flex-col gap-5"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold tracking-wide" style={{ fontFamily: "'Rajdhani', sans-serif", color: "var(--accent-primary-light)" }}>
                  SET NEW OBJECTIVE
                </h2>
                <button 
                  onClick={() => setIsNewGoalPanelOpen(false)}
                  className="text-text-muted hover:text-text-primary transition-colors p-2"
                >
                  ✕
                </button>
              </div>
              
              <form onSubmit={handleCreateGoal} className="flex flex-col gap-5 flex-1">
                <div>
                  <label className="stat-label block mb-2 text-sm">Title</label>
                  <input
                    type="text"
                    required
                    className="input-field bg-bg-abyss border-border-subtle focus:border-border-active py-3"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Enter objective title..."
                  />
                </div>
                
                <div>
                  <label className="stat-label block mb-2 text-sm">Description (Optional)</label>
                  <textarea
                    className="input-field min-h-32 bg-bg-abyss border-border-subtle focus:border-border-active py-3 resize-none"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Details about what you want to achieve..."
                  />
                </div>
                
                <div className="bg-bg-abyss p-4 rounded-lg border border-border-subtle">
                  <div className="flex justify-between items-center mb-4">
                    <label className="stat-label text-sm m-0">Target Timeline</label>
                    <span className="text-[var(--accent-primary-light)] font-bold font-['Rajdhani'] text-lg">{targetWeeks} Weeks</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="52"
                    className="w-full accent-[var(--accent-primary)]"
                    value={targetWeeks}
                    onChange={(e) => setTargetWeeks(parseInt(e.target.value))}
                  />
                  <div className="flex justify-between text-xs text-text-secondary mt-2 font-['Rajdhani']">
                    <span>1 Week</span>
                    <span>1 Year</span>
                  </div>
                  <div className="mt-3 pt-2 border-t border-border-subtle/60 text-xs font-['Rajdhani'] text-text-secondary">
                    Target:{" "}
                    <span className="font-bold text-[var(--accent-text-light)]">
                      {formatTargetDateLabel(sliderTargetDate)}
                    </span>
                  </div>
                </div>
                
                <div>
                  <label className="stat-label block mb-2 text-sm">Objective Accent</label>
                  <GoalColorPicker value={goalColor} onChange={setGoalColor} />
                </div>
                
                <div>
                  <label className="stat-label block mb-2 text-sm">Base Effort Level</label>
                  <select
                    className="input-field bg-bg-abyss border-border-subtle focus:border-border-active py-3"
                    value={effortLevel}
                    onChange={(e) => setEffortLevel(e.target.value)}
                  >
                    <option value="RELAXED">Casual (1 hour/day)</option>
                    <option value="NORMAL">Standard (2 hours/day)</option>
                    <option value="INTENSE">Focused (4 hours/day)</option>
                    <option value="EXTREME">Hardcore (6+ hours/day)</option>
                  </select>
                </div>
                
                <div className="mt-auto pt-6">
                  <button type="submit" className="w-full py-4 bg-accent-primary hover:opacity-90 active:scale-[0.98] rounded-lg text-text-primary font-bold tracking-widest transition-all shadow-md hover:shadow-lg" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
                    COMMIT OBJECTIVE
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
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
            className="relative w-9 h-9 rounded-full transition-all flex items-center justify-center"
            style={{
              background: theme.swatch,
              boxShadow: isSelected
                ? `0 0 0 2px var(--bg-panel), 0 0 0 4px ${theme.base}, 0 0 12px ${theme.mid}`
                : `0 0 0 1px ${theme.mid}`,
              transform: isSelected ? "scale(1.08)" : "scale(1)",
            }}
          >
            {isSelected && (
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
        );
      })}
    </div>
  );
}
