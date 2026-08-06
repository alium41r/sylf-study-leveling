"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../components/AuthProvider";
import LevelUpOverlay from "../components/LevelUpOverlay";

interface Subject {
  id: number;
  name: string;
  color: string;
  todaySeconds: number;
}

export default function TimerPage() {
  const { token, user } = useAuth();
  const router = useRouter();
  
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [showAddSubject, setShowAddSubject] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  // Level up tracking
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [newLevel, setNewLevel] = useState(0);
  const [newRank, setNewRank] = useState<string | undefined>(undefined);
  const [prevLevel, setPrevLevel] = useState<number | null>(null);

  useEffect(() => {
    if (user) {
      if (prevLevel !== null && user.level > prevLevel) {
        setNewLevel(user.level);
        setNewRank(user.hunterRank);
        setShowLevelUp(true);
      }
      setPrevLevel(user.level);
    }
  }, [user]); // Removed prevLevel from dependency array to avoid loop

  const fetchSubjects = async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/subjects", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSubjects(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSubjects();
  }, [token]);

  const handleAddSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubjectName.trim() || !token) return;
    setIsAdding(true);

    try {
      const res = await fetch("/api/subjects", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: newSubjectName.trim() }),
      });
      
      if (res.ok) {
        const data = await res.json();
        setSubjects([...subjects, data]);
        setNewSubjectName("");
        setShowAddSubject(false);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsAdding(false);
    }
  };

  const handleStartFocus = (subjectId: number, subjectName: string) => {
    router.push(`/focus?subjectId=${subjectId}&subjectName=${encodeURIComponent(subjectName)}`);
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const cumulativeSeconds = subjects.reduce((acc, sub) => acc + sub.todaySeconds, 0);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <p
          className="text-xs tracking-widest mb-1 text-accent-light"
          style={{ fontFamily: "'Rajdhani', sans-serif" }}
        >
          STUDY TIMER
        </p>
        <h1 className="text-3xl font-bold" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
          Focus Sessions
        </h1>
      </div>

      {/* ─── Cumulative Timer Display ──────────────────────────── */}
      <div className="system-card p-10 text-center mb-10 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 opacity-50" style={{ background: "linear-gradient(to right, transparent, var(--accent-primary-light), transparent)" }} />
        
        <p className="text-sm font-bold tracking-widest uppercase mb-4 text-gray-400" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
          DAILY FOCUS - {new Date().toISOString().split("T")[0].replace(/-/g, ".")}
        </p>
        
        <p
          className="text-6xl md:text-8xl font-bold font-mono tracking-wider mb-2 text-accent-light"
          style={{
            textShadow: "0 0 30px var(--accent-primary-mid)",
          }}
        >
          {formatTime(cumulativeSeconds)}
        </p>
        <p className="text-sm text-gray-500 mt-2">Total time across all subjects today</p>
      </div>

      {/* ─── Subject List ─────────────────────────── */}
      <div className="space-y-4">
        {isLoading ? (
          <p className="text-center text-gray-500 py-8">Loading subjects...</p>
        ) : subjects.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-white/10 rounded-lg">
            <p className="text-gray-400 mb-4">No subjects added yet.</p>
          </div>
        ) : (
          subjects.map((subject) => (
            <div 
              key={subject.id} 
              className="system-card p-4 flex items-center justify-between hover:border-accent-dim transition-colors"
            >
              <div className="flex items-center gap-4">
                <button
                  onClick={() => handleStartFocus(subject.id, subject.name)}
                  className="w-10 h-10 rounded-full flex items-center justify-center bg-accent-dim text-accent-light hover:bg-accent-mid hover:text-white transition-colors"
                >
                  <svg className="w-5 h-5 ml-1" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </button>
                <span className="font-medium tracking-wide uppercase text-sm" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
                  {subject.name}
                </span>
              </div>
              <div className="font-mono text-lg text-gray-300">
                {formatTime(subject.todaySeconds)}
              </div>
            </div>
          ))
        )}

        {/* Add Subject Card */}
        {!showAddSubject ? (
          <button
            onClick={() => setShowAddSubject(true)}
            className="w-full system-card p-6 flex flex-col items-center justify-center text-gray-400 hover:text-accent-light hover:border-accent-dim transition-colors border-dashed"
          >
            <div className="w-12 h-12 rounded border border-current flex items-center justify-center mb-3">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <p className="text-sm font-bold tracking-widest uppercase mb-1" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
              INITIALIZE NEW QUEST
            </p>
            <p className="text-xs">Add a subject to begin leveling</p>
          </button>
        ) : (
          <form onSubmit={handleAddSubject} className="system-card p-6 flex flex-col gap-4">
            <div>
              <label className="text-xs uppercase tracking-widest text-gray-400 mb-2 block" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
                Subject Name
              </label>
              <input
                type="text"
                autoFocus
                required
                value={newSubjectName}
                onChange={(e) => setNewSubjectName(e.target.value)}
                placeholder="e.g. Mathematics, History"
                className="w-full bg-black/50 border border-white/10 rounded p-3 text-white focus:outline-none focus:border-accent-mid transition-colors"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowAddSubject(false)}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isAdding}
                className="px-6 py-2 bg-accent-dim text-accent-light border border-accent-dim rounded hover:bg-accent-mid hover:text-white transition-colors font-bold tracking-wider text-sm uppercase"
                style={{ fontFamily: "'Rajdhani', sans-serif" }}
              >
                {isAdding ? "Adding..." : "Add Subject"}
              </button>
            </div>
          </form>
        )}
      </div>
      
      <LevelUpOverlay 
        show={showLevelUp} 
        newLevel={newLevel} 
        newRank={newRank} 
        onClose={() => setShowLevelUp(false)} 
      />
    </div>
  );
}
