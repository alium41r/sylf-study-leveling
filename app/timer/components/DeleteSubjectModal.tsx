/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { backdropVariants, modalDialogVariants } from "@/lib/motion";
import { lockPageScroll } from "@/lib/scroll-lock";
import { AlertTriangle, Check, X, AlertCircle, Loader2 } from "lucide-react";
import type { SubjectItem } from "./SubjectModal";
import styles from "../Timer.module.css";

interface DeleteSubjectModalProps {
  isOpen: boolean;
  subject: SubjectItem | null;
  activeQuestsCount?: number;
  hasActiveSession?: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function DeleteSubjectModal({
  isOpen,
  subject,
  activeQuestsCount = 0,
  hasActiveSession = false,
  onClose,
  onConfirm,
}: DeleteSubjectModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Lock scroll
  useEffect(() => {
    if (!isOpen) return;
    return lockPageScroll();
  }, [isOpen]);

  // Reset errors on open
  useEffect(() => {
    if (!isOpen) {
      setErrorMessage(null);
      setIsDeleting(false);
      return;
    }
    setErrorMessage(null);
    setIsDeleting(false);
  }, [isOpen]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isDeleting) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isDeleting, onClose]);

  const handleDelete = async () => {
    if (!subject || hasActiveSession) return;
    setIsDeleting(true);
    setErrorMessage(null);

    try {
      await onConfirm();
      onClose();
    } catch (err: any) {
      console.error("Failed to delete subject:", err);
      setErrorMessage(
        err.message || "Failed to delete subject. Please try again."
      );
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isOpen || !subject || typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div
          className={`${styles.modalOverlay} ${styles.timerContainer}`}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="delete-subject-modal-title"
          aria-describedby="delete-subject-modal-desc"
        >
          {/* Backdrop Blur */}
          <motion.div
            className={styles.modalBackdrop}
            variants={backdropVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={() => {
              if (!isDeleting) onClose();
            }}
          />

          {/* Floating Liquid Modal */}
          <motion.div
            className={styles.confirmModalCard}
            variants={modalDialogVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <div className={styles.specularTopRim} aria-hidden="true" />
            <div className={styles.ambientGlassOrb} aria-hidden="true" />

            {/* Header */}
            <div className={styles.modalHeader}>
              <div className={styles.modalTitleGroup}>
                <div className={styles.warningIconBadge}>
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h2 id="delete-subject-modal-title" className={styles.modalTitle}>
                    Delete {subject.name}?
                  </h2>
                  <p id="delete-subject-modal-desc" className={styles.modalSubtitle}>
                    This removes {subject.name} from your active subjects.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={isDeleting}
                className={styles.modalCloseBtn}
                aria-label="Close dialog"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content Body */}
            <div className={styles.confirmBody} style={{ padding: "1.25rem 1.75rem 1.75rem" }}>
              {/* REQUIREMENT 10: ACTIVE/RUNNING FOCUS SESSION BLOCKED NOTIFICATION */}
              {hasActiveSession && (
                <div className={styles.blockedAlert} role="alert">
                  <AlertCircle size={18} style={{ flexShrink: 0, marginTop: "2px" }} />
                  <div>
                    <strong>Action Blocked:</strong>
                    <p style={{ margin: "4px 0 0" }}>
                      {subject.name} is being used in your current Focus session.
                      End the session before deleting this subject.
                    </p>
                  </div>
                </div>
              )}

              {/* Server error if any */}
              {errorMessage && (
                <div className={styles.blockedAlert} role="alert">
                  <AlertCircle size={18} style={{ flexShrink: 0, marginTop: "2px" }} />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Active quests warning if applicable (Requirement 8 & 15) */}
              {activeQuestsCount > 0 && !hasActiveSession && (
                <div className={styles.activeWarning}>
                  <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                  <span>
                    <strong>{activeQuestsCount}</strong> active quest
                    {activeQuestsCount > 1 ? "s" : ""} still use
                    {activeQuestsCount === 1 ? "s" : ""} this subject.
                  </span>
                </div>
              )}

              {/* Kept progress summary card (Requirement 7 & 15) */}
              <div className={styles.keptSection}>
                <div className={styles.keptTitle}>Kept Safe & Preserved</div>
                <ul className={styles.keptList}>
                  <li className={styles.keptItem}>
                    <Check size={14} className={styles.keptCheck} />
                    <span>Focus sessions & study-time history ({Math.round((subject.todaySeconds || 0) / 60)} min today)</span>
                  </li>
                  <li className={styles.keptItem}>
                    <Check size={14} className={styles.keptCheck} />
                    <span>XP records, Hunter Rank progress, and skill points</span>
                  </li>
                  <li className={styles.keptItem}>
                    <Check size={14} className={styles.keptCheck} />
                    <span>Completed quests and historical planner records</span>
                  </li>
                </ul>
              </div>

              {/* Actions */}
              <div className={styles.formActions} style={{ marginTop: "0.5rem" }}>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isDeleting}
                  className={styles.btnCancel}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting || hasActiveSession}
                  className={styles.btnDelete}
                  aria-label={`Confirm deleting ${subject.name}`}
                >
                  {isDeleting ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    "Delete subject"
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
