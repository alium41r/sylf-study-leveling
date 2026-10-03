"use client";

import React, { useState } from "react";
import Companion from "@/app/components/landing/companion/Companion";
import {
  EXAM_BOARDS,
  ACADEMIC_LEVELS,
  ACCENT_COLORS,
  DEFAULT_EXAM_BOARD,
  DEFAULT_ACADEMIC_LEVEL,
  DEFAULT_SUBJECT_COLOR,
} from "@/lib/study-systems";
import { Plus, X, Check, ChevronDown, ChevronUp, BookOpen, ArrowRight, ArrowLeft } from "lucide-react";
import styles from "../Onboarding.module.css";

export interface ConfiguredSubject {
  id: string;
  name: string;
  code?: string;
  examBoard?: string;
  level?: string;
  color?: string;
  syllabusNote?: string;
}

interface SubjectsStepProps {
  subjects: ConfiguredSubject[];
  onUpdateSubjects: (subjects: ConfiguredSubject[]) => void;
  onNext: () => void;
  onPrev: () => void;
}

const QUICK_ADD_PRESETS = [
  { name: "Mathematics", defaultCode: "MATH", color: "#3b82f6" },
  { name: "Physics", defaultCode: "PHYS", color: "#8b5cf6" },
  { name: "Chemistry", defaultCode: "CHEM", color: "#06b6d4" },
  { name: "Biology", defaultCode: "BIO", color: "#10b981" },
  { name: "Computer Science", defaultCode: "CS", color: "#6366f1" },
  { name: "Economics", defaultCode: "ECON", color: "#f59e0b" },
  { name: "English / Literature", defaultCode: "ENG", color: "#ec4899" },
];

export function SubjectsStep({
  subjects,
  onUpdateSubjects,
  onNext,
  onPrev,
}: SubjectsStepProps) {
  const [customName, setCustomName] = useState("");
  const [customCode, setCustomCode] = useState("");
  const [customExamBoard, setCustomExamBoard] = useState(DEFAULT_EXAM_BOARD);
  const [customLevel, setCustomLevel] = useState(DEFAULT_ACADEMIC_LEVEL);
  const [customColor, setCustomColor] = useState(DEFAULT_SUBJECT_COLOR);
  const [customSyllabusNote, setCustomSyllabusNote] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [formError, setFormError] = useState("");

  const handleToggleQuickAdd = (preset: (typeof QUICK_ADD_PRESETS)[0]) => {
    const existingIndex = subjects.findIndex(
      (s) => s.name.toLowerCase() === preset.name.toLowerCase()
    );

    if (existingIndex >= 0) {
      // Remove if already added
      onUpdateSubjects(subjects.filter((_, idx) => idx !== existingIndex));
    } else {
      // Add preset
      onUpdateSubjects([
        ...subjects,
        {
          id: `preset-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          name: preset.name,
          code: preset.defaultCode,
          examBoard: DEFAULT_EXAM_BOARD,
          level: DEFAULT_ACADEMIC_LEVEL,
          color: preset.color,
        },
      ]);
    }
  };

  const handleAddCustom = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    const cleanName = customName.trim();
    if (!cleanName) {
      setFormError("Please enter a subject name.");
      return;
    }

    const cleanCode = customCode.trim().toUpperCase();

    // Check for duplicate names
    if (subjects.some((s) => s.name.toLowerCase() === cleanName.toLowerCase())) {
      setFormError(`"${cleanName}" is already in your curriculum.`);
      return;
    }

    onUpdateSubjects([
      ...subjects,
      {
        id: `custom-${Date.now()}`,
        name: cleanName,
        code: cleanCode || undefined,
        examBoard: customExamBoard.trim() || DEFAULT_EXAM_BOARD,
        level: customLevel.trim() || DEFAULT_ACADEMIC_LEVEL,
        color: customColor || DEFAULT_SUBJECT_COLOR,
        syllabusNote: customSyllabusNote.trim() || undefined,
      },
    ]);

    // Reset inputs
    setCustomName("");
    setCustomCode("");
    setCustomSyllabusNote("");
    setShowAdvanced(false);
    setFormError("");
  };

  const handleRemoveSubject = (id: string) => {
    onUpdateSubjects(subjects.filter((s) => s.id !== id));
  };

  const canProceed = subjects.length > 0;

  return (
    <div className={styles.stepCard}>
      {/* ─── Companion Header ─── */}
      <div className={styles.stepHeader}>
        <div className="flex items-center justify-center my-1">
          <Companion state="READING" size={110} />
        </div>
        <span className={styles.stepEyebrow}>Curriculum Setup</span>
        <h1 className={styles.stepTitle}>What are you studying?</h1>
        <p className={styles.stepSubtitle}>
          Add your current coursework. Sylf will turn your subjects into structured study plans and daily quests.
        </p>
      </div>

      {/* ─── Quick-Add Suggestions ─── */}
      <div className={styles.quickAddSection}>
        <label className={styles.quickAddLabel}>Quick-Add Popular Subjects</label>
        <div className={styles.quickAddGrid} role="group" aria-label="Suggested subjects">
          {QUICK_ADD_PRESETS.map((preset) => {
            const isAdded = subjects.some(
              (s) => s.name.toLowerCase() === preset.name.toLowerCase()
            );

            return (
              <button
                key={preset.name}
                type="button"
                onClick={() => handleToggleQuickAdd(preset)}
                aria-pressed={isAdded}
                className={`${styles.quickAddChip} ${isAdded ? styles.quickAddChipAdded : ""}`}
              >
                {isAdded ? <Check className="w-3.5 h-3.5" aria-hidden="true" /> : <Plus className="w-3.5 h-3.5" aria-hidden="true" />}
                <span>{preset.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Custom Subject Input Form ─── */}
      <form onSubmit={handleAddCustom} className="p-4 rounded-2xl bg-[var(--elevated)] border border-[var(--subtle-line)] flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label htmlFor="custom-subject-name" className={styles.label}>
              <span>Subject Name *</span>
            </label>
            <input
              id="custom-subject-name"
              type="text"
              placeholder="e.g. Linear Algebra, World History"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              className={styles.input}
            />
          </div>

          <div className="w-full sm:w-48">
            <label htmlFor="custom-subject-code" className={styles.label}>
              <span>Code</span>
              <span className={styles.labelOptional}>Optional</span>
            </label>
            <input
              id="custom-subject-code"
              type="text"
              placeholder="e.g. 9709, CS-201"
              value={customCode}
              onChange={(e) => setCustomCode(e.target.value)}
              className={styles.input}
            />
          </div>
        </div>

        {/* Toggle Advanced Specifications */}
        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-xs font-['Rajdhani'] font-bold uppercase tracking-wider text-muted hover:text-ink transition-colors flex items-center gap-1 cursor-pointer py-1"
          >
            <span>{showAdvanced ? "Hide Advanced Options" : "+ More details (Exam board, level, book details, color)"}</span>
            {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {showAdvanced && (
          <div className="pt-2 border-t border-[var(--subtle-line)] flex flex-col gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className={styles.formGroup}>
                <label htmlFor="custom-exam-board" className={styles.label}>
                  <span>Exam Board / System</span>
                </label>
                <select
                  id="custom-exam-board"
                  value={customExamBoard}
                  onChange={(e) => setCustomExamBoard(e.target.value)}
                  className={styles.select}
                >
                  {EXAM_BOARDS.map((b) => (
                    <option key={b.value} value={b.value}>{b.label}</option>
                  ))}
                </select>
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="custom-academic-level" className={styles.label}>
                  <span>Academic Level</span>
                </label>
                <select
                  id="custom-academic-level"
                  value={customLevel}
                  onChange={(e) => setCustomLevel(e.target.value)}
                  className={styles.select}
                >
                  {ACADEMIC_LEVELS.map((l) => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="custom-syllabus-note" className={styles.label}>
                <span>Textbook or Syllabus Details</span>
                <span className={styles.labelOptional}>Optional</span>
              </label>
              <textarea
                id="custom-syllabus-note"
                rows={2}
                placeholder="e.g. Cambridge AS & A Level Mathematics — Pure Mathematics 1 (Hodder Education)"
                value={customSyllabusNote}
                onChange={(e) => setCustomSyllabusNote(e.target.value)}
                className={styles.textarea}
              />
            </div>

            {/* Accent Color Selection */}
            <div className={styles.formGroup}>
              <label className={styles.label}>
                <span>Subject Color Badge</span>
              </label>
              <div className="flex items-center gap-2" role="radiogroup" aria-label="Subject badge color">
                {ACCENT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={customColor === c}
                    aria-label={`Color ${c}`}
                    onClick={() => setCustomColor(c)}
                    className="w-7 h-7 rounded-full border-2 transition-transform cursor-pointer"
                    style={{
                      backgroundColor: c,
                      borderColor: customColor === c ? "#ffffff" : "transparent",
                      transform: customColor === c ? "scale(1.2)" : "scale(1)",
                      boxShadow: customColor === c ? "0 0 8px rgba(255,255,255,0.4)" : "none",
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-between items-center pt-1">
          {formError && (
            <p role="alert" className="text-xs text-red-400 font-semibold m-0">
              {formError}
            </p>
          )}
          <div className="ml-auto">
            <button
              type="submit"
              className={styles.btnSecondary}
              style={{ minHeight: "38px", height: "38px", padding: "0 1rem" }}
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Add to Curriculum</span>
            </button>
          </div>
        </div>
      </form>

      {/* ─── Active Subjects List ─── */}
      <div className="flex flex-col gap-2">
        <label className={styles.label}>
          <span>Your Curriculum ({subjects.length} Subject{subjects.length === 1 ? "" : "s"})</span>
        </label>

        {subjects.length === 0 ? (
          <div className="p-6 border border-dashed border-[var(--subtle-line)] rounded-xl text-center flex flex-col items-center justify-center gap-2">
            <BookOpen className="w-6 h-6 text-quiet opacity-60" aria-hidden="true" />
            <p className="text-sm font-semibold text-muted m-0">
              No subjects added yet.
            </p>
            <p className="text-xs text-quiet m-0">
              Select a quick-add chip above or enter your subject name.
            </p>
          </div>
        ) : (
          <div className={styles.subjectsList} role="list">
            {subjects.map((sub) => (
              <div key={sub.id} role="listitem" className={styles.subjectCard}>
                <div
                  className={styles.subjectColorIndicator}
                  style={{ backgroundColor: sub.color || DEFAULT_SUBJECT_COLOR }}
                  aria-hidden="true"
                />

                <div className={styles.subjectCardInfo}>
                  <div className={styles.subjectCardTitleRow}>
                    <h3 className={styles.subjectName}>{sub.name}</h3>
                    {sub.code && (
                      <span
                        className={styles.subjectCodeBadge}
                        style={{
                          backgroundColor: `${sub.color || DEFAULT_SUBJECT_COLOR}20`,
                          color: sub.color || DEFAULT_SUBJECT_COLOR,
                          border: `1px solid ${sub.color || DEFAULT_SUBJECT_COLOR}40`,
                        }}
                      >
                        {sub.code}
                      </span>
                    )}
                  </div>
                  <p className={styles.subjectMeta}>
                    {sub.examBoard || DEFAULT_EXAM_BOARD} • {sub.level || DEFAULT_ACADEMIC_LEVEL}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => handleRemoveSubject(sub.id)}
                  aria-label={`Remove subject ${sub.name}`}
                  className={styles.subjectRemoveBtn}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Actions Bar ─── */}
      <div className={styles.actionsBar}>
        <button type="button" onClick={onPrev} className={styles.btnSecondary}>
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span>Back</span>
        </button>

        <button
          type="button"
          onClick={onNext}
          disabled={!canProceed}
          className={styles.btnPrimary}
        >
          <span>Continue to Appearance</span>
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
