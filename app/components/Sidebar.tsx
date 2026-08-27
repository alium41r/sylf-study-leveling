"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeft } from "lucide-react";
import { useAuth } from "./AuthProvider";
import { useSettings } from "./SettingsContext";
import { useProfileModal } from "./ProfileModalContext";
import { motion, AnimatePresence } from "framer-motion";
import MarkdownRenderer from "./MarkdownRenderer";

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
    label: "The System",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
      </svg>
    ),
    badge: "AI",
  },
  {
    href: "/goals",
    label: "Objectives",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
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

  return (
    <aside
      className={`flex flex-col py-6 ${
        mobile
          ? "relative h-full w-full overflow-y-auto"
          : "fixed left-0 top-0 h-full z-50 overflow-visible hidden md:flex"
      }`}
      style={
        mobile
          ? {
              background: "var(--bg-panel)",
              borderRight: "1px solid var(--border-subtle)",
            }
          : {
              width: isCollapsed ? "var(--sidebar-collapsed-width)" : "var(--sidebar-width)",
              background: "var(--bg-panel)",
              borderRight: "1px solid var(--border-subtle)",
              transition: "width 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
            }
      }
    >
      {/* Top: Toggle + Profile Badge */}
      <div className="px-4">
        {/* Controls: Settings, Notifications, Toggle Button */}
        <div className={`flex ${isCollapsed ? "flex-col-reverse items-center gap-4" : "flex-row justify-between items-center"} mb-4 relative`}>
          <div className={`flex ${isCollapsed ? "flex-col gap-3" : "flex-row gap-2"}`}>
            {/* ─── System Hub Icon Button ───────────────────────── */}
            <button
              className="pointer-events-auto w-10 h-10 flex items-center justify-center bg-bg-panel/70 backdrop-blur-md border border-border-subtle rounded-lg text-text-secondary hover:text-accent-primary-light hover:border-accent-primary-light hover:shadow-[0_0_16px_var(--accent-primary-dim)] hover:scale-105 active:scale-95 transition-all duration-200"
              onClick={openSettings}
              aria-label="Open System Hub"
              title="System Hub"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            {/* ─── Notification Bell ──────────────────────────────── */}
            <div className="relative pointer-events-auto" ref={notifRef}>
              <button
                className={`w-10 h-10 flex items-center justify-center bg-bg-panel/70 backdrop-blur-md border rounded-lg transition-all duration-200 hover:scale-105 active:scale-95 ${
                  showNotifications ? "border-accent-primary text-accent-text-light" : "border-border-subtle text-text-secondary hover:text-accent-primary hover:border-accent-primary hover:shadow-lg"
                }`}
                onClick={handleOpenNotifications}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]"></span>
                )}
              </button>

              {/* ─── Notifications Dropdown (Desktop Only) ────────── */}
              <AnimatePresence>
                {!mobile && showNotifications && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -6 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -6 }}
                    transition={{ type: "spring", damping: 25, stiffness: 380 }}
                    className={`absolute ${isCollapsed ? 'top-0 left-12' : 'top-12 left-0'} w-80 max-h-96 overflow-y-auto bg-bg-abyss border border-border-subtle shadow-2xl rounded-xl p-3 custom-scrollbar z-[100]`}
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
                          let badgeStyle = "bg-blue-500/20 text-blue-400 border-blue-500/30";

                          if (content.includes("[FRIEND_REQUEST]") || content.toLowerCase().includes("friend request")) {
                            badgeLabel = "FRIEND REQUEST";
                            badgeStyle = "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
                          } else if (content.includes("[GROUP_ADDED]") || content.toLowerCase().includes("added you to the group")) {
                            badgeLabel = "GROUP";
                            badgeStyle = "bg-purple-500/20 text-purple-400 border-purple-500/30";
                          } else if (content.includes("[DIRECT_MESSAGE]") || content.toLowerCase().includes("direct message")) {
                            badgeLabel = "DIRECT MESSAGE";
                            badgeStyle = "bg-sky-500/20 text-sky-400 border-sky-500/30";
                          } else if (content.includes("[GROUP_CHAT]") || content.toLowerCase().includes("group chat")) {
                            badgeLabel = "GROUP CHAT";
                            badgeStyle = "bg-purple-500/20 text-purple-400 border-purple-500/30";
                          } else if (content.includes("[ACHIEVEMENT]") || n.type === "REWARD") {
                            badgeLabel = "ACHIEVEMENT";
                            badgeStyle = "bg-amber-500/20 text-amber-400 border-amber-500/30";
                          } else if (n.type === "LEVEL_UP" || content.toLowerCase().includes("level up")) {
                            badgeLabel = "LEVEL UP";
                            badgeStyle = "bg-cyan-500/20 text-cyan-400 border-cyan-500/30";
                          } else if (n.type === "STREAK" || content.toLowerCase().includes("streak")) {
                            badgeLabel = "STREAK";
                            badgeStyle = "bg-amber-500/20 text-amber-400 border-amber-500/30";
                          } else if (n.type === "QUEST" || content.toLowerCase().includes("quest")) {
                            badgeLabel = "QUEST";
                            badgeStyle = "bg-cyan-500/20 text-cyan-400 border-cyan-500/30";
                          } else if (n.type === "WARNING") {
                            badgeLabel = "ALERT";
                            badgeStyle = "bg-red-500/20 text-red-400 border-red-500/30";
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
          </div>
          
          {/* Toggle Button (desktop rail only — mobile drawer is never collapsed) */}
          {!mobile && (
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="text-text-secondary hover:text-text-primary transition-all duration-200 hover:scale-110 active:scale-95 p-1 rounded-lg hover:bg-bg-shadow/50"
              aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <PanelLeft className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* ─── Scholar Profile (Compact) ──────────────── */}
        <button
          type="button"
          onClick={handleOpenProfile}
          className={`system-card w-full text-left transition-all duration-300 cursor-pointer hover:border-accent-primary/60 hover:shadow-[0_0_16px_var(--accent-primary-dim)] hover:scale-[1.02] active:scale-[0.98] group rounded-xl select-none focus:outline-none focus:ring-1 focus:ring-accent-primary ${
            isCollapsed ? "p-2 flex justify-center" : "p-3.5 block"
          }`}
          title="View Profile Card"
          aria-label="View Profile Card"
        >
          {isCollapsed ? (
            <div className="flex flex-col items-center gap-2">
              <div
                className="w-8 h-8 rounded-lg overflow-hidden border border-border-subtle group-hover:border-accent-primary-light bg-bg-abyss flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 group-hover:shadow-[0_0_10px_var(--accent-primary-dim)] transition-all duration-200"
                title={user.name || user.username || "Scholar"}
              >
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
            </div>
          ) : (
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-10 h-10 rounded-xl overflow-hidden border border-border-subtle group-hover:border-accent-primary-light bg-bg-abyss flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 group-hover:shadow-[0_0_12px_var(--accent-primary-dim)] transition-all duration-200">
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
                <p className="font-bold text-sm truncate group-hover:text-accent-primary-light transition-colors" style={{ color: "var(--text-primary)" }}>
                  {user.name || "Scholar"}
                </p>
                <p className="text-xs truncate" style={{ color: "var(--text-secondary)" }}>
                  {user.hunterRank}-Rank • Lv. {user.level}
                </p>
              </div>
            </div>
          )}
        </button>
      </div>

      {/* ─── Navigation ────────── */}
      <nav className="flex-1 flex flex-col justify-start mt-8 gap-1 px-4">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || (item.href === "/goals" && pathname === "/quests");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center rounded transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] ${
                isCollapsed ? "justify-center p-2" : "gap-3 px-3 py-2.5"
              }`}
              style={{
                color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                background: isActive ? "var(--accent-primary-dim)" : "transparent",
                borderLeft: isActive && !isCollapsed ? "2px solid var(--accent-primary)" : "2px solid transparent",
              }}
              title={isCollapsed ? item.label : undefined}
            >
              <span className="flex items-center justify-center transition-colors" style={isActive ? { color: 'var(--accent-primary-light)' } : undefined}>
                {item.icon}
              </span>
              {!isCollapsed && (
                <>
                  <span className="truncate" style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 600 }}>
                    {item.label}
                  </span>
                  {"badge" in item && item.badge && (
                    <span
                      className="ml-auto text-[8px] font-bold tracking-widest px-1.5 py-0.5 rounded border"
                      style={{
                        color: isActive ? "var(--accent-text-light)" : "var(--text-muted)",
                        background: "var(--accent-primary-dim)",
                        borderColor: "var(--accent-primary-mid)",
                      }}
                    >
                      {item.badge}
                    </span>
                  )}
                </>
              )}
            </Link>
          );
        })}
      </nav>

      {/* ─── Logout ──────────────────────────────────── */}
      <div className="px-4">
        <button
          onClick={logout}
          className={`flex items-center text-sm transition-all duration-200 w-full hover:bg-bg-shadow/50 hover:scale-[1.02] active:scale-[0.98] rounded ${
            isCollapsed ? "justify-center p-2" : "gap-2 px-3 py-2"
          }`}
          style={{
            color: "var(--text-muted)",
            fontFamily: "'Rajdhani', sans-serif",
            fontWeight: 600,
          }}
          title={isCollapsed ? "Logout" : undefined}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          {!isCollapsed && <span>Logout</span>}
        </button>
      </div>

      {/* ─── Mobile Drawer Notifications Full-Panel View ───────────── */}
      {mobile && (
        <AnimatePresence>
          {showNotifications && (
            <motion.div
              initial={{ opacity: 0, x: "100%" }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 350 }}
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
                      🔔
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
                    let badgeStyle = "bg-blue-500/20 text-blue-400 border-blue-500/30";

                    if (content.includes("[FRIEND_REQUEST]") || content.toLowerCase().includes("friend request")) {
                      badgeLabel = "FRIEND REQUEST";
                      badgeStyle = "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
                    } else if (content.includes("[GROUP_ADDED]") || content.toLowerCase().includes("added you to the group")) {
                      badgeLabel = "GROUP";
                      badgeStyle = "bg-purple-500/20 text-purple-400 border-purple-500/30";
                    } else if (content.includes("[DIRECT_MESSAGE]") || content.toLowerCase().includes("direct message")) {
                      badgeLabel = "DIRECT MESSAGE";
                      badgeStyle = "bg-sky-500/20 text-sky-400 border-sky-500/30";
                    } else if (content.includes("[GROUP_CHAT]") || content.toLowerCase().includes("group chat")) {
                      badgeLabel = "GROUP CHAT";
                      badgeStyle = "bg-purple-500/20 text-purple-400 border-purple-500/30";
                    } else if (content.includes("[ACHIEVEMENT]") || n.type === "REWARD") {
                      badgeLabel = "ACHIEVEMENT";
                      badgeStyle = "bg-amber-500/20 text-amber-400 border-amber-500/30";
                    } else if (n.type === "LEVEL_UP" || content.toLowerCase().includes("level up")) {
                      badgeLabel = "LEVEL UP";
                      badgeStyle = "bg-cyan-500/20 text-cyan-400 border-cyan-500/30";
                    } else if (n.type === "STREAK" || content.toLowerCase().includes("streak")) {
                      badgeLabel = "STREAK";
                      badgeStyle = "bg-amber-500/20 text-amber-400 border-amber-500/30";
                    } else if (n.type === "QUEST" || content.toLowerCase().includes("quest")) {
                      badgeLabel = "QUEST";
                      badgeStyle = "bg-cyan-500/20 text-cyan-400 border-cyan-500/30";
                    } else if (n.type === "WARNING") {
                      badgeLabel = "ALERT";
                      badgeStyle = "bg-red-500/20 text-red-400 border-red-500/30";
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
