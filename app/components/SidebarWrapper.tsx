"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import Sidebar from "./Sidebar";

const PUBLIC_PATHS = ["/", "/login", "/register", "/focus", "/onboarding"];

/**
 * Conditionally renders the Sidebar only on authenticated (non-public) pages.
 * Also applies left margin to the main content area when sidebar is visible.
 */
export default function SidebarWrapper() {
  const pathname = usePathname();
  const isPublicPage = PUBLIC_PATHS.includes(pathname) || pathname.startsWith("/settings");
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (isPublicPage) return null;

  return (
    <>
      <Sidebar isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} />
      {/* Spacer div to push main content to the right of the fixed sidebar */}
      <div
        style={{
          width: isCollapsed
            ? "var(--sidebar-collapsed-width)"
            : "var(--sidebar-width)",
          minWidth: isCollapsed
            ? "var(--sidebar-collapsed-width)"
            : "var(--sidebar-width)",
          transition: "width 0.3s cubic-bezier(0.16, 1, 0.3, 1), min-width 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
          flexShrink: 0,
        }}
      />
    </>
  );
}
