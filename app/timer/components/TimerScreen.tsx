/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */
"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/app/components/AuthProvider";
import {
  Play,
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { QuestEmblemIcon, SubjectGrimoireIcon, FocusClockIcon } from "@/app/components/icons";
import { SubjectModal, SubjectItem } from "./SubjectModal";
import { DeleteSubjectModal } from "./DeleteSubjectModal";
import styles from "../Timer.module.css";

export function TimerScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [quests, setQuests] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Subject Modal (Unified Create & Edit)
  const [isSubjectModalOpen, setIsSubjectModalOpen] = useState(false);
  const [subjectModalMode, setSubjectModalMode] = useState<"create" | "edit">("create");
  const [selectedSubject, setSelectedSubject] = useState<SubjectItem | null>(null);

  // Delete Subject Modal
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SubjectItem | null>(null);
  const [deleteDependencies, setDeleteDependencies] = useState({
    activeQuestsCount: 0,
    hasActiveSession: false,
  });

  // Action Menu State
  const [openMenuSubjectId, setOpenMenuSubjectId] = useState<number | null>(null);

  // Undo Toast State
  const [undoSubject, setUndoSubject] = useState<SubjectItem | null>(null);
  const undoTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Level-up celebrations are owned globally by `LevelUpProvider`, which
  // watches the same `user.level` and plays the sequence on every screen.

  // Close open action menu on outside click or escape
  useEffect(() => {
    if (openMenuSubjectId === null) return;
    const handleClickOutside = () => setOpenMenuSubjectId(null);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenMenuSubjectId(null);
    };
    window.addEventListener("click", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("click", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [openMenuSubjectId]);

  // Clean up undo timer on unmount
  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

  const fetchSubjectsAndQuests = async () => {
    if (!user) return;
    try {
      const [subRes, questRes] = await Promise.all([
        fetch("/api/subjects"),
        fetch("/api/quests"),
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
  }, [user?.id]);

  const handleOpenAddSubject = () => {
    setSubjectModalMode("create");
    setSelectedSubject(null);
    setIsSubjectModalOpen(true);
  };

  const handleOpenEdit = (subject: SubjectItem) => {
    setSubjectModalMode("edit");
    setSelectedSubject(subject);
    setIsSubjectModalOpen(true);
  };

  const handleOpenDelete = async (subject: SubjectItem) => {
    // Check client-side running timer
    let hasLocalActive = false;
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith(`runningTimerState_${subject.id}_`)) {
            const state = JSON.parse(localStorage.getItem(key) || "{}");
            if (!state.isPaused && state.phase === "focus") {
              hasLocalActive = true;
              break;
            }
          }
        }
      } catch {}
    }

    const activeQuestsCount = quests.filter(
      (q) =>
        q.subjectId === subject.id &&
        (q.status === "PENDING" ||
          q.status === "IN_PROGRESS" ||
          q.status === "ACTIVE")
    ).length;

    setDeleteTarget(subject);
    setDeleteDependencies({
      activeQuestsCount,
      hasActiveSession: hasLocalActive,
    });
    setIsDeleteModalOpen(true);

    // Authority check: query server to verify active session and dependent records
    try {
      const res = await fetch(`/api/subjects/${subject.id}`);
      if (res.ok) {
        const data = await res.json();
        setDeleteDependencies({
          activeQuestsCount: Math.max(activeQuestsCount, data.activeQuestsCount || 0),
          hasActiveSession: hasLocalActive || !!data.hasActiveSession,
        });
      }
    } catch {}
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;

    const res = await fetch(`/api/subjects/${deleteTarget.id}`, {
      method: "DELETE",
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || data.error || "Failed to delete subject.");
    }

    const removedSubject = deleteTarget;
    setSubjects((prev) => prev.filter((s) => s.id !== removedSubject.id));
    setIsDeleteModalOpen(false);
    setDeleteTarget(null);

    // Show undo toast notification (Requirement 16)
    setUndoSubject(removedSubject);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => {
      setUndoSubject(null);
    }, 6000);
  };

  const handleUndoDelete = async () => {
    if (!undoSubject) return;
    const target = undoSubject;
    try {
      const res = await fetch(`/api/subjects/${target.id}/restore`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setSubjects((prev) => [...prev, data.subject || target]);
        setUndoSubject(null);
      }
    } catch (err) {
      console.error("Failed to undo subject deletion:", err);
    }
  };

  const handleSuccessSubjectModal = (savedSubject: SubjectItem) => {
    setSubjects((prev) => {
      const index = prev.findIndex((s) => s.id === savedSubject.id);
      if (index >= 0) {
        const next = [...prev];
        next[index] = savedSubject;
        return next;
      } else {
        return [...prev, savedSubject];
      }
    });
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

  const getDifficultyClass = (diff: string) => {
    switch (diff?.toUpperCase()) {
      case "EASY":
        return styles.diffEasy;
      case "HARD":
        return styles.diffHard;
      case "EXPERT":
        return styles.diffExpert;
      default:
        return styles.diffNormal;
    }
  };

  const subjectsSeconds = subjects.reduce((acc, sub) => acc + (sub.todaySeconds || 0), 0);
  const cumulativeSeconds =
    user?.completedTodaySeconds !== undefined && user.completedTodaySeconds > 0
      ? Math.max(subjectsSeconds, user.completedTodaySeconds)
      : subjectsSeconds;

  const activeQuests = quests.filter(
    (q) => q.status === "PENDING" || q.status === "IN_PROGRESS" || q.status === "ACTIVE"
  );

  return (
    <div className={styles.timerContainer}>
      {/* Ambient Starlight Glow */}
      <div className={styles.topGlow} aria-hidden="true" />

      {/* Main Page Content */}
      <div
        className={`${styles.contentWrapper} ${
          isSubjectModalOpen || isDeleteModalOpen ? styles.contentWrapperBlurred : ""
        }`}
      >
        {/* ─── Header ───────────────────────────────────────── */}
        <div className={styles.headerArea}>
          <p className={styles.eyebrow}>
            <span className={styles.eyebrowDot} />
            Study Timer
          </p>
          <h1 className={styles.title}>
            Focus <em>Sessions</em>
          </h1>
          <p className={styles.subtitle}>
            Track daily focus, active quests, and subject sessions.
          </p>
        </div>

        {/* ─── Hero Cumulative Focus Display ─────────────────── */}
        <div className={styles.heroTimerCard}>
          <div className={styles.heroDateBadge}>
            <FocusClockIcon size={12} />
            <span>DAILY FOCUS • {new Date().toISOString().split("T")[0].replace(/-/g, ".")}</span>
          </div>

          <div className={styles.heroClock}>
            {formatTime(cumulativeSeconds)}
          </div>

          <p className={styles.heroCaption}>
            Total focus time across quests and subjects today
          </p>
        </div>

        {/* ─── Two Column Layout ─────────────────────────────── */}
        <div className={styles.splitLayout}>
          {/* ─── Active Quests Section ──────────────────────── */}
          <div className={styles.columnArea}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitleGroup}>
                <QuestEmblemIcon className={styles.sectionIcon} size={18} />
                <h2 className={styles.sectionTitle}>Active Quests</h2>
                {activeQuests.length > 0 && (
                  <span className={styles.countChip}>{activeQuests.length}</span>
                )}
              </div>
            </div>

            {isLoading ? (
              <div className={styles.emptyState}>
                <p className={styles.emptyText}>Loading quests...</p>
              </div>
            ) : activeQuests.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIconCircle}>
                  <QuestEmblemIcon size={20} />
                </div>
                <p className={styles.emptyText}>No active quests today.</p>
                <Link href="/dashboard" className={styles.emptyLink}>
                  <QuestEmblemIcon size={13} />
                  <span>View Quests in Dashboard</span>
                </Link>
              </div>
            ) : (
              <div className={styles.itemList}>
                {activeQuests.map((quest) => (
                  <div
                    key={quest.id}
                    className={styles.itemCard}
                    style={{ borderLeft: "3px solid var(--accent-strong)" }}
                  >
                    <div className={styles.itemMain}>
                      <button
                        onClick={() =>
                          router.push(
                            `/focus?questId=${quest.id}&subjectId=${quest.subjectId || ""}&subjectName=${encodeURIComponent(
                              quest.subject?.name || quest.title
                            )}`
                          )
                        }
                        className={styles.playBtn}
                        title="Start focus session"
                        aria-label={`Start focus session for ${quest.title}`}
                      >
                        <Play size={16} fill="currentColor" className={styles.playIcon} />
                      </button>
                      <div className={styles.itemContent}>
                        <div className={styles.itemTitleRow}>
                          <div className={styles.tooltipWrapper}>
                            <h3 className={styles.itemTitle}>{quest.title}</h3>
                            <div className={styles.tooltipPopup}>{quest.title}</div>
                          </div>
                          <span
                            className={`${styles.diffChip} ${getDifficultyClass(quest.difficulty)}`}
                          >
                            {quest.difficulty || "Normal"}
                          </span>
                        </div>
                        <p className={styles.itemMeta}>
                          Target: {quest.targetMinutes || quest.requiredMinutes || 45} min
                        </p>
                      </div>
                    </div>
                    <div className={styles.timerReadout}>
                      {formatTime(quest.elapsedSeconds || 0)}{" "}
                      <span className={styles.timerTargetMuted}>
                        / {formatTime((quest.targetMinutes || quest.requiredMinutes || 45) * 60)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ─── Subjects Section ────────────────────────────── */}
          <div className={styles.columnArea}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitleGroup}>
                <SubjectGrimoireIcon className={styles.sectionIcon} size={18} />
                <h2 className={styles.sectionTitle}>Subjects</h2>
                {subjects.length > 0 && (
                  <span className={styles.countChip}>{subjects.length}</span>
                )}
              </div>
              <button
                onClick={handleOpenAddSubject}
                className={styles.btnAddSubject}
                type="button"
              >
                <Plus size={14} />
                Add Subject
              </button>
            </div>

            {isLoading ? (
              <div className={styles.emptyState}>
                <p className={styles.emptyText}>Loading subjects...</p>
              </div>
            ) : subjects.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIconCircle}>
                  <SubjectGrimoireIcon size={20} />
                </div>
                <p className={styles.emptyText}>No subjects configured yet.</p>
                <button
                  onClick={handleOpenAddSubject}
                  className={styles.emptyLink}
                  type="button"
                >
                  <Plus size={13} />
                  <span>Add your first subject</span>
                </button>
              </div>
            ) : (
              <div className={styles.itemList}>
                {subjects.map((subject) => (
                  <div
                    key={subject.id}
                    className={styles.itemCard}
                    style={{
                      borderLeft: `3px solid ${subject.color || "var(--accent-strong)"}`,
                    }}
                  >
                    <div className={styles.itemMain}>
                      <button
                        onClick={() => handleStartFocus(subject.id, subject.name)}
                        className={styles.playBtn}
                        title="Start focus session"
                        aria-label={`Start focus session for ${subject.name}`}
                      >
                        <Play size={16} fill="currentColor" className={styles.playIcon} />
                      </button>
                      <div className={styles.itemContent}>
                        <div className={styles.itemTitleRow}>
                          <h3 className={styles.itemTitle}>{subject.name}</h3>
                          {subject.code && (
                            <span
                              className={styles.codeBadge}
                              style={{
                                backgroundColor: `${subject.color || "#86aaf4"}1a`,
                                color: subject.color || "#86aaf4",
                                border: `1px solid ${subject.color || "#86aaf4"}33`,
                              }}
                            >
                              {subject.code}
                            </span>
                          )}
                        </div>
                        {(subject.examBoard || subject.level) && (
                          <p className={styles.itemMeta}>
                            {subject.examBoard} {subject.level ? `• ${subject.level}` : ""}
                          </p>
                        )}
                        {subject.syllabusNote && (
                          <p className={styles.itemNote} title={subject.syllabusNote}>
                            {subject.syllabusNote}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Right Area: Timer Readout & Action Menu Affordance */}
                    <div className={styles.itemRight}>
                      <div className={styles.timerReadout}>
                        {formatTime(subject.todaySeconds || 0)}
                      </div>

                      {/* Compact Affordance [•••] (Requirement 1 & 17) */}
                      <div className={styles.menuContainer}>
                        <button
                          type="button"
                          className={styles.btnMenuTrigger}
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuSubjectId(
                              openMenuSubjectId === subject.id ? null : subject.id
                            );
                          }}
                          aria-label={`Manage ${subject.name}`}
                          aria-haspopup="menu"
                          aria-expanded={openMenuSubjectId === subject.id}
                        >
                          <MoreVertical size={16} />
                        </button>

                        {/* Dropdown Menu */}
                        {openMenuSubjectId === subject.id && (
                          <div
                            className={styles.dropdownMenu}
                            role="menu"
                            aria-label={`Actions for ${subject.name}`}
                          >
                            <button
                              type="button"
                              role="menuitem"
                              className={styles.menuItem}
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuSubjectId(null);
                                handleOpenEdit(subject);
                              }}
                            >
                              <Pencil size={13} />
                              <span>Edit subject</span>
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              className={`${styles.menuItem} ${styles.menuItemDanger}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuSubjectId(null);
                                handleOpenDelete(subject);
                              }}
                            >
                              <Trash2 size={13} />
                              <span>Delete subject</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Reusable Subject Modal (Create & Edit) ─────────────── */}
      <SubjectModal
        isOpen={isSubjectModalOpen}
        mode={subjectModalMode}
        subject={selectedSubject}
        onClose={() => {
          setIsSubjectModalOpen(false);
          setSelectedSubject(null);
        }}
        onSuccess={handleSuccessSubjectModal}
      />

      {/* ─── Destructive Delete Confirmation Modal ─────────────── */}
      <DeleteSubjectModal
        isOpen={isDeleteModalOpen}
        subject={deleteTarget}
        activeQuestsCount={deleteDependencies.activeQuestsCount}
        hasActiveSession={deleteDependencies.hasActiveSession}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setDeleteTarget(null);
        }}
        onConfirm={handleConfirmDelete}
      />

      {/* ─── Undo Toast Notification (Requirement 16) ─────────── */}
      {undoSubject && (
        <div className={styles.undoToast} role="status" aria-live="polite">
          <span>Subject &ldquo;{undoSubject.name}&rdquo; deleted</span>
          <button
            type="button"
            className={styles.btnUndo}
            onClick={handleUndoDelete}
          >
            Undo
          </button>
          <button
            type="button"
            className={styles.undoClose}
            onClick={() => setUndoSubject(null)}
            aria-label="Dismiss notification"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

export default TimerScreen;
