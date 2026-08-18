"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";

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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="absolute inset-0 bg-black/70 backdrop-blur-md"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 8 }}
            transition={{ type: "spring", damping: 28, stiffness: 380 }}
            className={`system-card relative w-full max-w-sm p-6 z-10 flex flex-col ${
              danger
                ? "border-red-900/50 shadow-[0_0_30px_rgba(239,68,68,0.25)]"
                : "shadow-2xl"
            }`}
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-text-muted hover:text-text-primary transition-colors"
            >
              ✕
            </button>

            <h2
              className={`text-xl font-bold mb-4 font-rajdhani uppercase tracking-wide ${
                danger ? "text-accent-red" : "text-accent-light"
              }`}
            >
              {title}
            </h2>

            <div className="text-muted text-sm mb-6 leading-relaxed">{message}</div>

            <div className="flex justify-end gap-3">
              <button
                onClick={onClose}
                className="btn-secondary"
                style={{ padding: "8px 16px", fontSize: "0.85rem" }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onConfirm();
                  onClose();
                }}
                className={danger ? "btn-danger" : "btn-primary"}
                style={{ padding: "8px 16px", fontSize: "0.85rem" }}
              >
                {confirmText}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
