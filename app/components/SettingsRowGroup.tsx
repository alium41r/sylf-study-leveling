"use client";

import React from "react";

interface SettingsRowGroupProps {
  children: React.ReactNode;
  danger?: boolean;
}

export function SettingsRowGroup({ children, danger = false }: SettingsRowGroupProps) {
  return (
    <div className={`rounded overflow-hidden ${
      danger 
        ? "bg-red-950/10 border border-red-900/30 shadow-[inset_0_0_20px_rgba(239,68,68,0.05)] divide-y divide-red-900/20" 
        : "bg-white/5 border border-white/10 divide-y divide-white/5"
    }`}>
      {children}
    </div>
  );
}
