"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { modalDialogVariants } from "@/lib/motion";
import styles from "@/app/settings/components/SystemHubPage.module.css";
import { X, AlertTriangle } from "lucide-react";

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: React.ReactNode;
  confirmText?: string;
  danger?: boolean;
}

export function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Confirm",
  danger = false,
}: ConfirmationModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="confirmation-modal-container"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.15 } }}
          className={styles.configModalBackdrop}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            variants={modalDialogVariants}
            initial="closed"
            animate="open"
            exit="closed"
            className={`${styles.configModalCard} ${
              danger ? styles.configModalCardDanger : ""
            } relative z-10 flex flex-col`}
          >
            <button
              onClick={onClose}
              className="absolute top-5 right-5 text-[var(--quiet)] hover:text-[var(--ink)] transition-colors p-1 rounded-lg hover:bg-[var(--sub-surface)] cursor-pointer"
              aria-label="Close dialog"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-3">
              {danger && (
                <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-4 h-4" />
                </div>
              )}
              <h2
                className={`text-xl font-extrabold font-['Rajdhani'] uppercase tracking-wider ${
                  danger ? "text-red-500" : "text-[var(--ink)]"
                }`}
              >
                {title}
              </h2>
            </div>

            <div className="text-[var(--muted)] text-sm mb-6 leading-relaxed">
              {message}
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-[var(--subtle-line)]">
              <button
                type="button"
                onClick={onClose}
                className={styles.btnSecondary}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onConfirm();
                  onClose();
                }}
                className={danger ? styles.btnDanger : styles.btnPrimary}
              >
                {confirmText}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

