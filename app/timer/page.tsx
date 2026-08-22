"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../components/AuthProvider";
import LevelUpOverlay from "../components/LevelUpOverlay";

interface Subject {
  id: number;
  name: string;
  code: string;
  examBoard?: string;
  level?: string;
  color?: string;
  nodesCount?: number;
  todaySeconds: number;
}

export default function TimerPage() {
  const { token, user } = useAuth();
  const router = useRouter();
  
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [quests, setQuests] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [showAddSubject, setShowAddSubject] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [newSubjectCode, setNewSubjectCode] = useState("");
  const [newExamBoard, setNewExamBoard] = useState("CAIE");
  const [newSubjectAcademicLevel, setNewSubjectAcademicLevel] = useState("A-Level");
  const [newColor, setNewColor] = useState("#8B5CF6");
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
  }, [user]);

  const fetchSubjectsAndQuests = async () => {
    if (!token) return;
    try {
      const [subRes, questRes] = await Promise.all([
        fetch("/api/subjects", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/quests", { headers: { Authorization: `Bearer ${token}` } })
      ]);
      
      if (subRes.ok) {
        const data = await subRes.json();
        setSubjects(Array.isArray(data) ? data : []);
      }
      
      if (questRes.ok) {
        const data = await questRes.json();
        setQuests(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSubjectsAndQuests();
  }, [token]);

  const handleAddSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubjectName.trim() || !newSubjectCode.trim() || !token) return;
    setIsAdding(true);

    try {
      const res = await fetch("/api/subjects", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newSubjectName.trim(),
          code: newSubjectCode.trim().toUpperCase(),
          examBoard: newExamBoard.trim() || "CAIE",
          level: newSubjectAcademicLevel.trim() || "A-Level",
          color: newColor || "#8B5CF6",
        }),
      });
      
      if (res.ok) {
        const data = await res.json();
        setSubjects([...subjects, data]);
        setNewSubjectName("");
        setNewSubjectCode("");
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

  const subjectsSeconds = subjects.reduce((acc, sub) => acc + (sub.todaySeconds || 0), 0);
  const cumulativeSeconds = user?.completedTodaySeconds !== undefined && user.completedTodaySeconds > 0
    ? Math.max(subjectsSeconds, user.completedTodaySeconds)
    : subjectsSeconds;

  return (
    <div className="w-full max-w-4xl mx-auto px-4 sm:px-8 py-4 sm:py-8">
      <div className="mb-8">
        <p
          className="text-xs tracking-widest mb-1 text-accent-text-light font-bold"
          style={{ fontFamily: "'Rajdhani', sans-serif" }}
        >
          STUDY TIMER
        </p>
        <h1 className="text-3xl font-bold" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
          Focus Sessions
        </h1>
      </div>

      {/* ─── Cumulative Timer Display ──────────────────────────── */}
      <div className="system-card p-6 sm:p-10 text-center mb-10 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 opacity-50" style={{ background: "linear-gradient(to right, transparent, var(--accent-primary-light), transparent)" }} />
        
        <p className="text-sm font-bold tracking-widest uppercase mb-4 text-text-muted" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
          DAILY FOCUS - {new Date().toISOString().split("T")[0].replace(/-/g, ".")}
        </p>
        
        <p
          className="text-5xl xs:text-6xl md:text-8xl font-bold font-mono tabular-nums tracking-wider mb-2 text-accent-text-light"
          style={{
            textShadow: "var(--text-glow)",
          }}
        >
          {formatTime(cumulativeSeconds)}
        </p>
        <p className="text-sm text-text-muted mt-2">Total focus time across quests and subjects today</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* ─── Quests Timer Section ──────────────────────────── */}
        <div>
          <div className="flex items-center h-8 mb-6">
            <h2 className="text-xl font-bold text-accent-text-light font-['Rajdhani']">
              Active Quests
            </h2>
          </div>
          {isLoading ? (
            <p className="text-text-muted py-4">Loading quests...</p>
          ) : quests.filter(q => q.status === "PENDING" || q.status === "IN_PROGRESS" || q.status === "ACTIVE").length === 0 ? (
            <div className="text-center py-10 border border-dashed border-border-subtle rounded-lg">
              <p className="text-sm text-text-secondary italic">No active quests today.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {quests.filter(q => q.status === "PENDING" || q.status === "IN_PROGRESS" || q.status === "ACTIVE").map((quest) => (
                <div 
                  key={quest.id} 
                  className="system-card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-accent-dim transition-colors relative hover:z-50"
                  style={{ borderLeft: `3px solid var(--accent-primary)` }}
                >
                  <div className="flex items-center gap-4 min-w-0 flex-1 pr-4">
                    <button
                      onClick={() =>
                        router.push(
                          `/focus?questId=${quest.id}&subjectId=${quest.subjectId || ""}&subjectName=${encodeURIComponent(quest.subject?.name || quest.title)}`
                        )
                      }
                      className="w-12 h-12 shrink-0 rounded-full flex items-center justify-center bg-accent-dim text-accent-light hover:bg-accent-mid hover:text-white transition-colors"
                    >
                      <svg className="w-6 h-6 ml-1" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="relative group/title cursor-default inline-block max-w-full">
                        <span className="font-medium tracking-wide text-base block truncate transition-colors" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
                          {quest.title}
                        </span>
                        {/* Glassmorphism Tooltip */}
                        <div className="absolute left-0 top-full mt-1 hidden group-hover/title:block z-[100] bg-bg-abyss/95 backdrop-blur-xl text-text-primary text-sm p-3 rounded-lg shadow-2xl border border-border-subtle whitespace-normal min-w-[200px] w-max max-w-[300px]">
                          {quest.title}
                        </div>
                      </div>
                      <span className="text-sm text-text-muted block truncate mt-0.5">
                        Target: {quest.targetMinutes || quest.requiredMinutes || 45} min • {quest.difficulty || "Normal"}
                      </span>
                    </div>
                  </div>
                  <div className="font-mono tabular-nums tracking-tight text-xl text-text-primary shrink-0">
                    {formatTime(quest.elapsedSeconds || 0)} <span className="text-text-muted text-lg">/ {formatTime((quest.targetMinutes || quest.requiredMinutes || 45) * 60)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ─── Subject List ─────────────────────────── */}
        <div>
          <div className="flex items-center justify-between h-8 mb-6">
            <h2 className="text-xl font-bold text-accent-text-light font-['Rajdhani']">
              Subjects
            </h2>
            {!showAddSubject && (
              <button
                onClick={() => setShowAddSubject(true)}
                className="text-sm font-medium tracking-wide text-accent-text-light hover:text-text-primary transition-colors flex items-center gap-1 bg-accent-dim/30 px-3 py-1.5 rounded-full hover:bg-accent-dim/50"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Subject
              </button>
            )}
          </div>
          <div className="space-y-4">
            {isLoading ? (
              <p className="text-center text-text-muted py-8">Loading subjects...</p>
            ) : subjects.length === 0 ? (
              <div className="text-center py-10 border border-dashed border-border-subtle rounded-lg">
                <p className="text-text-secondary">No subjects configured yet.</p>
              </div>
            ) : (
              subjects.map((subject) => (
                <div 
                  key={subject.id} 
                  className="system-card p-5 flex items-center justify-between gap-4 hover:border-accent-dim transition-colors relative overflow-hidden"
                  style={{ borderLeft: `4px solid ${subject.color || "var(--accent-primary)"}` }}
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <button
                      onClick={() => handleStartFocus(subject.id, subject.name)}
                      className="w-12 h-12 shrink-0 rounded-full flex items-center justify-center bg-accent-dim text-accent-light hover:bg-accent-mid hover:text-text-primary transition-colors"
                      title="Start focus session"
                    >
                      <svg className="w-6 h-6 ml-1" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </button>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold tracking-wide text-base truncate block" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
                          {subject.name}
                        </span>
                        {subject.code && (
                          <span
                            className="text-[10px] font-mono px-1.5 py-0.5 rounded font-bold uppercase"
                            style={{
                              backgroundColor: `${subject.color || "#8B5CF6"}20`,
                              color: subject.color || "#8B5CF6",
                              border: `1px solid ${subject.color || "#8B5CF6"}40`,
                            }}
                          >
                            {subject.code}
                          </span>
                        )}
                      </div>
                      {(subject.examBoard || subject.level) && (
                        <p className="text-xs text-text-muted mt-0.5">
                          {subject.examBoard} {subject.level ? `• ${subject.level}` : ""}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="font-mono tabular-nums tracking-tight text-xl text-text-primary shrink-0">
                    {formatTime(subject.todaySeconds || 0)}
                  </div>
                </div>
              ))
            )}

            {/* Add Subject Inline Form */}
            {showAddSubject && (
              <form onSubmit={handleAddSubject} className="system-card p-6 flex flex-col gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-mono uppercase text-text-secondary mb-1 block">
                      Subject Name *
                    </label>
                    <input
                      type="text"
                      autoFocus
                      required
                      value={newSubjectName}
                      onChange={(e) => setNewSubjectName(e.target.value)}
                      placeholder="e.g. Mathematics, Physics"
                      className="w-full bg-bg-void/50 border border-border-subtle rounded p-2.5 text-text-primary text-xs focus:outline-none focus:border-accent-mid transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-mono uppercase text-text-secondary mb-1 block">
                      Syllabus Code *
                    </label>
                    <input
                      type="text"
                      required
                      value={newSubjectCode}
                      onChange={(e) => setNewSubjectCode(e.target.value.toUpperCase())}
                      placeholder="e.g. 9709, PHYS-101"
                      className="w-full bg-bg-void/50 border border-border-subtle rounded p-2.5 text-text-primary text-xs focus:outline-none focus:border-accent-mid transition-colors"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-mono uppercase text-text-secondary mb-1 block">
                      Exam Board
                    </label>
                    <select
                      value={newExamBoard}
                      onChange={(e) => setNewExamBoard(e.target.value)}
                      className="w-full bg-bg-void/50 border border-border-subtle rounded p-2.5 text-text-primary text-xs focus:outline-none focus:border-accent-mid transition-colors"
                    >
                      <option value="CAIE">CAIE</option>
                      <option value="Edexcel">Edexcel</option>
                      <option value="AQA">AQA</option>
                      <option value="AP">AP</option>
                      <option value="IB">IB</option>
                      <option value="University">University</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-mono uppercase text-text-secondary mb-1 block">
                      Academic Level
                    </label>
                    <select
                      value={newSubjectAcademicLevel}
                      onChange={(e) => setNewSubjectAcademicLevel(e.target.value)}
                      className="w-full bg-bg-void/50 border border-border-subtle rounded p-2.5 text-text-primary text-xs focus:outline-none focus:border-accent-mid transition-colors"
                    >
                      <option value="A-Level">A-Level</option>
                      <option value="AS-Level">AS-Level</option>
                      <option value="AP">AP</option>
                      <option value="IB">IB</option>
                      <option value="University">University</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-2 border-t border-border-subtle">
                  <button
                    type="button"
                    onClick={() => setShowAddSubject(false)}
                    className="px-4 py-2 text-xs text-text-secondary hover:text-text-primary transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isAdding}
                    className="px-6 py-2 bg-accent-primary text-white rounded hover:bg-accent-primary-light transition-colors font-bold tracking-wide text-xs uppercase"
                  >
                    {isAdding ? "Provisioning..." : "Add Subject"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
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
