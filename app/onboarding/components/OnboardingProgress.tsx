"use client";

import React from "react";
import styles from "../Onboarding.module.css";

export type StepKey = "WELCOME" | "SUBJECTS" | "APPEARANCE" | "COMPLETION";

interface OnboardingProgressProps {
  currentStep: StepKey;
}

const STEPS: { key: StepKey; label: string }[] = [
  { key: "WELCOME", label: "Welcome" },
  { key: "SUBJECTS", label: "Subjects" },
  { key: "APPEARANCE", label: "Appearance" },
];

export function OnboardingProgress({ currentStep }: OnboardingProgressProps) {
  const currentIndex = STEPS.findIndex((s) => s.key === currentStep);
  const activeIdx = currentIndex >= 0 ? currentIndex : STEPS.length - 1;

  return (
    <nav aria-label="Onboarding Progress" className={styles.progressNav}>
      <ol className="flex items-center gap-2 m-0 p-0 list-none">
        {STEPS.map((step, idx) => {
          const isCompleted = idx < activeIdx;
          const isActive = idx === activeIdx;

          return (
            <React.Fragment key={step.key}>
              {idx > 0 && <span className={styles.progressDivider} aria-hidden="true" />}
              <li
                className={`${styles.progressItem} ${
                  isActive ? styles.progressItemActive : isCompleted ? styles.progressItemCompleted : ""
                }`}
                aria-current={isActive ? "step" : undefined}
              >
                <span
                  className={`${styles.progressDot} ${
                    isActive ? styles.progressDotActive : isCompleted ? styles.progressDotCompleted : ""
                  }`}
                  aria-hidden="true"
                />
                <span>{step.label}</span>
              </li>
            </React.Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
