"use client";

import { useState, useEffect } from "react";
import { useAuth } from "../components/AuthProvider";

interface Quest {
  id: number;
  title: string;
  status: string;
  xpReward: number;
  sylphReward: number;
  requiredMinutes: number;
  scheduledFor: string;
  goal: { id: number; title: string };
}

export default function QuestsPage() {
  const { token } = useAuth();
  const [quests, setQuests] = useState<Quest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedQuestIds, setSelectedQuestIds] = useState<number[]>([]);
  const [isSelectMode, setIsSelectMode] = useState(false);

  // Editing state for quests
  const [editingQuestId, setEditingQuestId] = useState<number | null>(null);
  const [editQuestTitle, setEditQuestTitle] = useState("");
  const [editQuestMinutes, setEditQuestMinutes] = useState(30);

  const fetchQuests = () => {
    if (!token) return;
    fetch("/api/quests?all=true", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => {
        setQuests(Array.isArray(data) ? data : []);
        setIsLoading(false);
      })
      .catch(console.error);
  };

  useEffect(() => {
    fetchQuests();
  }, [token]);

  if (isLoading) {
    return (
      <div className="p-8 text-center text-muted">
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

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8 flex justify-between items-end">
        <div>
          <p className="text-xs tracking-widest mb-1 text-accent-light" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
            SCHOLAR TASKS
          </p>
          <h1 className="text-3xl font-bold" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
            Quest Log
          </h1>
        </div>
        <div className="flex gap-2">
          {isSelectMode ? (
            <>
              {selectedQuestIds.length > 0 && (
                <button 
                  onClick={handleBulkDelete}
                  className="px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/50 rounded hover:bg-red-500/30 transition-colors text-sm font-bold"
                >
                  Delete ({selectedQuestIds.length})
                </button>
              )}
              <button 
                onClick={() => { setIsSelectMode(false); setSelectedQuestIds([]); }}
                className="px-4 py-2 bg-white/5 text-gray-300 border border-white/10 rounded hover:bg-white/10 transition-colors text-sm font-bold"
              >
                Cancel
              </button>
            </>
          ) : (
            quests.length > 0 && (
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

      <div className="system-card p-6">
        {quests.length === 0 ? (
          <p className="text-center text-muted py-8">
            The System has not issued any quests yet. Create a Goal first.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {isSelectMode && (
              <div className="flex items-center gap-3 px-4 pb-2 border-b border-white/10">
                <input 
                  type="checkbox" 
                  className="w-4 h-4 cursor-pointer accent-accent-primary"
                  checked={quests.length > 0 && selectedQuestIds.length === quests.length}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedQuestIds(quests.map(q => q.id));
                    } else {
                      setSelectedQuestIds([]);
                    }
                  }}
                />
                <span className="text-sm text-muted">Select All</span>
              </div>
            )}
            {quests.map((quest) => (
              <div 
                key={quest.id} 
                className="flex flex-col md:flex-row md:items-center justify-between p-4 rounded bg-white/5 border border-white/10"
                style={{
                  borderLeft: `4px solid ${
                    quest.status === "COMPLETED"
                      ? "var(--accent-green)"
                      : quest.status === "FAILED"
                      ? "var(--accent-red)"
                      : quest.status === "IN_PROGRESS"
                      ? "var(--accent-primary)"
                      : "var(--accent-primary)"
                  }`
                }}
              >
                <div className="flex-1 mr-4 flex items-start gap-4">
                  {isSelectMode && (
                    <input 
                      type="checkbox" 
                      className="mt-1 shrink-0 w-4 h-4 cursor-pointer accent-accent-primary"
                      checked={selectedQuestIds.includes(quest.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedQuestIds(prev => [...prev, quest.id]);
                        } else {
                          setSelectedQuestIds(prev => prev.filter(id => id !== quest.id));
                        }
                      }}
                    />
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
                        <span className="text-xs text-muted">min</span>
                      </div>
                    </div>
                  ) : (
                    <>
                      <h3 className="font-bold mb-1">{quest.title}</h3>
                      <p className="text-xs text-muted mb-2">
                        Part of: {quest.goal?.title || "Unknown Goal"} • {new Date(quest.scheduledFor).toLocaleDateString()}
                      </p>
                      <div className="flex gap-3 text-sm">
                        <span className="text-accent-light">+{quest.xpReward} XP</span>
                        <span className="flex items-center gap-1.5 text-cyan-400 font-bold">
                          <div className="w-5 h-5 rounded-full overflow-hidden flex items-center justify-center shrink-0">
                            <img src="/sylph-logo.jpg" alt="Sylph" className="w-full h-full object-cover scale-[1.35]" />
                          </div>
                          +{quest.sylphReward}
                        </span>
                        <span className="text-gray-400">⏱️ {quest.requiredMinutes} min</span>
                      </div>
                    </>
                  )}
                  </div>
                </div>
                <div className="mt-4 md:mt-0 flex flex-col md:items-end gap-2">
                  <span className={`quest-status quest-${
                    quest.status === "COMPLETED" ? "completed"
                    : quest.status === "FAILED" ? "failed"
                    : quest.status === "IN_PROGRESS" ? "progress"
                    : "pending"
                  }`}>
                    {quest.status}
                  </span>
                  
                  <div className="flex gap-2 mt-1">
                    {editingQuestId === quest.id ? (
                      <>
                        <button onClick={() => handleSaveQuest(quest.id)} className="text-xs text-green-400 hover:text-green-300">Save</button>
                        <button onClick={() => setEditingQuestId(null)} className="text-xs text-gray-400 hover:text-gray-300">Cancel</button>
                      </>
                    ) : (
                      <>
                        <button 
                          onClick={() => { setEditingQuestId(quest.id); setEditQuestTitle(quest.title); setEditQuestMinutes(quest.requiredMinutes); }}
                          className="text-xs text-blue-400 hover:text-blue-300"
                        >Edit</button>
                        <button onClick={() => handleDeleteQuest(quest.id)} className="text-xs text-red-400 hover:text-red-300">Delete</button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
