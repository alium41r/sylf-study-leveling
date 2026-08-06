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
  
  // Edit deadline state
  const [editingDeadlineId, setEditingDeadlineId] = useState<number | null>(null);
  const [newDeadline, setNewDeadline] = useState("");

  const [isNewGoalPanelOpen, setIsNewGoalPanelOpen] = useState(false);

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
              <button 
                onClick={() => { setIsSelectMode(false); setSelectedGoalIds([]); }}
                className="py-2.5 px-4 bg-[#11111f] hover:bg-[#1a1a2e] border border-[#2a2a4a] hover:border-gray-500 rounded-lg text-gray-400 font-bold transition-all flex items-center justify-center shrink-0"
              >
                Done
              </button>
              {selectedGoalIds.length > 0 && (
                <button 
                  onClick={handleBulkDelete}
                  className="py-2.5 px-4 bg-red-900/40 hover:bg-red-800/60 border border-red-500/30 hover:border-red-400 rounded-lg text-red-400 text-sm font-bold tracking-wide transition-all"
                >
                  DELETE SELECTED ({selectedGoalIds.length})
                </button>
              )}
            </>
          ) : (
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setIsNewGoalPanelOpen(true)}
                className="px-4 py-2 bg-[var(--accent-purple)] text-white font-bold rounded hover:opacity-90 transition-opacity text-sm shadow-[0_0_15px_rgba(168,85,247,0.4)]"
                style={{ fontFamily: "'Rajdhani', sans-serif" }}
              >
                + NEW OBJECTIVE
              </button>
              {goals.length > 0 && (
                <button 
                  onClick={() => setIsSelectMode(true)}
                  className="py-2.5 px-4 bg-[#11111f] hover:bg-[#1a1a2e] border border-[#2a2a4a] hover:border-gray-500 rounded-lg text-gray-400 font-bold transition-all"
                >
                  Select
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="w-full flex flex-col gap-4">
        {/* Goals List */}
        <div className="flex flex-col gap-4">
          {goals.length === 0 ? (
            <div className="system-card p-6 text-center text-muted">
              You have no active objectives. Set one to begin.
            </div>
          ) : (
            <>
              {goals.map((goal) => (
              <div 
                key={goal.id} 
                className={`system-card p-6 ${isSelectMode ? 'cursor-pointer' : ''} transition-all ${
                  isSelectMode && selectedGoalIds.includes(goal.id)
                    ? "bg-red-900/20 border-red-500/50"
                    : ""
                }`}
                style={{
                  borderLeft: `4px solid ${goal.status === "ACTIVE" ? "var(--accent-primary)" : "var(--border-subtle)"}`,
                }}
                onClick={() => {
                  if (isSelectMode) {
                    setSelectedGoalIds(prev => 
                      prev.includes(goal.id) ? prev.filter(id => id !== goal.id) : [...prev, goal.id]
                    );
                  }
                }}
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1 mr-4 flex gap-4">
                    {isSelectMode && (
                      <div className={`mt-1.5 shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${selectedGoalIds.includes(goal.id) ? 'bg-red-500 border-red-500' : 'border-gray-500'}`}>
                        {selectedGoalIds.includes(goal.id) && (
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                  {editingDeadlineId === goal.id ? (
                    <div className="flex items-center gap-2">
                      <input 
                        type="date"
                        min={new Date().toISOString().split("T")[0]}
                        className="input-field py-1 px-2 text-xs"
                        style={{ colorScheme: "dark" }}
                        value={newDeadline}
                        onChange={(e) => setNewDeadline(e.target.value)}
                      />
                      <button 
                        className="text-xs text-green-400 hover:text-green-300 font-bold"
                        onClick={() => {
                          if (newDeadline) {
                            const diffTime = Math.abs(new Date(newDeadline).getTime() - new Date().getTime());
                            const diffWeeks = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 7)));
                            handleAdjustEffort(goal.id, diffWeeks);
                          }
                          setEditingDeadlineId(null);
                        }}
                      >
                        Save
                      </button>
                      <button 
                        className="text-xs text-gray-400 hover:text-gray-300 font-bold"
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
                        const d = new Date();
                        d.setDate(d.getDate() + goal.targetWeeks * 7);
                        setNewDeadline(d.toISOString().split("T")[0]);
                      }}
                    >
                      Edit deadline
                    </button>
                  )}
                </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Slide-over Panel for New Objective */}
      {isNewGoalPanelOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm transition-opacity">
          <div 
            className="w-full max-w-md h-full bg-[#0a0a16] border-l border-[#2a2a4a] p-8 overflow-y-auto shadow-2xl flex flex-col gap-6"
            style={{ animation: 'slideInRight 0.3s ease-out forwards' }}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold tracking-wide" style={{ fontFamily: "'Rajdhani', sans-serif", color: "var(--accent-primary)" }}>
                SET NEW OBJECTIVE
              </h2>
              <button 
                onClick={() => setIsNewGoalPanelOpen(false)}
                className="text-gray-400 hover:text-white transition-colors p-2"
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
                  className="input-field bg-[#111122] border-[#2a2a4a] focus:border-[var(--accent-primary)] py-3"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Enter objective title..."
                />
              </div>
              
              <div>
                <label className="stat-label block mb-2 text-sm">Description (Optional)</label>
                <textarea
                  className="input-field min-h-32 bg-[#111122] border-[#2a2a4a] focus:border-[var(--accent-primary)] py-3 resize-none"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Details about what you want to achieve..."
                />
              </div>
              
              <div className="bg-[#111122] p-4 rounded-lg border border-[#2a2a4a]">
                <div className="flex justify-between items-center mb-4">
                  <label className="stat-label text-sm m-0">Target Timeline</label>
                  <span className="text-[var(--accent-primary)] font-bold font-['Rajdhani'] text-lg">{targetWeeks} Weeks</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="52"
                  className="w-full accent-[var(--accent-primary)]"
                  value={targetWeeks}
                  onChange={(e) => setTargetWeeks(parseInt(e.target.value))}
                />
                <div className="flex justify-between text-xs text-gray-500 mt-2 font-['Rajdhani']">
                  <span>1 Week</span>
                  <span>1 Year</span>
                </div>
              </div>
              
              <div>
                <label className="stat-label block mb-2 text-sm">Base Effort Level</label>
                <select
                  className="input-field bg-[#111122] border-[#2a2a4a] focus:border-[var(--accent-primary)] py-3"
                  value={effortLevel}
                  onChange={(e) => setEffortLevel(e.target.value)}
                >
                  <option value="RELAXED">Casual (30 mins/day)</option>
                  <option value="NORMAL">Standard (1 hour/day)</option>
                  <option value="INTENSE">Focused (2 hours/day)</option>
                  <option value="EXTREME">Hardcore (4 hours/day)</option>
                </select>
              </div>
              
              <div className="mt-auto pt-6">
                <button type="submit" className="w-full py-4 bg-[var(--accent-purple)] hover:opacity-90 rounded-lg text-white font-bold tracking-widest transition-all shadow-[0_0_20px_rgba(168,85,247,0.3)] hover:shadow-[0_0_30px_rgba(168,85,247,0.5)]" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
                  COMMIT OBJECTIVE
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}} />
    </div>
  );
}
