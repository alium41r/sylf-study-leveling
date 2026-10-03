"use client";

import { useRef, type ReactNode } from "react";
import { BookOpen, Compass } from "lucide-react";
import BackToSettings from "@/app/components/BackToSettings";
import { useSystemAppearance } from "./useSystemAppearance";
import styles from "./SystemLibrary.module.css";

export type SystemVolume = "Collection" | "Achievements" | "Archive";

export function SystemLibrary({
  volume,
  children,
}: {
  volume: SystemVolume;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useSystemAppearance(ref);
  return (
    <div className={styles.page} ref={ref}>
      <div className={styles.ambient} aria-hidden="true" />
      <div className={styles.workspace}>
        <div className={styles.back}>
          <BackToSettings />
        </div>
        <header className={styles.masthead}>
          <div className={styles.brand}>
            <span className={styles.seal} aria-hidden="true">
              <Compass size={29} />
            </span>
            <div>
              <p className={styles.eyebrow}>System Hub / The Sylf Library</p>
              <h1>
                The System <em>{volume}</em>
              </h1>
            </div>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}

export function LibraryEmpty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.empty}>
      <BookOpen size={28} aria-hidden="true" />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
