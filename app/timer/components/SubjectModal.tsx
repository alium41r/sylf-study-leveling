/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { backdropVariants, modalDialogVariants } from "@/lib/motion";
import { lockPageScroll } from "@/lib/scroll-lock";
import { X, AlertCircle } from "lucide-react";
import { SubjectGrimoireIcon } from "@/app/components/icons";
import {
  EXAM_BOARDS,
  ACADEMIC_LEVELS,
  ACCENT_COLORS,
  DEFAULT_EXAM_BOARD,
  DEFAULT_ACADEMIC_LEVEL,
  DEFAULT_SUBJECT_COLOR,
} from "@/lib/study-systems";
import styles from "../Timer.module.css";

export interface SubjectItem {
  id: number;
  name: string;
  code: string;
  examBoard?: string;
  level?: string;
  color?: string;
  syllabusNote?: string | null;
  nodesCount?: number;
  todaySeconds: number;
}

interface SubjectModalProps {
  isOpen: boolean;
  mode: "create" | "edit";
  subject?: SubjectItem | null;
  onClose: () => void;
  onSuccess: (savedSubject: SubjectItem) => void;
}

export function SubjectModal({
  isOpen,
  mode,
  subject,
  onClose,
  onSuccess,
}: SubjectModalProps) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [examBoard, setExamBoard] = useState(DEFAULT_EXAM_BOARD);
  const [level, setLevel] = useState(DEFAULT_ACADEMIC_LEVEL);
  const [syllabusNote, setSyllabusNote] = useState("");
  const [color, setColor] = useState(DEFAULT_SUBJECT_COLOR);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync state when subject or mode changes
  useEffect(() => {
    if (!isOpen) {
      setErrorMessage(null);
      return;
    }

    if (mode === "edit" && subject) {
      setName(subject.name || "");
      setCode(subject.code || "");
      setExamBoard(subject.examBoard || DEFAULT_EXAM_BOARD);
      setLevel(subject.level || DEFAULT_ACADEMIC_LEVEL);
      setSyllabusNote(subject.syllabusNote || "");
      setColor(subject.color || DEFAULT_SUBJECT_COLOR);
    } else {
      setName("");
      setCode("");
      setExamBoard(DEFAULT_EXAM_BOARD);
      setLevel(DEFAULT_ACADEMIC_LEVEL);
      setSyllabusNote("");
      setColor(DEFAULT_SUBJECT_COLOR);
    }
    setErrorMessage(null);
  }, [isOpen, mode, subject]);

  // Lock scroll
  useEffect(() => {
    if (!isOpen) return;
    return lockPageScroll();
  }, [isOpen]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    const cleanCode = code.trim().toUpperCase();

    if (!cleanName || !cleanCode) {
      setErrorMessage("Subject name and syllabus code are required.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      if (mode === "create") {
        const res = await fetch("/api/subjects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: cleanName,
            code: cleanCode,
            examBoard: examBoard.trim() || DEFAULT_EXAM_BOARD,
            level: level.trim() || DEFAULT_ACADEMIC_LEVEL,
            color: color || DEFAULT_SUBJECT_COLOR,
            syllabusNote: syllabusNote.trim() || undefined,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.message || data.error || "Failed to create subject");
        }

        onSuccess(data);
        onClose();
      } else if (mode === "edit" && subject) {
        const res = await fetch(`/api/subjects/${subject.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: cleanName,
            code: cleanCode,
            examBoard: examBoard.trim() || DEFAULT_EXAM_BOARD,
            level: level.trim() || DEFAULT_ACADEMIC_LEVEL,
            color: color || DEFAULT_SUBJECT_COLOR,
            syllabusNote: syllabusNote.trim() || null,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.message || data.error || "Failed to update subject");
        }

        onSuccess({
          ...subject,
          ...data,
          todaySeconds: subject.todaySeconds,
        });
        onClose();
      }
    } catch (err: any) {
      console.error(`Error saving subject (${mode}):`, err);
      setErrorMessage(err.message || "An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div
          className={`${styles.modalOverlay} ${styles.timerContainer}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="subject-modal-title"
        >
          {/* Liquid Glass Backdrop Blur */}
          <motion.div
            className={styles.modalBackdrop}
            variants={backdropVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={onClose}
          />

          {/* Floating Liquid Glass Container */}
          <motion.div
            className={styles.floatingLiquidModal}
            variants={modalDialogVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            {/* Specular Top Rim Highlight & Ambient Refraction */}
            <div className={styles.specularTopRim} aria-hidden="true" />
            <div className={styles.ambientGlassOrb} aria-hidden="true" />

            {/* Modal Header */}
            <div className={styles.modalHeader}>
              <div className={styles.modalTitleGroup}>
                <div className={styles.modalIconBadge}>
                  <SubjectGrimoireIcon size={18} />
                </div>
                <div>
                  <h2 id="subject-modal-title" className={styles.modalTitle}>
                    {mode === "create" ? "Add Subject" : "Edit Subject"}
                  </h2>
                  <p className={styles.modalSubtitle}>
                    {mode === "create"
                      ? "Create a curriculum track for your focus sessions"
                      : `Update curriculum details and metadata for ${subject?.name || "subject"}`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className={styles.modalCloseBtn}
                aria-label="Close dialog"
              >
                <X size={18} />
              </button>
            </div>

            {/* Error Notification */}
            {errorMessage && (
              <div className={styles.blockedAlert} style={{ margin: "0.5rem 1.75rem 0" }} role="alert">
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: "2px" }} />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className={styles.modalForm}>
              <div className={styles.formGrid}>
                <div className={styles.fieldGroup}>
                  <label htmlFor="subject-name-input" className={styles.fieldLabel}>
                    Subject Name *
                  </label>
                  <input
                    id="subject-name-input"
                    type="text"
                    autoFocus
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={styles.textInput}
                    placeholder="e.g. Pure Mathematics"
                  />
                </div>
                <div className={styles.fieldGroup}>
                  <label htmlFor="syllabus-code-input" className={styles.fieldLabel}>
                    Syllabus Code *
                  </label>
                  <input
                    id="syllabus-code-input"
                    type="text"
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    className={styles.textInput}
                    placeholder="e.g. 9709"
                  />
                </div>
              </div>

              <div className={styles.formGrid}>
                <div className={styles.fieldGroup}>
                  <label htmlFor="exam-board-select" className={styles.fieldLabel}>
                    Exam Board
                  </label>
                  <select
                    id="exam-board-select"
                    value={examBoard}
                    onChange={(e) => setExamBoard(e.target.value)}
                    className={styles.selectInput}
                  >
                    {EXAM_BOARDS.map((b) => (
                      <option key={b.value} value={b.value}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={styles.fieldGroup}>
                  <label htmlFor="academic-level-select" className={styles.fieldLabel}>
                    Academic Level
                  </label>
                  <select
                    id="academic-level-select"
                    value={level}
                    onChange={(e) => setLevel(e.target.value)}
                    className={styles.selectInput}
                  >
                    {ACADEMIC_LEVELS.map((l) => (
                      <option key={l.value} value={l.value}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className={styles.fieldGroup}>
                <label htmlFor="syllabus-note-input" className={styles.fieldLabel}>
                  Book / Syllabus / Class Details{" "}
                  <span className={styles.fieldLabelOptional}>(optional)</span>
                </label>
                <textarea
                  id="syllabus-note-input"
                  rows={2}
                  value={syllabusNote}
                  onChange={(e) => setSyllabusNote(e.target.value)}
                  className={styles.textareaInput}
                  placeholder="e.g. Cambridge Pure Maths 1 & Mechanics course"
                />
                <p className={styles.helperText}>
                  Include textbook or syllabus details to help AI track your curriculum.
                </p>
              </div>

              <div className={styles.colorPickerRow}>
                <span className={styles.colorLabel}>Accent Color:</span>
                <div className={styles.swatchGroup}>
                  {ACCENT_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      aria-label={`Select color ${c}`}
                      className={`${styles.colorSwatch} ${color === c ? styles.colorSwatchActive : ""}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className={styles.formActions}>
                <button
                  type="button"
                  onClick={onClose}
                  className={styles.btnCancel}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={styles.btnSubmit}
                >
                  {isSubmitting
                    ? mode === "create"
                      ? "Adding..."
                      : "Saving..."
                    : mode === "create"
                    ? "Add Subject"
                    : "Save Changes"}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
