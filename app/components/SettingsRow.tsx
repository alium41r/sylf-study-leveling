"use client";

import React from "react";

import styles from "@/app/settings/components/SystemHubPage.module.css";

interface SettingsRowProps {
  label: React.ReactNode;
  description: React.ReactNode;
  icon?: React.ReactNode;
  children?: React.ReactNode;
  danger?: boolean;
}

export function SettingsRow({ label, description, icon, children, danger = false }: SettingsRowProps) {
  return (
    <div className={danger ? styles.configDangerRow : styles.configRow}>
      <div className="flex items-center gap-3.5 flex-1 min-w-0 pr-2">
        {icon && (
          <div className="shrink-0 text-[var(--muted)]">
            {icon}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h4
            className={`font-['Rajdhani'] font-bold text-sm tracking-wide flex items-center gap-2 ${
              danger ? "text-red-500" : "text-[var(--ink)]"
            }`}
          >
            {label}
          </h4>
          <div className="text-xs text-[var(--muted)] mt-0.5 leading-relaxed">
            {description}
          </div>
        </div>
      </div>
      <div className="shrink-0 flex items-center justify-start sm:justify-end gap-2">
        {children}
      </div>
    </div>
  );
}

