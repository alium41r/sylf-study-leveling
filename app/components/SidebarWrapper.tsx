"use client";

import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { PanelLeft } from "lucide-react";
import Sidebar from "./Sidebar";
import UserAvatar from "./UserAvatar";
import { useAuth } from "./AuthProvider";
import { useSettings } from "./SettingsContext";
import { useProfileModal } from "./ProfileModalContext";
import { lockPageScroll } from "../../lib/scroll-lock";

const PUBLIC_PATHS = ["/", "/login", "/register", "/focus", "/onboarding"];

/**
 * Conditionally renders the Sidebar only on authenticated (non-public) pages.
 *
 * Viewport separation:
 *  - Desktop (md+): static/collapsible sidebar rail in flex flow (+ spacer).
 *  - Mobile (< 768px): the inline rail + spacer are hidden; navigation lives
 *    in an absolute off-canvas drawer (`fixed inset-y-0 left-0 z-50 w-72`)
 *    toggled by a sticky mobile header with a hamburger trigger, plus a
 *    backdrop layer that closes the drawer on tap.
 */
export default function SidebarWrapper() {
  const pathname = usePathname();
  const isPublicPage = PUBLIC_PATHS.includes(pathname) || pathname.startsWith("/settings");
  const isChatPage = pathname.startsWith("/social/chat");
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [prevPathname, setPrevPathname] = useState(pathname);

  // Close the mobile drawer after in-drawer navigation (during render)
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setIsMobileMenuOpen(false);
  }

  // Close the mobile drawer when the settings panel or profile modal opens on top of it
  const { isOpen: isSettingsOpen } = useSettings();
  const { isOpen: isProfileOpen } = useProfileModal();

  const isDrawerOpen = isMobileMenuOpen && !isSettingsOpen && !isProfileOpen;

  // Lock page scroll while the drawer is open so only the drawer scrolls.
  // Both <html> and <body> must be locked — with body-only overflow:hidden
  // the document scroller stays live and the page behind the drawer can
  // still be scrolled. Ref-counted so it never fights the settings panel.
  useEffect(() => {
    if (!isDrawerOpen) return;
    return lockPageScroll();
  }, [isDrawerOpen]);

  if (isPublicPage) return null;

  return (
    <>
      {/* ─── Desktop Sidebar (flex flow, md and above) ─────── */}
      <Sidebar isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} />

      {/* Spacer div to push main content right of the fixed sidebar (desktop only) */}
      <div
        className="hidden md:block"
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

      {/* ─── Mobile Sticky Top Navigation Bar (Hidden on chat page) ───────────────── */}
      {!isChatPage && (
        <MobileTopBar onOpenMenu={() => setIsMobileMenuOpen(true)} />
      )}

      {/* ─── Mobile Off-Canvas Drawer ──────────────────────── */}
      {!isChatPage && (
        <>
          <div
            className={`fixed inset-y-0 left-0 z-50 w-72 transform transition-transform duration-300 ease-out md:hidden shadow-2xl ${
              isDrawerOpen ? "translate-x-0" : "-translate-x-full"
            }`}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
          >
            <Sidebar
              isCollapsed={false}
              setIsCollapsed={() => {}}
              mobile
              onCloseMobile={() => setIsMobileMenuOpen(false)}
            />
          </div>

          {/* ─── Mobile Backdrop (closes drawer on tap) ─────────── */}
          {isDrawerOpen && (
            <div
              className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm md:hidden"
              aria-hidden="true"
              onClick={() => setIsMobileMenuOpen(false)}
            />
          )}
        </>
      )}
    </>
  );
}

/**
 * Mobile-only sticky header: hamburger drawer trigger, rank badge, and
 * quick HP / Sylph status. Rendered only below the md breakpoint.
 */
function MobileTopBar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { user } = useAuth();
  const { openProfile } = useProfileModal();

  const hp = Number(user?.hp ?? 0);
  const maxHp = Number(user?.maxHp ?? 100);
  const sylph = Number(user?.sylph ?? 0);
  const streak = Number(user?.streakDays ?? 0);

  return (
    <header className="h-14 w-full flex items-center justify-between gap-2 px-3 md:hidden border-b border-border-subtle bg-background/80 backdrop-blur-md sticky top-0 z-30 shrink-0">
      {/* Left: hamburger + pfp + name */}
      <div className="flex items-center gap-2.5 min-w-0">
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Open navigation menu"
          title="Open sidebar"
          className="w-10 h-10 shrink-0 flex items-center justify-center rounded-lg border border-border-subtle bg-bg-panel/70 text-text-primary hover:border-border-active hover:text-accent-primary-light transition-colors"
        >
          <PanelLeft className="w-5 h-5 text-text-secondary" />
        </button>

        <button
          type="button"
          onClick={() => user?.username && openProfile(user.username)}
          className="flex items-center gap-2.5 min-w-0 text-left cursor-pointer group active:scale-95 transition-all p-1 -m-1 rounded-lg hover:bg-bg-panel/50 focus:outline-none focus:ring-1 focus:ring-accent-primary"
          title="View Profile Card"
          aria-label="View Profile Card"
        >
          <div className="relative group-hover:ring-2 group-hover:ring-accent-primary/60 rounded-xl transition-all">
            <UserAvatar
              src={user?.avatarUrl}
              name={user?.name}
              username={user?.username}
              size="sm"
              shape="rounded"
              className="w-9 h-9 group-hover:border-accent-primary transition-colors"
            />
          </div>

          <div className="min-w-0">
            <p className="text-xs font-bold font-['Rajdhani'] uppercase tracking-wider text-text-primary group-hover:text-accent-primary-light transition-colors truncate">
              {user?.name || user?.username || "The System"}
            </p>
            <p className="text-[10px] font-mono text-text-muted truncate">
              {user?.hunterRank || "E"}-Rank • Lv. {user?.level || 1}
            </p>
          </div>
        </button>
      </div>

      {/* Right: quick status (streak / HP / Sylph) */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span
          className="flex items-center gap-1 px-2 py-1 rounded-full border border-yellow-500/30 bg-yellow-500/10 text-yellow-500 text-[10px] font-['Rajdhani'] font-bold"
          title={`Weekly Streak: ${streak} week${streak === 1 ? "" : "s"}`}
        >
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
          <span>{streak}</span>
        </span>

        <span
          className="flex items-center gap-1 px-2 py-1 rounded-full border border-red-500/30 bg-red-500/10 text-red-400 text-[10px] font-['Rajdhani'] font-bold"
          title={`HP: ${hp}/${maxHp}`}
        >
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
            <path d="M13.35 20.13c-.76.69-1.93.69-2.69-.01l-3.7-3.22C3.86 14.09 2 12.06 2 9.6 2 6.24 4.7 3.5 8.02 3.5c1.65 0 3.13.7 4.16 1.8.5-.49 1.63-.78 2.34-.45 0 0 .95.23 1.7 1.05.27.29.5.62.66.98.32.7.47 1.48.47 2.32 0 1.06-.31 2.06-.85 2.93-.6.96-1.49 1.9-2.63 2.9l-3.52 3.1z" opacity="0.9" />
          </svg>
          <span>
            {hp}/{maxHp}
          </span>
        </span>

        <span
          className="flex items-center gap-1 px-2 py-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 text-[10px] font-['Rajdhani'] font-bold"
          title={`Sylph: ${sylph}`}
        >
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8L12 2z" />
          </svg>
          <span>{sylph}</span>
        </span>
      </div>
    </header>
  );
}
