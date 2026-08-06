"use client";

import React from "react";

interface SettingsRowProps {
  label: React.ReactNode;
  description: React.ReactNode;
  icon?: React.ReactNode;
  children?: React.ReactNode;
  danger?: boolean;
}

export function SettingsRow({ label, description, icon, children, danger = false }: SettingsRowProps) {
  return (
    <div className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 transition-colors ${
      danger ? "hover:bg-red-900/10" : "hover:bg-white/[0.04]"
    } gap-4`}>
      <div className="flex items-center gap-4 flex-1 min-w-0 pr-4">
        {icon && (
          <div className="shrink-0">
            {icon}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h4 className={`font-rajdhani font-bold flex items-center gap-2 ${danger ? "text-accent-red" : "text-primary"}`}>
            {label}
          </h4>
          <div className="text-xs text-muted mt-1">
            {description}
          </div>
        </div>
      </div>
      <div className="shrink-0 flex items-center justify-start sm:justify-end">
        {children}
      </div>
    </div>
  );
}
