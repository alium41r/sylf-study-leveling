"use client";

import { memo } from "react";
import { Compass } from "lucide-react";
import type { FocusTimerLayoutProps } from "./FocusTimerLayoutProps";
import styles from "./FocusSessionBar.module.css";

type FocusSessionBarProps = Pick<
  FocusTimerLayoutProps,
  | "phaseLabel"
  | "modeDisplayName"
  | "subjectName"
  | "questData"
  | "isPaused"
  | "background"
  | "onOpenBackgroundPicker"
>;

export const FocusSessionBar = memo(function FocusSessionBar({
  phaseLabel,
  modeDisplayName,
  subjectName,
  questData,
  isPaused,
  background,
  onOpenBackgroundPicker,
}: FocusSessionBarProps) {
  const title = questData?.title || subjectName;
  const environment = background?.name || "Classic Sylf";
  const status = isPaused ? "Paused" : phaseLabel;

  return (
    <div
      className={styles.bar}
      role="group"
      aria-label="Focus session"
      data-testid="focus-session-bar"
    >
      <span
        className={styles.status}
        title={isPaused ? `${phaseLabel} · Paused` : phaseLabel}
      >
        <span
          className={styles.dot}
          aria-hidden="true"
          data-paused={isPaused}
        />
        <span className={styles.statusLabel}>{status}</span>
      </span>
      {modeDisplayName.toUpperCase() !== phaseLabel.toUpperCase() && (
        <span className={styles.mode} title={modeDisplayName}>
          {modeDisplayName}
        </span>
      )}
      {title && (
        <span
          className={styles.subject}
          title={questData && subjectName ? `${title} · ${subjectName}` : title}
        >
          {title}
        </span>
      )}
      <button
        type="button"
        className={styles.environment}
        onClick={onOpenBackgroundPicker}
        disabled={!onOpenBackgroundPicker}
        aria-label={`Change Focus Environment: ${environment}`}
        aria-haspopup="dialog"
        title={`Change Focus Environment: ${environment} (Alt+B)`}
      >
        <Compass size={14} aria-hidden="true" />
        <span className={styles.environmentName}>{environment}</span>
      </button>
    </div>
  );
});
