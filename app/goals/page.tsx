"use client";

import { useState, useEffect } from "react";
import { useAuth } from "../components/AuthProvider";

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
  effortLevel: string;
  status: string;
  quests: Quest[];
}

export default function GoalsPage() {
  const { token } = useAuth();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedGoalIds, setSelectedGoalIds] = useState<number[]>([]);
  const [isSelectMode, setIsSelectMode] = useState(false);

  // Editing state for goals
  const [editingGoalId, setEditingGoalId] = useState<number | null>(null);
  const [editGoalTitle, setEditGoalTitle] = useState("");
  const [editGoalDescription, setEditGoalDescription] = useState("");

  // New goal form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetWeeks, setTargetWeeks] = useState(4);
  const [effortLevel, setEffortLevel] = useState("NORMAL");

  const fetchGoals = () => {
    if (!token) return;
    fetch("/api/goals", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
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
        body: JSON.stringify({ title, description, targetWeeks, effortLevel }),
      });
      if (res.ok) {
        setTitle("");
        setDescription("");
        setTargetWeeks(4);
        setEffortLevel("NORMAL");
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
        body: JSON.stringify({ title: editGoalTitle, description: editGoalDescription })
      });
      setEditingGoalId(null);
      fetchGoals();
    } catch (err) {
      console.error(err);
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center text-muted">
        Loading Goals...
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8 flex justify-between items-end">
        <div>
          <p className="text-xs tracking-widest mb-1 text-accent-light" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
            SCHOLAR OBJECTIVES
          </p>
          <h1 className="text-3xl font-bold" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
            Active Goals
          </h1>
        </div>
        <div className="flex gap-2">
          {isSelectMode ? (
            <>
              {selectedGoalIds.length > 0 && (
                <button 
                  onClick={handleBulkDelete}
                  className="px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/50 rounded hover:bg-red-500/30 transition-colors text-sm font-bold"
                >
                  Delete ({selectedGoalIds.length})
                </button>
              )}
              <button 
                onClick={() => { setIsSelectMode(false); setSelectedGoalIds([]); }}
                className="px-4 py-2 bg-white/5 text-gray-300 border border-white/10 rounded hover:bg-white/10 transition-colors text-sm font-bold"
              >
                Cancel
              </button>
            </>
          ) : (
            goals.length > 0 && (
              <button 
                onClick={() => setIsSelectMode(true)}
                className="px-4 py-2 bg-accent-primary/20 text-accent-primary border border-accent-primary/50 rounded hover:bg-accent-primary/30 transition-colors text-sm font-bold"
              >
                Select
              </button>
            )
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Create Goal Form */}
        <div className="system-card p-6 md:col-span-1 h-fit">
          <h2 className="text-lg font-bold mb-4" style={{ fontFamily: "'Rajdhani', sans-serif", color: "var(--accent-primary)" }}>
            SET NEW OBJECTIVE
          </h2>
          <form onSubmit={handleCreateGoal} className="flex flex-col gap-4">
            <div>
              <label className="stat-label block mb-1">Title</label>
              <input
                type="text"
                required
                className="input-field"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title"
              />
            </div>
            <div>
              <label className="stat-label block mb-1">Description (Optional)</label>
              <textarea
                className="input-field min-h-20"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Details about the goal..."
              />
            </div>
            <div>
              <label className="stat-label block mb-1">Target Weeks: {targetWeeks}</label>
              <input
                type="range"
                min="1"
                max="52"
                className="w-full"
                value={targetWeeks}
                onChange={(e) => setTargetWeeks(parseInt(e.target.value))}
              />
            </div>
            <div>
              <label className="stat-label block mb-1">Base Effort Level</label>
              <select
                className="input-field"
                value={effortLevel}
                onChange={(e) => setEffortLevel(e.target.value)}
              >
                <option value="RELAXED">Casual (30m/day)</option>
                <option value="NORMAL">Standard (1h/day)</option>
                <option value="INTENSE">Focused (2h/day)</option>
                <option value="EXTREME">Hardcore (4h/day)</option>
              </select>
            </div>
            <button type="submit" className="btn-primary mt-2">
              Commit Objective
            </button>
          </form>
        </div>

        {/* Goals List */}
        <div className="md:col-span-2 flex flex-col gap-4">
          {goals.length === 0 ? (
            <div className="system-card p-6 text-center text-muted">
              You have no active objectives. Set one to begin.
            </div>
          ) : (
            <>
              {isSelectMode && (
                <div className="flex items-center gap-3 px-4 pb-2 border-b border-white/10 mt-1">
                  <input 
                    type="checkbox" 
                    className="w-4 h-4 cursor-pointer accent-accent-primary"
                    checked={goals.length > 0 && selectedGoalIds.length === goals.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedGoalIds(goals.map(g => g.id));
                      } else {
                        setSelectedGoalIds([]);
                      }
                    }}
                  />
                  <span className="text-sm text-muted">Select All</span>
                </div>
              )}
              {goals.map((goal) => (
              <div 
                key={goal.id} 
                className="system-card p-6"
                style={{
                  borderLeft: `4px solid ${goal.status === "ACTIVE" ? "var(--accent-primary)" : "var(--border-subtle)"}`,
                }}
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1 mr-4 flex gap-4">
                    {isSelectMode && (
                      <input 
                        type="checkbox" 
                        className="mt-2 shrink-0 w-4 h-4 cursor-pointer accent-accent-primary"
                        checked={selectedGoalIds.includes(goal.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedGoalIds(prev => [...prev, goal.id]);
                          } else {
                            setSelectedGoalIds(prev => prev.filter(id => id !== goal.id));
                          }
                        }}
                      />
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
                        </div>
                      ) : (
                        <>
                          <h3 className="text-xl font-bold" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
                            {goal.title}
                        </h3>
                        {goal.description && (
                          <p className="text-sm text-muted mt-1">{goal.description}</p>
                        )}
                      </>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className={`quest-status ${goal.status === "ACTIVE" ? "quest-progress" : ""}`}>
                      {goal.status}
                    </span>
                    <div className="flex gap-2 mt-1">
                      {editingGoalId === goal.id ? (
                        <>
                          <button onClick={() => handleSaveGoal(goal.id)} className="text-xs text-green-400 hover:text-green-300">Save</button>
                          <button onClick={() => setEditingGoalId(null)} className="text-xs text-gray-400 hover:text-gray-300">Cancel</button>
                        </>
                      ) : (
                        <>
                          <button 
                            onClick={() => { setEditingGoalId(goal.id); setEditGoalTitle(goal.title); setEditGoalDescription(goal.description || ""); }}
                            className="text-xs text-blue-400 hover:text-blue-300"
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
                    <span className="font-medium text-accent-light">{goal.targetWeeks} weeks</span>
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
                  <button 
                    className="btn-secondary text-xs py-1.5 px-3"
                    onClick={() => handleAdjustEffort(goal.id, Math.max(1, goal.targetWeeks - 1))}
                  >
                    Compress timeline (-1w)
                  </button>
                  <button 
                    className="btn-secondary text-xs py-1.5 px-3"
                    onClick={() => handleAdjustEffort(goal.id, goal.targetWeeks + 1)}
                  >
                    Extend timeline (+1w)
                  </button>
                </div>
              </div>
            ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
