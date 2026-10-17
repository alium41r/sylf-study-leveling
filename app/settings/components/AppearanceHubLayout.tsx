"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { CalendarDays, Image, Palette } from "lucide-react";
import BackToSettings from "@/app/components/BackToSettings";
import hub from "./MainHub.module.css";
import styles from "./AppearanceHub.module.css";

const destinations = [
  { name: "Appearance", href: "/settings/appearance", icon: Palette },
  { name: "Calendar", href: "/settings/calendar", icon: CalendarDays },
  { name: "Backdrops", href: "/settings/focus-backgrounds", icon: Image },
] as const;

export function AppearanceHubLayout({
  title,
  children,
}: {
  title: "Appearance" | "Backdrops";
  children: ReactNode;
}) {
  return (
    <div className={`${hub.page} ${styles.page}`}>
      <div className={hub.workspace}>
        <div className={hub.back}>
          <BackToSettings />
        </div>
        <header className={hub.header}>
          <h1>{title}</h1>
          <nav className={hub.navigation} aria-label="System Hub Appearance">
            {destinations.map(({ name, href, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                aria-current={name === title ? "page" : undefined}
              >
                <Icon size={15} aria-hidden="true" />
                <span>{name}</span>
              </Link>
            ))}
          </nav>
        </header>
        {children}
      </div>
    </div>
  );
}
