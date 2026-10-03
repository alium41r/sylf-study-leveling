"use client";

import React from "react";
import Companion from "@/app/components/landing/companion/Companion";
import { Loader2, AlertCircle, ArrowRight, RotateCcw } from "lucide-react";
import styles from "../Onboarding.module.css";

interface CompletionStepProps {
  isSubmitting: boolean;
  error: string | null;
  onRetry: () => void;
  onBackToSettings: () => void;
}

export function CompletionStep({
  isSubmitting,
  error,
  onRetry,
  onBackToSettings,
}: CompletionStepProps) {
  if (error) {
    return (
      <div className={styles.stepCard} role="alert">
        <div className={styles.stepHeader}>
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 mb-2">
            <AlertCircle className="w-8 h-8" aria-hidden="true" />
          </div>
          <span className="text-red-400 font-['Rajdhani'] font-bold text-sm tracking-wider uppercase">
            Initialization Incomplete
          </span>
          <h1 className={styles.stepTitle}>Could Not Finalize System</h1>
          <p className={styles.stepSubtitle}>{error}</p>
        </div>

        <div className={styles.actionsBar} style={{ justifyContent: "center", gap: "1rem" }}>
          <button type="button" onClick={onBackToSettings} className={styles.btnSecondary}>
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
            <span>Review Settings</span>
          </button>
          <button type="button" onClick={onRetry} className={styles.btnPrimary}>
            <span>Retry Initialization</span>
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.stepCard}>
      <div className={styles.stepHeader}>
        <div className="flex items-center justify-center my-2">
          <Companion state={isSubmitting ? "PLANNING" : "TIMER_COMPLETE"} size={140} />
        </div>

        <span className={styles.stepEyebrow}>
          {isSubmitting ? "Finalizing Configuration" : "System Ready"}
        </span>

        <h1 className={styles.stepTitle}>
          {isSubmitting ? "Initializing Your Workspace" : "Welcome, Scholar"}
        </h1>

        <p className={styles.stepSubtitle}>
          {isSubmitting
            ? "Syncing your curriculum, quests, and study environment..."
            : "Your sanctuary is calibrated. Turning coursework into progression."}
        </p>
      </div>

      {isSubmitting ? (
        <div className="flex flex-col items-center justify-center py-6 gap-3">
          <Loader2 className="w-8 h-8 text-accent animate-spin" aria-hidden="true" />
          <span className="text-xs font-mono tracking-widest text-muted uppercase">
            APPLYING CONFIGURATION...
          </span>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-4">
          <a
            href="/dashboard"
            className={styles.btnPrimary}
            style={{ width: "fit-content" }}
          >
            <span>Enter Sanctuary</span>
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </a>
        </div>
      )}
    </div>
  );
}
