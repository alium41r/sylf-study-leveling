"use client";

import React, { useEffect } from "react";
import { usePathname } from "next/navigation";
import SidebarWrapper from "./SidebarWrapper";

export interface SylfAppShellProps {
  children: React.ReactNode;
}

/**
 * Route classifier for screens that must NEVER allow document-level scroll.
 * These screens are full-viewport application surfaces (timers, chat workspaces, 3D canvases).
 */
export function isStaticViewportRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return (
    pathname === "/focus" ||
    pathname.startsWith("/focus/") ||
    pathname === "/system" ||
    pathname.startsWith("/system/") ||
    pathname.startsWith("/social/chat")
  );
}

/**
 * Canonical Application Shell — Shared between Next.js Web and Mobile Client.
 *
 * Provides the persistent structural container:
 *   • SidebarWrapper (desktop rail + mobile top bar + off-canvas drawer)
 *   • Main content outlet with centralized safe-area padding
 *   • Static viewport locking for immersive fullscreen pages (Focus timer, AI system chat)
 */
export function SylfAppShell({ children }: SylfAppShellProps) {
  const pathname = usePathname();
  const isStatic = isStaticViewportRoute(pathname);
  const isFocusScreen = pathname === "/focus" || pathname?.startsWith("/focus/");

  // Lock <html> and <body> while on static viewport routes
  useEffect(() => {
    if (!isStatic) return;

    document.documentElement.classList.add("static-viewport");
    document.body.classList.add("static-viewport");

    return () => {
      document.documentElement.classList.remove("static-viewport");
      document.body.classList.remove("static-viewport");
    };
  }, [isStatic]);

  return (
    <div
      className={
        isStatic
          ? "h-[100dvh] max-h-[100dvh] w-full bg-transparent text-foreground flex flex-col md:flex-row overflow-hidden overscroll-none"
          : "min-h-screen w-full bg-transparent text-foreground flex flex-col md:flex-row overflow-x-clip"
      }
    >
      <SidebarWrapper />
      <main
        className={
          isStatic
            ? "flex-1 w-full min-w-0 flex flex-col h-full min-h-0 overflow-hidden overscroll-none"
            : "flex-1 w-full min-w-0 flex flex-col"
        }
        style={{
          // Focus screen handles its own fullscreen padding; other static/normal pages respect safe area bottom
          paddingBottom: isFocusScreen ? "0px" : "env(safe-area-inset-bottom, 0px)",
        }}
      >
        {children}
      </main>
    </div>
  );
}

export default SylfAppShell;
