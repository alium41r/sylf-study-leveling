"use client";

import { useState, useEffect } from "react";
import { useAuth } from "../../components/AuthProvider";
import { motion, AnimatePresence } from "framer-motion";
import { resolveGoalColor } from "@/lib/goal-theme";

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
  const { token } = useAuth();
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

  // Editing state for quests
  const [editingQuestId, setEditingQuestId] = useState<number | null>(null);
  const [editQuestTitle, setEditQuestTitle] = useState("");
  const [editQuestMinutes, setEditQuestMinutes] = useState(30);

  const fetchQuests = () => {
    if (!token) return;
    Promise.all([
      fetch("/api/quests?all=true", { headers: { Authorization: `Bearer ${token}` } })
        .then(async (r) => (r.ok ? r.json().catch(() => []) : []))
        .catch(() => []),
      fetch("/api/quests/weekly", { headers: { Authorization: `Bearer ${token}` } })
        .then(async (r) => (r.ok ? r.json().catch(() => null) : null))
        .catch(() => null),
      fetch("/api/goals", { headers: { Authorization: `Bearer ${token}` } })
        .then(async (r) => (r.ok ? r.json().catch(() => []) : []))
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
  }, [token]);

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
      await fetch(`/api/quests/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
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
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
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
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
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
    if (!token) return;

    // Duration clamp: 15 - 240 minutes
    const durationMinutes = Math.min(240, Math.max(15, Math.round(newQuestMinutes) || 45));

    try {
      const res = await fetch("/api/quests", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: newQuestTitle,
          description: newQuestDescription || undefined,
          targetMinutes: durationMinutes,
          difficulty: newQuestDifficulty,
          scheduledFor: newQuestDate || undefined,
          goalId: newQuestGoalId ? Number(newQuestGoalId) : undefined,
        }),
      });
      if (res.ok) {
        setNewQuestTitle("");
        setNewQuestDescription("");
        setNewQuestMinutes(45);
        setNewQuestDifficulty("NORMAL");
        setNewQuestGoalId("");
        setIsNewQuestPanelOpen(false);
        fetchQuests();
      }
    } catch (err) {
      console.error("Failed to create quest", err);
    }
  };

  return (
    <div className="w-full">
      {/* Action Header */}
      <div className="mb-6 flex flex-wrap justify-between items-center gap-2">
        <div>
          <p className="text-xs tracking-widest mb-1 text-accent-text-light font-['Rajdhani'] font-bold">
            SCHOLAR TASKS
          </p>
          <h2 className="text-2xl font-bold" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
            Quest Log
          </h2>
        </div>
        <div className="flex gap-2">
          {isSelectMode ? (
            <>
              <button 
                onClick={() => { setIsSelectMode(false); setSelectedQuestIds([]); }}
                className="py-2 px-4 bg-bg-abyss hover:bg-bg-shadow border border-border-subtle hover:border-border-active rounded-lg text-text-secondary font-bold transition-all flex items-center justify-center shrink-0"
              >
                Done
              </button>
              {selectedQuestIds.length > 0 && (
                <button 
                  onClick={handleBulkDelete}
                  className="py-2 px-4 bg-red-900/40 hover:bg-red-800/60 border border-red-500/30 hover:border-red-400 rounded-lg text-red-400 text-sm font-bold tracking-wide transition-all"
                >
                  DELETE SELECTED ({selectedQuestIds.length})
                </button>
              )}
            </>
          ) : (
            <>
              <button 
                onClick={() => setIsNewQuestPanelOpen(true)}
                className="px-4 py-2 bg-accent-primary text-white font-bold rounded-lg hover:opacity-90 hover:scale-105 active:scale-95 transition-all text-sm shadow-md flex items-center gap-1.5"
                style={{ fontFamily: "'Rajdhani', sans-serif" }}
              >
                <span>+</span> NEW QUEST
              </button>
              {quests.length > 0 && (
                <button 
                  onClick={() => setIsSelectMode(true)}
                  className="py-2 px-4 bg-bg-abyss hover:bg-bg-shadow border border-border-subtle hover:border-border-active rounded-lg text-text-secondary font-bold transition-all"
                >
                  Select
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* ─── Streak Quest Card ───────────────────────── */}
      {weeklyQuest && (
        <div className="system-card p-6 mb-8 w-full border border-accent-primary/30 bg-bg-panel/70 relative overflow-hidden group">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-accent-primary-dim text-accent-text-light border border-accent-primary-mid tracking-wider uppercase font-['Rajdhani']">
                  Streak Quest
                </span>
                <span className="text-xs text-text-muted font-['Rajdhani'] font-medium">
                  Resets in {weeklyQuest.daysRemaining}d (Sunday 23:59)
                </span>
              </div>
              <h2 className="text-xl font-bold text-text-primary font-['Rajdhani']">
                Cumulative Focus
              </h2>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="text-right">
                <span className="text-xs text-text-muted font-['Rajdhani'] block uppercase tracking-wider">Level-Scaled Payout</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-accent-text-light font-['Rajdhani']">+{weeklyQuest.xpReward} XP</span>
                  <span className="text-sm font-bold text-accent-text-light/80 font-['Rajdhani']">+{weeklyQuest.sylphReward} Sylph</span>
                </div>
              </div>
              <span className={`px-3 py-1 text-xs font-bold rounded-full font-['Rajdhani'] uppercase tracking-wider ${
                weeklyQuest.isCompleted 
                  ? "bg-green-500/20 text-green-400 border border-green-500/40" 
                  : "bg-accent-primary-dim text-accent-text-light border border-accent-primary-mid"
              }`}>
                {weeklyQuest.isCompleted ? "Milestone Achieved" : "In Progress"}
              </span>
            </div>
          </div>

          {/* Progress Bar & Stats */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-['Rajdhani'] font-bold text-text-secondary">
              <span>{Math.floor(weeklyQuest.progressMinutes / 60)}h {weeklyQuest.progressMinutes % 60}m / 3h 00m</span>
              <span>{weeklyQuest.percentComplete}%</span>
            </div>
            <div className="h-2.5 bg-bg-void/80 rounded-full overflow-hidden border border-border-subtle relative">
              <div
                className="h-full bg-gradient-to-r from-accent-primary to-accent-primary-light transition-all duration-1000 ease-out rounded-full"
                style={{ width: `${weeklyQuest.percentComplete}%` }}
              />
            </div>
          </div>
        </div>
      )}

      <div className="system-card p-6 w-full">
        {quests.length === 0 ? (
          <p className="text-center text-text-secondary py-8">
            The System has not issued any quests yet. Create a Goal first.
          </p>
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
                  className={`flex flex-col md:flex-row md:items-center justify-between p-4 rounded w-full bg-bg-panel border border-border-subtle ${isSelectMode ? 'cursor-pointer' : ''} transition-colors ${
                    isSelectMode && selectedQuestIds.includes(quest.id)
                      ? "!bg-red-900/20 !border-red-500/50"
                      : "hover:border-border-active"
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
                          <svg className="w-3 h-3 text-text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
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
                          className="input-field py-1 px-2 text-sm"
                        />
                        <div className="flex gap-2 items-center">
                          <input 
                            type="number" 
                            value={editQuestMinutes} 
                            onChange={e => setEditQuestMinutes(Number(e.target.value))} 
                            className="input-field py-1 px-2 text-sm w-20"
                          />
                          <span className="text-xs text-text-muted">min</span>
                        </div>
                      </div>
                    ) : (
                      <>
                        <h3 className="font-bold mb-1 flex items-center gap-2 flex-wrap">
                          {quest.title}
                          {goalTheme && (
                            <span
                              className="text-[0.6rem] font-['Rajdhani'] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border"
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
                        <p className="text-xs text-text-muted mb-2">
                          Part of: {quest.goal?.title || "Unknown Goal"} • {new Date(quest.scheduledFor).toLocaleDateString()}
                        </p>
                        <div className="flex gap-3 text-sm">
                          <span
                            className="font-medium"
                            style={{ color: goalTheme ? goalTheme.light : "var(--accent-text-light)" }}
                          >
                            +{quest.xpReward} XP
                          </span>
                          <span
                            className="flex items-center gap-1.5 font-bold"
                            style={{ color: goalTheme ? goalTheme.light : "var(--accent-text-light)" }}
                          >
                            <div className="w-5 h-5 rounded-full overflow-hidden flex items-center justify-center shrink-0">
                              <img src="/sylph-logo.jpg" alt="Sylph" className="w-full h-full object-cover scale-[1.35]" />
                            </div>
                            +{quest.sylphReward}
                          </span>
                          <span className="text-text-secondary">⏱️ {quest.requiredMinutes} min</span>
                        </div>
                      </>
                    )}
                    </div>
                  </div>
                  <div className="mt-4 md:mt-0 flex flex-col md:items-end gap-2">
                    {goalTheme ? (
                      <span
                        className="px-3 py-1 text-xs font-bold rounded-full font-['Rajdhani'] uppercase tracking-wider border"
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
                    
                    <div className="flex gap-2 mt-1">
                      {editingQuestId === quest.id ? (
                        <>
                          <button onClick={() => handleSaveQuest(quest.id)} className="text-xs text-green-400 hover:text-green-300">Save</button>
                          <button onClick={() => setEditingQuestId(null)} className="text-xs text-text-muted hover:text-text-secondary">Cancel</button>
                        </>
                      ) : (
                        <>
                          <button 
                            onClick={() => { setEditingQuestId(quest.id); setEditQuestTitle(quest.title); setEditQuestMinutes(quest.requiredMinutes); }}
                            className="text-xs text-accent-primary hover:text-accent-primary-light"
                          >Edit</button>
                          <button onClick={() => handleDeleteQuest(quest.id)} className="text-xs text-red-400 hover:text-red-300">Delete</button>
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
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 bg-black/70 backdrop-blur-md"
              onClick={() => setIsNewQuestPanelOpen(false)}
            />

            <motion.div
              initial={{ y: "100%", opacity: 1 }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 350 }}
              className="relative z-10 w-full max-w-lg sm:max-w-2xl mx-auto sm:my-8 max-h-[90vh] sm:max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-bg-panel border border-border-subtle p-4 sm:p-6 shadow-2xl flex flex-col gap-5"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold tracking-wide" style={{ fontFamily: "'Rajdhani', sans-serif", color: "var(--accent-primary-light)" }}>
                  DISPATCH NEW QUEST
                </h2>
                <button
                  onClick={() => setIsNewQuestPanelOpen(false)}
                  className="text-text-muted hover:text-text-primary transition-colors p-2"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateQuest} className="flex flex-col gap-5 flex-1">
                <div>
                  <label className="stat-label block mb-2 text-sm">Title</label>
                  <input
                    type="text"
                    required
                    className="input-field bg-bg-abyss border-border-subtle focus:border-border-active py-3"
                    value={newQuestTitle}
                    onChange={(e) => setNewQuestTitle(e.target.value)}
                    placeholder="e.g. Physics P1 Past Paper — 2025"
                  />
                </div>

                <div>
                  <label className="stat-label block mb-2 text-sm">Description (Optional)</label>
                  <textarea
                    className="input-field min-h-24 bg-bg-abyss border-border-subtle focus:border-border-active py-3 resize-none"
                    value={newQuestDescription}
                    onChange={(e) => setNewQuestDescription(e.target.value)}
                    placeholder="Details about what this quest involves..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="stat-label block mb-2 text-sm">Study Duration</label>
                    <input
                      type="number"
                      min={15}
                      max={240}
                      required
                      className="input-field bg-bg-abyss border-border-subtle focus:border-border-active py-3"
                      value={newQuestMinutes}
                      onChange={(e) => setNewQuestMinutes(Number(e.target.value))}
                    />
                    <p className="text-[0.65rem] text-text-muted mt-1 font-['Rajdhani']">Clamped 15–240 min</p>
                  </div>
                  <div>
                    <label className="stat-label block mb-2 text-sm">Scheduled For</label>
                    <input
                      type="date"
                      className="input-field bg-bg-abyss border-border-subtle focus:border-border-active py-3"
                      style={{ colorScheme: "dark" }}
                      value={newQuestDate}
                      onChange={(e) => setNewQuestDate(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="stat-label block mb-2 text-sm">Difficulty</label>
                  <select
                    className="input-field bg-bg-abyss border-border-subtle focus:border-border-active py-3"
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
                  <label className="stat-label block mb-2 text-sm">
                    Link to Objective (Optional)
                  </label>
                  <select
                    className="input-field bg-bg-abyss border-border-subtle focus:border-border-active py-3"
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

                <div className="mt-auto pt-6">
                  <button
                    type="submit"
                    className="w-full py-4 bg-accent-primary hover:opacity-90 active:scale-[0.98] rounded-lg text-text-primary font-bold tracking-widest transition-all shadow-md hover:shadow-lg"
                    style={{ fontFamily: "'Rajdhani', sans-serif" }}
                  >
                    DISPATCH QUEST
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
