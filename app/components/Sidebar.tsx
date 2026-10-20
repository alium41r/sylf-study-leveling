"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeft, Bell, Sparkles, NotebookPen } from "lucide-react";
import { SylvieIcon, ObjectiveTargetIcon } from "@/app/components/icons";
import { useAuth } from "./AuthProvider";
import { useSettings } from "./SettingsContext";
import { useProfileModal } from "./ProfileModalContext";
import { motion, AnimatePresence } from "framer-motion";
import MarkdownRenderer from "./MarkdownRenderer";
import { MOTION_SPRING } from "@/lib/motion";
import { useSystemAI } from "./system/SystemAIProvider";

interface SystemMessage {
  id: number;
  content: string;
  type: string;
  read: boolean;
  createdAt: string;
}

const NAV_ITEMS = [
  {
    href: "/dashboard",
    label: "Home",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    href: "/timer",
    label: "Timer",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    href: "/social",
    label: "Social",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
  {
    href: "/system",
    label: "Sylvie",
    icon: <SylvieIcon size={20} />,
  },
  {
    href: "/goals",
    label: "Objectives",
    icon: <ObjectiveTargetIcon size={20} />,
  },
  {
    href: "/calendar",
    label: "Calendar",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  { href: "/notes", label: "Notes", icon: <NotebookPen size={20} /> },
  {
    href: "/locker",
    label: "Locker",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
  },
  {
    href: "/inventory",
    label: "Shop",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
      </svg>
    ),
  },
];

interface SidebarProps {
  isCollapsed: boolean;
  setIsCollapsed: (val: boolean) => void;
  /**
   * Mobile drawer variant: renders inside the off-canvas drawer container
   * (in-flow, full height, never collapsed) instead of the desktop fixed rail.
   */
  mobile?: boolean;
  onCloseMobile?: () => void;
}

export default function Sidebar({ isCollapsed, setIsCollapsed, mobile = false, onCloseMobile }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout, refreshStats } = useAuth();
  const { openSettings } = useSettings();
  const { openProfile } = useProfileModal();
  const { companionVisible, toggleCompanion } = useSystemAI();

  const handleOpenProfile = () => {
    if (user?.username) {
      openProfile(user.username);
      if (mobile && onCloseMobile) {
        onCloseMobile();
      }
    }
  };

  const [notifications, setNotifications] = useState<SystemMessage[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  // Close notifications on click outside (Desktop dropdown only)
  useEffect(() => {
    if (mobile) return; // On mobile, notification panel stays open until user presses BACK button

    function handleClickOutside(event: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    }
    if (showNotifications) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showNotifications, mobile]);

  // Poll for notifications and listen for preference updates
  useEffect(() => {
    if (!user) return;
    
    const fetchNotifications = async () => {
      try {
        const res = await fetch("/api/notifications", {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          setNotifications(prev => {
            // Check if there are new unread notifications compared to prev state
            const hasNewUnread = data.some((n: SystemMessage) => 
              !n.read && !prev.some(p => p.id === n.id)
            );
            
            // If new notifications arrived (like HP penalties, level ups), sync global stats
            if (hasNewUnread && refreshStats) {
              refreshStats();
            }
            
            return data;
          });
        }
      } catch (e) {
        console.error("Failed to fetch notifications", e);
      }
    };

    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000); // Check every 30 seconds

    const handleUpdate = () => {
      fetchNotifications();
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchNotifications();
      }
    };

    window.addEventListener("notification-preferences-updated", handleUpdate);
    window.addEventListener("notifications-updated", handleUpdate);
    window.addEventListener("focus", handleUpdate);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearInterval(interval);
      window.removeEventListener("notification-preferences-updated", handleUpdate);
      window.removeEventListener("notifications-updated", handleUpdate);
      window.removeEventListener("focus", handleUpdate);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [user]);

  if (!user) return null;

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleOpenNotifications = async () => {
    const willOpen = !showNotifications;
    setShowNotifications(willOpen);
    if (willOpen) {
      // Immediately refresh notifications on open
      try {
        fetch("/api/notifications", { credentials: "include" })
          .then(r => r.ok ? r.json() : [])
          .then(data => Array.isArray(data) && setNotifications(data))
          .catch(() => null);

        if (unreadCount > 0) {
          await fetch("/api/notifications", {
            method: "PATCH",
            credentials: "include",
          });
          setNotifications(notifications.map(n => ({ ...n, read: true })));
        }
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleClearNotifications = async () => {
    try {
      await fetch("/api/notifications", {
        method: "DELETE",
        credentials: "include",
      });
      setNotifications([]);
    } catch (e) {
      console.error(e);
    }
  };

  // Reusable notification button & dropdown renderer
  const renderNotificationButton = () => (
    <div className={`relative pointer-events-auto ${showNotifications ? "z-50" : "z-10"} group`} ref={notifRef}>
      <button
        className={`w-10 h-10 flex items-center justify-center rounded-2xl border transition-all duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary shadow-sm ${
          showNotifications
            ? "border-2 border-accent-primary text-[var(--accent-text,var(--accent-primary))] bg-accent-primary/20 shadow-[0_0_16px_var(--accent-primary-dim)]"
            : "border-[var(--border-subtle)] bg-[var(--surface-2)] hover:bg-[var(--surface-raised)] text-[var(--sidebar-fg,var(--text-secondary))] hover:text-[var(--accent-text,var(--accent-primary))] hover:border-accent-primary/50 hover:shadow-[0_0_12px_var(--accent-primary-dim)]"
        }`}
        onClick={handleOpenNotifications}
        aria-label="Notifications"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]"></span>
        )}
      </button>

      {/* Tooltip when collapsed */}
      {isCollapsed && !showNotifications && (
        <div 
          role="tooltip"
          className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded-xl liquid-glass-sidebar text-xs font-['Rajdhani'] font-bold tracking-wider text-text-primary uppercase pointer-events-none opacity-0 group-hover:opacity-100 group-hover:translate-x-0 -translate-x-2 transition-all duration-200 whitespace-nowrap z-[70] shadow-2xl border border-[var(--border-subtle)]"
        >
          Notifications {unreadCount > 0 ? `(${unreadCount})` : ""}
        </div>
      )}

      {/* ─── Notifications Dropdown (Desktop Only) ────────── */}
      <AnimatePresence>
        {!mobile && showNotifications && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -6 }}
            transition={MOTION_SPRING.popover}
            className={`absolute ${
              isCollapsed
                ? "top-0 left-14 liquid-glass-sidebar border border-[var(--border-subtle)] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.8)]"
                : "top-12 left-0 bg-[var(--surface-1)] border border-[var(--border-subtle)] shadow-2xl"
            } w-80 max-h-96 overflow-y-auto rounded-[24px] p-4 custom-scrollbar z-[100]`}
            style={
              !isCollapsed
                ? {
                    backgroundColor: "var(--surface-1)",
                    backdropFilter: "none",
                    WebkitBackdropFilter: "none",
                    boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.75), 0 0 0 1px var(--border-subtle)",
                  }
                : undefined
            }
          >
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-border-subtle">
              <h3 className="text-xs tracking-widest text-accent-light font-['Rajdhani'] font-bold uppercase">
                SYSTEM NOTIFICATIONS
              </h3>
              {notifications.length > 0 && (
                <button 
                  onClick={handleClearNotifications}
                  className="text-[10px] text-text-muted hover:text-red-400 transition-colors font-bold tracking-wider uppercase font-['Rajdhani']"
                >
                  CLEAR ALL
                </button>
              )}
            </div>
            {notifications.length === 0 ? (
              <p className="text-xs text-text-muted p-4 text-center">No recent messages.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {notifications.map((n, idx) => {
                  const content = n.content || "";
                  let badgeLabel = n.type || "SYSTEM";
                  let badgeStyle = "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30";

                  if (content.includes("[FRIEND_REQUEST]") || content.toLowerCase().includes("friend request")) {
                    badgeLabel = "FRIEND REQUEST";
                    badgeStyle = "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30";
                  } else if (content.includes("[GROUP_ADDED]") || content.toLowerCase().includes("added you to the group")) {
                    badgeLabel = "GROUP";
                    badgeStyle = "bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30";
                  } else if (content.includes("[DIRECT_MESSAGE]") || content.toLowerCase().includes("direct message")) {
                    badgeLabel = "DIRECT MESSAGE";
                    badgeStyle = "bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30";
                  } else if (content.includes("[GROUP_CHAT]") || content.toLowerCase().includes("group chat")) {
                    badgeLabel = "GROUP CHAT";
                    badgeStyle = "bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30";
                  } else if (content.includes("[ACHIEVEMENT]") || n.type === "REWARD") {
                    badgeLabel = "ACHIEVEMENT";
                    badgeStyle = "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30";
                  } else if (n.type === "LEVEL_UP" || content.toLowerCase().includes("level up")) {
                    badgeLabel = "LEVEL UP";
                    badgeStyle = "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border-cyan-500/30";
                  } else if (n.type === "STREAK" || content.toLowerCase().includes("streak")) {
                    badgeLabel = "STREAK";
                    badgeStyle = "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30";
                  } else if (n.type === "QUEST" || content.toLowerCase().includes("quest")) {
                    badgeLabel = "QUEST";
                    badgeStyle = "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border-cyan-500/30";
                  } else if (n.type === "WARNING") {
                    badgeLabel = "ALERT";
                    badgeStyle = "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30";
                  }

                  const cleanContent = content.replace(/^\[[A-Z_]+\]\s*/, "");

                  return (
                    <div key={n.id}>
                      <div className={`p-2.5 rounded-lg text-sm transition-colors ${!n.read ? "bg-accent-primary-dim" : "bg-transparent hover:bg-bg-shadow/50"}`}>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className={`text-[9px] font-bold tracking-wider px-2 py-0.5 rounded border ${badgeStyle}`}>
                            {badgeLabel}
                          </span>
                          <span className="text-[10px] font-mono text-text-muted">{new Date(n.createdAt).toLocaleDateString()}</span>
                        </div>
                        <div className="text-text-primary text-xs leading-relaxed">
                          <MarkdownRenderer content={cleanContent} compact />
                        </div>
                      </div>
                      {idx < notifications.length - 1 && (
                        <hr className="border-border-subtle my-1 mx-1" />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  return (
    <aside
      className={`flex flex-col ${
        mobile
          ? "relative h-full w-full overflow-y-auto liquid-glass-sidebar border border-[var(--sidebar-border,var(--border-subtle))] shadow-2xl rounded-[28px] py-5 px-2.5"
          : "fixed left-0 top-0 bottom-0 z-50 overflow-visible hidden md:flex border-r border-[var(--sidebar-border,var(--border-subtle))] border-t-0 border-b-0 border-l-0 liquid-glass-sidebar py-3.5 px-1.5"
      }`}
      style={
        mobile
          ? undefined
          : {
              width: isCollapsed ? "var(--sidebar-collapsed-width)" : "var(--sidebar-width)",
              height: "100vh",
              transition: "width 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
              borderTop: "none",
              borderBottom: "none",
              borderLeft: "none",
              borderRadius: "0px",
            }
      }
    >
      {/* Specular Liquid Glass Top Rim Highlight (mobile floating drawer only) */}
      {mobile && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-white/12 via-white/5 to-transparent"
        />
      )}

      {/* Top: Controls + Scholar Profile */}
      {mobile ? (
        /* ─── Mobile Drawer Header (Static Full-Width) ─── */
        <div className={`relative ${showNotifications ? "z-50" : "z-20"} pl-[3px] pr-2`}>
          <div className={`flex items-center justify-between mb-3 relative ${showNotifications ? "z-30" : "z-10"}`}>
            <div className="flex items-center gap-2">
              <button
                className="pointer-events-auto w-10 h-10 flex items-center justify-center bg-[var(--surface-2)] hover:bg-[var(--surface-raised)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary)]/50 rounded-2xl text-[var(--sidebar-fg,var(--text-secondary))] hover:text-[var(--accent-text,var(--accent-primary))] hover:shadow-[0_0_16px_var(--accent-primary-dim)] active:scale-95 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
                onClick={openSettings}
                aria-label="Open System Hub"
                title="System Hub"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>

              {renderNotificationButton()}
            </div>
          </div>

          {/* Scholar Profile Card */}
          <button
            type="button"
            onClick={handleOpenProfile}
            className="w-full text-left transition-all duration-300 cursor-pointer rounded-2xl select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary group relative z-0 overflow-hidden bg-[var(--surface-2)] hover:bg-[var(--surface-raised)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary)]/50 hover:shadow-[0_0_18px_var(--accent-primary-dim)] active:scale-[0.98] p-3 block"
            title="View Profile Card"
            aria-label="View Profile Card"
          >
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-10 h-10 rounded-xl overflow-hidden border border-[var(--border-subtle)] group-hover:border-[var(--accent-primary)] bg-[var(--surface-1)] flex items-center justify-center shrink-0 shadow-sm group-hover:shadow-[0_0_12px_var(--accent-primary-dim)] transition-all duration-200">
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.name || user.username || "Scholar"}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-sm font-bold font-['Rajdhani'] text-emerald-400 group-hover:text-accent-primary-light transition-colors">
                    {(user.name || user.username || "S").charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-sm truncate group-hover:text-accent-primary-light transition-colors text-text-primary">
                  {user.name || "Scholar"}
                </p>
                <p className="text-xs truncate text-text-secondary">
                  {user.hunterRank}-Rank • Lv. {user.level}
                </p>
              </div>
            </div>
          </button>
        </div>
      ) : (
        /* ─── Desktop Top Section (Seamless Sliding Layout) ─── */
        <div 
          className={`relative ${showNotifications ? "z-50" : "z-20"} px-[3px]`}
          style={{
            height: isCollapsed ? 190 : 112,
            transition: "height 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          {/* 1. Toggle Button (anchored at top-left x=0, y=0) */}
          <div 
            className="absolute top-0 left-0 w-10 h-10 group"
            style={{
              left: isCollapsed ? "3px" : "0px",
              transition: "left 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="w-10 h-10 flex items-center justify-center rounded-2xl bg-[var(--surface-2)] hover:bg-[var(--surface-raised)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary)]/50 text-[var(--sidebar-fg,var(--text-secondary))] hover:text-[var(--accent-text,var(--accent-primary))] hover:shadow-[0_0_14px_var(--accent-primary-dim)] shadow-sm active:scale-95 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
              aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={isCollapsed ? undefined : "Collapse sidebar"}
            >
              <PanelLeft className="w-5 h-5" />
            </button>
            {isCollapsed && (
              <div 
                role="tooltip"
                className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded-xl liquid-glass-sidebar text-xs font-['Rajdhani'] font-bold tracking-wider text-text-primary uppercase pointer-events-none opacity-0 group-hover:opacity-100 group-hover:translate-x-0 -translate-x-2 transition-all duration-200 whitespace-nowrap z-[70] shadow-2xl border border-[var(--border-subtle)]"
              >
                Expand Sidebar
              </div>
            )}
          </div>

          {/* 2. System Hub Button (slides between (48px, 0px) and (0px, 50px)) */}
          <div 
            className="absolute top-0 left-0 w-10 h-10 group"
            style={{
              left: isCollapsed ? "3px" : "0px",
              transform: isCollapsed ? "translate3d(0px, 50px, 0)" : "translate3d(48px, 0px, 0)",
              transition: "left 0.3s cubic-bezier(0.16, 1, 0.3, 1), transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            <button
              className="w-10 h-10 flex items-center justify-center bg-[var(--surface-2)] hover:bg-[var(--surface-raised)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary)]/50 rounded-2xl text-[var(--sidebar-fg,var(--text-secondary))] hover:text-[var(--accent-text,var(--accent-primary))] hover:shadow-[0_0_14px_var(--accent-primary-dim)] shadow-sm active:scale-95 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
              onClick={openSettings}
              aria-label="Open System Hub"
              title={isCollapsed ? undefined : "System Hub"}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            {isCollapsed && (
              <div 
                role="tooltip"
                className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded-xl liquid-glass-sidebar text-xs font-['Rajdhani'] font-bold tracking-wider text-text-primary uppercase pointer-events-none opacity-0 group-hover:opacity-100 group-hover:translate-x-0 -translate-x-2 transition-all duration-200 whitespace-nowrap z-[70] shadow-2xl border border-[var(--border-subtle)]"
              >
                System Hub
              </div>
            )}
          </div>

          {/* 3. Notifications Bell (slides between (96px, 0px) and (0px, 100px)) */}
          <div 
            className="absolute top-0 left-0 w-10 h-10"
            style={{
              left: isCollapsed ? "3px" : "0px",
              transform: isCollapsed ? "translate3d(0px, 100px, 0)" : "translate3d(96px, 0px, 0)",
              transition: "left 0.3s cubic-bezier(0.16, 1, 0.3, 1), transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
              zIndex: showNotifications ? 50 : 20,
            }}
          >
            {renderNotificationButton()}
          </div>

          {/* 4. Scholar Profile / Avatar Button (slides between (0px, 50px) and (0px, 150px)) */}
          <div 
            className="absolute top-0 left-0 group"
            style={{
              left: isCollapsed ? "3px" : "0px",
              transform: isCollapsed ? "translate3d(0px, 150px, 0)" : "translate3d(0px, 50px, 0)",
              width: isCollapsed ? "40px" : "100%",
              height: isCollapsed ? "40px" : "58px",
              transition: "left 0.3s cubic-bezier(0.16, 1, 0.3, 1), transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), width 0.3s cubic-bezier(0.16, 1, 0.3, 1), height 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            <button
              type="button"
              onClick={handleOpenProfile}
              className={`w-full h-full text-left transition-all duration-300 cursor-pointer rounded-2xl select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary relative z-0 overflow-hidden flex items-center active:scale-[0.98] ${
                isCollapsed
                  ? "p-0 justify-center border border-[var(--border-subtle)] hover:border-[var(--accent-primary)] bg-[var(--surface-2)] shadow-sm hover:shadow-[0_0_14px_var(--accent-primary-dim)]"
                  : "p-2 gap-3 bg-[var(--surface-2)] hover:bg-[var(--surface-raised)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary)]/50 hover:shadow-[0_0_18px_var(--accent-primary-dim)] shadow-sm"
              }`}
              title={isCollapsed ? undefined : "View Profile Card"}
              aria-label="View Profile Card"
            >
              {/* Avatar: Fixed 40x40 container */}
              <div className={`overflow-hidden bg-[var(--surface-1)] flex items-center justify-center shrink-0 shadow-sm transition-all duration-200 ${
                isCollapsed
                  ? "w-full h-full rounded-2xl border-0"
                  : "w-10 h-10 rounded-2xl border border-[var(--border-subtle)] group-hover:border-[var(--accent-primary)] group-hover:shadow-[0_0_12px_var(--accent-primary-dim)]"
              }`}>
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.name || user.username || "Scholar"}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-xs font-bold font-['Rajdhani'] text-emerald-400 group-hover:text-accent-primary-light transition-colors">
                    {(user.name || user.username || "S").charAt(0).toUpperCase()}
                  </span>
                )}
              </div>

              {/* Scholar details: Smooth cross-fade and glide */}
              <div 
                className="min-w-0 flex-1 overflow-hidden"
                style={{
                  opacity: isCollapsed ? 0 : 1,
                  transform: isCollapsed ? "translateX(-8px)" : "translateX(0)",
                  transition: isCollapsed
                    ? "opacity 0.15s ease-out, transform 0.15s ease-out"
                    : "opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1) 0.08s, transform 0.25s cubic-bezier(0.16, 1, 0.3, 1) 0.08s",
                  whiteSpace: "nowrap",
                  pointerEvents: isCollapsed ? "none" : "auto",
                }}
              >
                <p className="font-bold text-sm truncate group-hover:text-accent-primary-light transition-colors text-text-primary">
                  {user.name || "Scholar"}
                </p>
                <p className="text-xs truncate text-text-secondary">
                  {user.hunterRank}-Rank • Lv. {user.level}
                </p>
              </div>
            </button>

            {/* Collapsed Tooltip */}
            {isCollapsed && (
              <div 
                role="tooltip"
                className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded-xl liquid-glass-sidebar text-xs font-['Rajdhani'] font-bold tracking-wider text-text-primary uppercase pointer-events-none opacity-0 group-hover:opacity-100 group-hover:translate-x-0 -translate-x-2 transition-all duration-200 whitespace-nowrap z-[70] shadow-2xl border border-border-subtle dark:border-white/15 flex items-center gap-1.5"
              >
                <span>{user.name || "Scholar Profile"}</span>
                <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-accent-primary/25 text-accent-primary-light border border-accent-primary/40">
                  Lv.{user.level}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Navigation ────────── */}
      <nav 
        className={`flex-1 flex flex-col justify-start mt-2 gap-1.5 px-0.5 py-1 relative z-10 ${
          isCollapsed && !mobile ? "overflow-visible" : "overflow-y-auto sidebar-scroll"
        }`}
        aria-label="Main Navigation"
      >
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || (item.href === "/goals" && pathname === "/quests");

          return (
            <div 
              key={item.href} 
              className="relative group"
            >
              {/* Active Indicator Line on the sidebar wall edge (zero overlap with icon) */}
              {isActive && (
                <span 
                  aria-hidden="true" 
                  className={`absolute top-1/2 -translate-y-1/2 bg-accent-primary shadow-[0_0_8px_var(--accent-primary)] z-20 pointer-events-none transition-all duration-200 ${
                    mobile
                      ? "left-0 w-1 h-5 rounded-full"
                      : "-left-2 w-1 h-5 rounded-r-full"
                  }`}
                />
              )}

              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`relative flex items-center rounded-2xl active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary ${
                  isCollapsed ? "justify-center" : ""
                } ${
                  isActive
                    ? isCollapsed
                      ? "bg-accent-primary/20 border-2 border-accent-primary text-[var(--accent-text,var(--accent-primary))] shadow-[0_0_12px_var(--accent-primary-dim)] font-semibold"
                      : "bg-accent-primary/20 border border-accent-primary/40 text-[var(--accent-text,var(--accent-primary))] shadow-[0_0_12px_var(--accent-primary-dim)] font-semibold"
                    : isCollapsed
                      ? "bg-[var(--surface-2)] hover:bg-[var(--surface-raised)] border border-[var(--border-subtle)] text-[var(--sidebar-fg,var(--text-secondary))] hover:text-[var(--accent-text,var(--accent-primary))] hover:border-accent-primary/50 hover:shadow-[0_0_12px_var(--accent-primary-dim)]"
                      : "text-[var(--sidebar-fg,var(--text-secondary))] hover:text-[var(--accent-text,var(--accent-primary))] hover:bg-[var(--surface-raised)] hover:border-[var(--border-subtle)] hover:shadow-[0_0_12px_var(--accent-primary-dim)] border border-transparent"
                }`}
                style={{
                  width: isCollapsed ? "40px" : "100%",
                  height: "40px",
                  margin: isCollapsed ? "0 auto" : "0",
                  transition: "width 0.3s cubic-bezier(0.16, 1, 0.3, 1), margin 0.3s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.2s, border-color 0.2s, box-shadow 0.2s",
                }}
              >
                {/* Fixed icon centering wrapper */}
                <div 
                  className={`flex items-center justify-center transition-colors duration-200 ${
                    isCollapsed ? "w-full h-full" : "w-10 h-10 shrink-0"
                  } ${
                    isActive ? "text-[var(--accent-text,var(--accent-primary))]" : "text-[var(--sidebar-fg,var(--text-secondary))] group-hover:text-[var(--accent-text,var(--accent-primary))]"
                  }`}
                >
                  {item.icon}
                </div>

                {/* Label + Badge (smooth fade/glide with no overflow wrap) */}
                <div
                  className={`flex items-center overflow-hidden ${
                    isCollapsed ? "w-0 p-0 m-0 pointer-events-none opacity-0" : "flex-1 min-w-0 pr-2.5 opacity-100"
                  }`}
                  style={{
                    opacity: isCollapsed ? 0 : 1,
                    width: isCollapsed ? 0 : undefined,
                    paddingRight: isCollapsed ? 0 : undefined,
                    transform: isCollapsed ? "translateX(-6px)" : "translateX(0)",
                    transition: isCollapsed
                      ? "opacity 0.15s ease-out, transform 0.15s ease-out, width 0.3s cubic-bezier(0.16, 1, 0.3, 1), padding 0.3s"
                      : "opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1) 0.08s, transform 0.25s cubic-bezier(0.16, 1, 0.3, 1) 0.08s, width 0.3s cubic-bezier(0.16, 1, 0.3, 1), padding 0.3s",
                    whiteSpace: "nowrap",
                    pointerEvents: isCollapsed ? "none" : "auto",
                  }}
                >
                  <span className="truncate font-['Rajdhani'] font-semibold tracking-wide text-sm">
                    {item.label}
                  </span>
                </div>
              </Link>

              {/* Floating Tooltip when Collapsed */}
              {isCollapsed && (
                <div 
                  role="tooltip"
                  className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded-xl liquid-glass-sidebar text-xs font-['Rajdhani'] font-bold tracking-wider text-text-primary uppercase pointer-events-none opacity-0 group-hover:opacity-100 group-hover:translate-x-0 -translate-x-2 transition-all duration-200 whitespace-nowrap z-[70] shadow-2xl border border-[var(--border-subtle)] flex items-center gap-1.5"
                >
                  <span>{item.label}</span>
                </div>
              )}
            </div>
          );
        })}

        <div className="relative group mt-2 pt-2 border-t border-[var(--sidebar-border,var(--border-subtle))]">
          <button
            type="button"
            onClick={() => {
              toggleCompanion();
              if (mobile) onCloseMobile?.();
            }}
            aria-label={companionVisible ? "Hide companion" : "Show companion"}
            aria-pressed={companionVisible}
            title={companionVisible ? "Hide companion" : "Show companion"}
            className={`flex items-center h-10 rounded-2xl border transition-colors duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary ${
              isCollapsed ? "w-10 mx-auto justify-center" : "w-full"
            } ${
              companionVisible
                ? "border-[var(--accent-primary-mid)] bg-[var(--accent-primary-dim)] text-[var(--accent-text)]"
                : "border-transparent text-[var(--sidebar-fg,var(--text-secondary))] hover:bg-[var(--surface-raised)] hover:border-[var(--border-subtle)]"
            }`}
          >
            <span className="w-10 h-10 shrink-0 flex items-center justify-center">
              <Sparkles size={20} strokeWidth={1.7} aria-hidden="true" />
            </span>
            {!isCollapsed && (
              <>
                <span className="truncate font-['Rajdhani'] font-semibold tracking-wide text-sm">
                  {companionVisible ? "Hide companion" : "Show companion"}
                </span>
                <span aria-hidden="true" className={`ml-auto mr-3 h-1.5 w-1.5 shrink-0 rounded-full ${companionVisible ? "bg-[var(--accent-text)]" : "bg-[var(--text-muted)]"}`} />
              </>
            )}
          </button>
        </div>

        {user?.isAdmin && (
          <div key="/admin/background-studio" className="relative group">
            {pathname === "/admin/background-studio" && (
              <span
                aria-hidden="true"
                className={`absolute top-1/2 -translate-y-1/2 bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)] z-20 pointer-events-none transition-all duration-200 ${
                  mobile ? "left-0 w-1 h-5 rounded-full" : "-left-2 w-1 h-5 rounded-r-full"
                }`}
              />
            )}
            <Link
              href="/admin/background-studio"
              aria-current={pathname === "/admin/background-studio" ? "page" : undefined}
              className={`relative flex items-center rounded-2xl active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                isCollapsed ? "justify-center" : ""
              } ${
                pathname === "/admin/background-studio"
                  ? isCollapsed
                    ? "bg-amber-500/20 border-2 border-amber-500 text-amber-600 dark:text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.2)] font-semibold"
                    : "bg-amber-500/20 border border-amber-500/40 text-amber-600 dark:text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.2)] font-semibold"
                  : isCollapsed
                    ? "bg-[var(--surface-2)] hover:bg-[var(--surface-raised)] border border-[var(--border-subtle)] text-[var(--sidebar-fg,var(--text-secondary))] hover:text-amber-500 hover:border-amber-500/50"
                    : "text-[var(--sidebar-fg,var(--text-secondary))] hover:text-amber-500 hover:bg-[var(--surface-raised)] hover:border-amber-500/30 border border-transparent"
              }`}
              style={{
                width: isCollapsed ? "40px" : "100%",
                height: "40px",
                margin: isCollapsed ? "0 auto" : "0",
                transition: "width 0.3s cubic-bezier(0.16, 1, 0.3, 1), margin 0.3s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.2s, border-color 0.2s, box-shadow 0.2s",
              }}
            >
              <div 
                className={`flex items-center justify-center transition-colors duration-200 ${
                  isCollapsed ? "w-full h-full" : "w-10 h-10 shrink-0"
                } ${
                  pathname === "/admin/background-studio" ? "text-amber-500 dark:text-amber-400" : "text-text-secondary group-hover:text-amber-500 dark:group-hover:text-amber-400"
                }`}
              >
                <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>

              <div
                className={`flex items-center overflow-hidden ${
                  isCollapsed ? "w-0 p-0 m-0 pointer-events-none opacity-0" : "flex-1 min-w-0 pr-2.5 opacity-100"
                }`}
                style={{
                  opacity: isCollapsed ? 0 : 1,
                  width: isCollapsed ? 0 : undefined,
                  paddingRight: isCollapsed ? 0 : undefined,
                  transform: isCollapsed ? "translateX(-6px)" : "translateX(0)",
                  transition: isCollapsed
                    ? "opacity 0.15s ease-out, transform 0.15s ease-out, width 0.3s cubic-bezier(0.16, 1, 0.3, 1), padding 0.3s"
                    : "opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1) 0.08s, transform 0.25s cubic-bezier(0.16, 1, 0.3, 1) 0.08s, width 0.3s cubic-bezier(0.16, 1, 0.3, 1), padding 0.3s",
                  whiteSpace: "nowrap",
                  pointerEvents: isCollapsed ? "none" : "auto",
                }}
              >
                <span className="truncate font-['Rajdhani'] font-semibold tracking-wide text-sm">
                  Studio
                </span>
                <span className="ml-auto text-[8px] font-bold tracking-widest px-1.5 py-0.5 rounded-full border border-amber-500/40 bg-amber-500/20 text-amber-600 dark:text-amber-300">
                  ADMIN
                </span>
              </div>
            </Link>

            {isCollapsed && (
              <div
                role="tooltip"
                className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded-xl liquid-glass-sidebar text-xs font-['Rajdhani'] font-bold tracking-wider text-amber-500 dark:text-amber-300 uppercase pointer-events-none opacity-0 group-hover:opacity-100 group-hover:translate-x-0 -translate-x-2 transition-all duration-200 whitespace-nowrap z-[70] shadow-2xl border border-amber-500/30 flex items-center gap-1.5"
              >
                Background Studio
              </div>
            )}
          </div>
        )}
      </nav>

      {/* ─── Logout ──────────────────────────────────── */}
      <div className="px-0.5 pt-2 mt-auto border-t border-[var(--border-subtle)] relative z-10">
        <div className="relative group">
          <button
            onClick={() => { void logout().catch(() => { /* AuthProvider displays the durable Notes recovery notice. */ }); }}
            className={`flex items-center text-sm rounded-2xl bg-[var(--surface-2)] hover:bg-rose-500/15 border border-[var(--border-subtle)] hover:border-rose-500/30 text-[var(--text-muted)] hover:text-rose-500 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/50 shadow-sm overflow-hidden ${
              isCollapsed ? "justify-center" : ""
            }`}
            style={{
              fontFamily: "'Rajdhani', sans-serif",
              fontWeight: 600,
              width: isCollapsed ? "40px" : "100%",
              height: "40px",
              margin: isCollapsed ? "0 auto" : "0",
              transition: "width 0.3s cubic-bezier(0.16, 1, 0.3, 1), margin 0.3s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.2s, border-color 0.2s, box-shadow 0.2s",
            }}
            aria-label="Logout"
            title={isCollapsed ? undefined : "Logout"}
          >
            <div className={`flex items-center justify-center ${isCollapsed ? "w-full h-full" : "w-10 h-10 shrink-0"}`}>
              <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </div>
            <span
              className={`overflow-hidden ${
                isCollapsed ? "w-0 p-0 m-0 pointer-events-none opacity-0" : "flex-1 min-w-0 pr-2.5 opacity-100"
              }`}
              style={{
                opacity: isCollapsed ? 0 : 1,
                width: isCollapsed ? 0 : undefined,
                paddingRight: isCollapsed ? 0 : undefined,
                transform: isCollapsed ? "translateX(-6px)" : "translateX(0)",
                transition: isCollapsed
                  ? "opacity 0.15s ease-out, transform 0.15s ease-out, width 0.3s cubic-bezier(0.16, 1, 0.3, 1), padding 0.3s"
                  : "opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1) 0.08s, transform 0.25s cubic-bezier(0.16, 1, 0.3, 1) 0.08s, width 0.3s cubic-bezier(0.16, 1, 0.3, 1), padding 0.3s",
                whiteSpace: "nowrap",
                pointerEvents: isCollapsed ? "none" : "auto",
              }}
            >
              Logout
            </span>
          </button>

          {/* Floating Tooltip when Collapsed */}
          {isCollapsed && (
            <div 
              role="tooltip"
              className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded-xl liquid-glass-sidebar text-xs font-['Rajdhani'] font-bold tracking-wider text-rose-500 dark:text-rose-400 uppercase pointer-events-none opacity-0 group-hover:opacity-100 group-hover:translate-x-0 -translate-x-2 transition-all duration-200 whitespace-nowrap z-[70] shadow-2xl border border-rose-500/30"
            >
              Logout
            </div>
          )}
        </div>
      </div>

      {/* ─── Mobile Drawer Notifications Full-Panel View ───────────── */}
      {mobile && (
        <AnimatePresence>
          {showNotifications && (
            <motion.div
              initial={{ opacity: 0, x: "100%" }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: "100%" }}
              transition={MOTION_SPRING.drawer}
              className="absolute inset-0 z-50 bg-bg-panel p-4 flex flex-col h-full overflow-hidden shadow-2xl"
            >
              {/* Header with Back button */}
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-border-subtle shrink-0">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowNotifications(false)}
                    className="p-1.5 rounded-lg bg-bg-abyss border border-border-subtle text-text-secondary hover:text-text-primary hover:border-border-active transition-colors flex items-center gap-1.5 text-xs font-bold font-['Rajdhani']"
                    title="Back to Menu"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    <span>BACK</span>
                  </button>
                  <h3 className="text-xs tracking-widest text-accent-light font-['Rajdhani'] font-bold uppercase">
                    NOTIFICATIONS
                  </h3>
                </div>

                {notifications.length > 0 && (
                  <button 
                    onClick={handleClearNotifications}
                    className="text-[10px] text-text-muted hover:text-red-400 transition-colors font-bold tracking-wider uppercase font-['Rajdhani']"
                  >
                    CLEAR ALL
                  </button>
                )}
              </div>

              {/* Notification List */}
              <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col gap-2.5 pr-1">
                {notifications.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
                    <div className="w-12 h-12 rounded-xl bg-bg-abyss border border-border-subtle flex items-center justify-center text-xl mb-2 text-text-muted">
                      <Bell className="w-6 h-6 text-text-muted" />
                    </div>
                    <p className="text-sm font-['Rajdhani'] font-bold text-text-muted uppercase tracking-wider">
                      No Recent Messages
                    </p>
                    <p className="text-xs text-text-muted/70 mt-1">
                      You&apos;re all caught up!
                    </p>
                  </div>
                ) : (
                  notifications.map((n) => {
                    const content = n.content || "";
                    let badgeLabel = n.type || "SYSTEM";
                    let badgeStyle = "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30";

                    if (content.includes("[FRIEND_REQUEST]") || content.toLowerCase().includes("friend request")) {
                      badgeLabel = "FRIEND REQUEST";
                      badgeStyle = "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30";
                    } else if (content.includes("[GROUP_ADDED]") || content.toLowerCase().includes("added you to the group")) {
                      badgeLabel = "GROUP";
                      badgeStyle = "bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30";
                    } else if (content.includes("[DIRECT_MESSAGE]") || content.toLowerCase().includes("direct message")) {
                      badgeLabel = "DIRECT MESSAGE";
                      badgeStyle = "bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30";
                    } else if (content.includes("[GROUP_CHAT]") || content.toLowerCase().includes("group chat")) {
                      badgeLabel = "GROUP CHAT";
                      badgeStyle = "bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30";
                    } else if (content.includes("[ACHIEVEMENT]") || n.type === "REWARD") {
                      badgeLabel = "ACHIEVEMENT";
                      badgeStyle = "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30";
                    } else if (n.type === "LEVEL_UP" || content.toLowerCase().includes("level up")) {
                      badgeLabel = "LEVEL UP";
                      badgeStyle = "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border-cyan-500/30";
                    } else if (n.type === "STREAK" || content.toLowerCase().includes("streak")) {
                      badgeLabel = "STREAK";
                      badgeStyle = "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30";
                    } else if (n.type === "QUEST" || content.toLowerCase().includes("quest")) {
                      badgeLabel = "QUEST";
                      badgeStyle = "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border-cyan-500/30";
                    } else if (n.type === "WARNING") {
                      badgeLabel = "ALERT";
                      badgeStyle = "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30";
                    }

                    const cleanContent = content.replace(/^\[[A-Z_]+\]\s*/, "");

                    return (
                      <div
                        key={n.id}
                        className={`p-3 rounded-xl border transition-colors ${
                          !n.read
                            ? "bg-accent-primary-dim/20 border-accent-primary-mid/40 shadow-sm"
                            : "bg-bg-abyss/70 border-border-subtle"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className={`text-[9px] font-bold tracking-wider px-2 py-0.5 rounded border ${badgeStyle}`}>
                            {badgeLabel}
                          </span>
                          <span className="text-[10px] font-mono text-text-muted">
                            {new Date(n.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="text-text-primary text-xs leading-relaxed">
                          <MarkdownRenderer content={cleanContent} compact />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </aside>
  );
}
