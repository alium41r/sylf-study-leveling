"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import BackToSettings from "@/app/components/BackToSettings";
import { ArrowUpRight, BarChart3, Compass, Trophy } from "lucide-react";
import styles from "./MainHub.module.css";

const destinations = [
  { name: "Stats", href: "/settings/stats", icon: BarChart3 },
  { name: "Rankings", href: "/settings/rankings", icon: Trophy },
  { name: "Modes", href: "/settings/modes", icon: Compass },
] as const;

export function MainHubLayout({
  title,
  action,
  children,
}: {
  title: "Stats" | "Rankings" | "Modes";
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={styles.page}>
      <div className={styles.workspace}>
        <div className={styles.back}>
          <BackToSettings />
        </div>
        <header className={styles.header}>
          <h1>{title}</h1>
          <nav className={styles.navigation} aria-label="System Hub Main">
            {destinations.map(({ name, href, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                aria-current={title === name ? "page" : undefined}
              >
                <Icon size={15} aria-hidden="true" />
                <span>{name}</span>
              </Link>
            ))}
          </nav>
          {action && <div className={styles.headerAction}>{action}</div>}
        </header>
        {children}
      </div>
    </div>
  );
}

export function HubLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={styles.textLink}>
      {children}
      <ArrowUpRight size={15} aria-hidden="true" />
    </Link>
  );
}

export function HubState({
  loading,
  title,
  children,
  onRetry,
}: {
  loading?: boolean;
  title: string;
  children?: ReactNode;
  onRetry?: () => void;
}) {
  return (
    <div className={styles.state} role={loading ? "status" : "alert"}>
      {loading && <span className={styles.loader} aria-hidden="true" />}
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {onRetry && (
        <button className={styles.secondaryButton} onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
