"use client";

import type { CSSProperties } from "react";
import {
  ArrowUpRight,
  BookOpen,
  Check,
  Clock,
  Home,
  LayoutGrid,
  Sparkles,
  Target,
} from "lucide-react";
import { getBackgroundTokens, getAccentTokens } from "@/lib/color-utils";
import { useAuth } from "@/app/components/AuthProvider";
import styles from "./AppearanceSettingsScreen.module.css";

export function MiniDashboardPreview({
  mode,
  accentHex,
  canvasHex,
}: {
  mode: "light" | "dark";
  accentHex: string;
  canvasHex: string;
}) {
  const { user } = useAuth();
  const background = getBackgroundTokens(canvasHex, mode);
  const accent = getAccentTokens(accentHex, background["--surface-1"]);
  return (
    <div
      className={styles.workspacePreview}
      style={
        { ...background, ...accent, background: canvasHex } as CSSProperties
      }
      aria-label="Preview of your Sylf workspace"
    >
      <div className={styles.previewChrome}>
        <span>
          <i />
          sylf
        </span>
        <span>{mode === "light" ? "Light" : "Dark"}</span>
      </div>
      <div className={styles.previewApp}>
        <aside aria-hidden="true">
          <span>
            <Home size={16} />
          </span>
          <Target size={16} />
          <BookOpen size={16} />
          <LayoutGrid size={16} />
        </aside>
        <div className={styles.previewContent}>
          <div className={styles.previewAppHeading}>
            <span>Dashboard</span>
            <span className={styles.previewAvatar}>
              {(user?.name || user?.username || "S").slice(0, 1).toUpperCase()}
            </span>
          </div>
          <div className={styles.previewFocus}>
            <div>
              <span>
                <Sparkles size={13} />A little space to focus
              </span>
              <h3>
                Make time
                <br />
                for what matters.
              </h3>
              <span className={styles.previewAction}>
                Start studying
                <ArrowUpRight size={13} />
              </span>
            </div>
            <div className={styles.previewOrbit} aria-hidden="true">
              <Clock size={36} strokeWidth={1} />
            </div>
          </div>
          <div className={styles.previewTiles}>
            <div>
              <span>
                <Target size={15} />
                Objectives
              </span>
              <div className={styles.skeletonLine} />
              <div className={styles.skeletonShort} />
              <div className={styles.previewTask}>
                <i>
                  <Check size={10} />
                </i>
                <span />
              </div>
            </div>
            <div>
              <span>
                <BookOpen size={15} />
                Your subjects
              </span>
              <div className={styles.previewBooks} aria-hidden="true">
                <i />
                <i />
                <i />
              </div>
            </div>
          </div>
          <div className={styles.previewBottom}>
            <span>Ready when you are</span>
            <span>
              <i />
              Your study space
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
