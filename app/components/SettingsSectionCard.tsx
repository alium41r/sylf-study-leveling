"use client";

import React from "react";

import styles from "@/app/settings/components/SystemHubPage.module.css";

interface SettingsSectionCardProps {
  title: string;
  description: string;
  children?: React.ReactNode;
  danger?: boolean;
  id?: string;
  icon?: React.ReactNode;
}

export default function SettingsSectionCard({
  title,
  description,
  children,
  danger = false,
  id,
  icon,
}: SettingsSectionCardProps) {
  return (
    <section
      id={id}
      className={danger ? styles.configDangerCard : styles.configSectionCard}
    >
      <div className="mb-5 flex items-start gap-3.5">
        {icon && (
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border mt-0.5"
            style={{
              background: danger ? "rgba(239, 68, 68, 0.1)" : "var(--accent-dim)",
              borderColor: danger ? "rgba(239, 68, 68, 0.25)" : "var(--accent-mid)",
              color: danger ? "#ef4444" : "var(--accent)",
            }}
          >
            {icon}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h2
            className={`text-lg sm:text-xl font-extrabold font-['Rajdhani'] uppercase tracking-wider ${
              danger ? "text-red-500" : "text-[var(--ink)]"
            }`}
          >
            {title}
          </h2>
          <p className="text-xs sm:text-sm text-[var(--muted)] mt-1 leading-relaxed">
            {description}
          </p>
        </div>
      </div>

      <div className="pt-4 border-t border-[var(--subtle-line)] flex-grow">
        {children || (
          <div className="py-6 text-center text-[var(--muted)] italic text-sm bg-[var(--sub-surface)] border border-[var(--sub-border)] rounded-xl">
            Component placeholder
          </div>
        )}
      </div>
    </section>
  );
}

