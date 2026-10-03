"use client";

import React from "react";

import styles from "@/app/settings/components/SystemHubPage.module.css";

interface SettingsRowGroupProps {
  children: React.ReactNode;
  danger?: boolean;
}

export function SettingsRowGroup({ children, danger = false }: SettingsRowGroupProps) {
  return (
    <div className={danger ? styles.configDangerRowGroup : styles.configRowGroup}>
      {children}
    </div>
  );
}

