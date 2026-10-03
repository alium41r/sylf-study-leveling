"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import styles from "../styles/DashboardDesign.module.css";

interface DesignLabBarProps {
  // Optional props retained for backward compatibility
  mode?: string;
  onModeChange?: (mode: any) => void;
}

/**
 * Extremely neutral developer utility strip.
 * Features a refined Hybrid Scholar Identity status indicator.
 */
export function DesignLabBar({ mode, onModeChange }: DesignLabBarProps = {}) {
  return (
    <aside className={styles.devLabBar} aria-label="Design sandbox utility toolbar">
      <div className={styles.devLabBadge}>
        <span className={styles.devLabDot} />
        <span>Dashboard Design Lab</span>
      </div>

      <div className={styles.devLabStatusTag}>
        <span>Hybrid Scholar Identity</span>
      </div>

      <Link href="/dashboard" className={styles.devLabLink}>
        <ArrowLeft size={12} />
        <span className={styles.returnFull}>Return to /dashboard</span>
        <span className={styles.returnShort}>Return</span>
      </Link>
    </aside>
  );
}

export default DesignLabBar;
