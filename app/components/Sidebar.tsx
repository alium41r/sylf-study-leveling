"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { useSettings } from "./SettingsContext";

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
  },
  {
    href: "/goals",
    label: "Goals",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
  {
    href: "/quests",
    label: "Quests",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
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
}

export default function Sidebar({ isCollapsed, setIsCollapsed }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout, token } = useAuth();
  const { openSettings } = useSettings();

  const [notifications, setNotifications] = useState<SystemMessage[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  // Close notifications on click outside
  useEffect(() => {
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
  }, [showNotifications]);

  // Poll for notifications
  useEffect(() => {
    if (!token || !user) return;
    
    const fetchNotifications = async () => {
      try {
        const res = await fetch("/api/notifications", {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setNotifications(data);
        }
      } catch (e) {
        console.error("Failed to fetch notifications", e);
      }
    };

    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [token, user]);

  if (!user) return null;

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleOpenNotifications = async () => {
    setShowNotifications(!showNotifications);
    if (!showNotifications && unreadCount > 0) {
      try {
        await fetch("/api/notifications", {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}` }
        });
        setNotifications(notifications.map(n => ({ ...n, read: true })));
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleClearNotifications = async () => {
    try {
      await fetch("/api/notifications", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      setNotifications([]);
    } catch (e) {
      console.error(e);
    }
  };

  const renderFormattedText = (text: string) => {
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="text-white font-bold">{part.slice(2, -2)}</strong>;
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <aside
      className="fixed left-0 top-0 h-full flex flex-col py-6 z-50 overflow-visible"
      style={{
        width: isCollapsed ? "var(--sidebar-collapsed-width)" : "var(--sidebar-width)",
        background: "var(--bg-panel)",
        borderRight: "1px solid var(--border-subtle)",
        transition: "width 0.3s ease",
      }}
    >
      {/* Top: Toggle + Profile Badge */}
      <div className="px-4">
        {/* Controls: Settings, Notifications, Toggle Button */}
        <div className={`flex ${isCollapsed ? "flex-col-reverse items-center gap-4" : "flex-row justify-between items-center"} mb-4 relative`}>
          <div className={`flex ${isCollapsed ? "flex-col gap-3" : "flex-row gap-2"}`}>
            {/* ─── Settings Gear ──────────────────────────────────── */}
            <button
              className="pointer-events-auto w-10 h-10 flex items-center justify-center bg-[#141432]/70 backdrop-blur-md border border-white/10 rounded-lg text-gray-400 hover:text-[#a78bfa] hover:border-[#a78bfa] hover:shadow-[0_0_16px_rgba(124,58,237,0.15)] hover:rotate-45 transition-all duration-300"
              onClick={openSettings}
              aria-label="Open settings"
              title="Settings"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            {/* ─── Notification Bell ──────────────────────────────── */}
            <div className="relative pointer-events-auto" ref={notifRef}>
              <button
                className={`w-10 h-10 flex items-center justify-center bg-[#141432]/70 backdrop-blur-md border rounded-lg transition-all duration-300 ${
                  showNotifications ? "border-cyan-400 text-cyan-400" : "border-white/10 text-gray-400 hover:text-cyan-400 hover:border-cyan-400 hover:shadow-[0_0_16px_rgba(6,182,212,0.15)]"
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

              {/* ─── Notifications Dropdown ────────────────────────── */}
              {showNotifications && (
                <div className={`absolute ${isCollapsed ? 'top-0 left-12' : 'top-12 left-0'} w-80 max-h-96 overflow-y-auto bg-[#0a0a0f] border border-[#1f1f3a] shadow-2xl rounded-lg p-2 custom-scrollbar animate-fade-in-down z-[100]`}>
                  <div className="flex items-center justify-between p-2 mb-1 border-b border-white/5">
                    <h3 className="text-xs tracking-widest text-[#a78bfa] font-['Rajdhani']">
                      SYSTEM NOTIFICATIONS
                    </h3>
                    {notifications.length > 0 && (
                      <button 
                        onClick={handleClearNotifications}
                        className="text-[10px] text-gray-500 hover:text-red-400 transition-colors font-bold tracking-wider"
                      >
                        CLEAR ALL
                      </button>
                    )}
                  </div>
                  {notifications.length === 0 ? (
                    <p className="text-sm text-gray-500 p-4 text-center">No recent messages.</p>
                  ) : (
                    <div className="flex flex-col">
                      {notifications.map((n, idx) => (
                        <div key={n.id}>
                          <div className={`p-3 rounded border-transparent text-sm ${!n.read ? "bg-cyan-900/10" : "bg-transparent"}`}>
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                n.type === "WARNING" ? "bg-red-500/20 text-red-400" : 
                                n.type === "REWARD" ? "bg-yellow-500/20 text-yellow-400" :
                                n.type === "LEVEL_UP" ? "bg-purple-500/20 text-purple-400" :
                                n.type === "STREAK" ? "bg-yellow-500/20 text-yellow-400" :
                                "bg-blue-500/20 text-blue-400"
                              }`}>
                                {n.type}
                              </span>
                              <span className="text-xs text-gray-500">{new Date(n.createdAt).toLocaleDateString()}</span>
                            </div>
                            <p className="text-gray-300 whitespace-pre-wrap leading-tight">{renderFormattedText(n.content)}</p>
                          </div>
                          {idx < notifications.length - 1 && (
                            <hr className="border-white/10 my-1 mx-2" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          
          {/* Toggle Button */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
              style={{
                transform: isCollapsed ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.3s ease",
              }}
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>

        {/* ─── Scholar Profile (Compact) ──────────────── */}
        <div className={`system-card transition-all duration-300 ${isCollapsed ? "p-2" : "p-4"}`}>
          {isCollapsed ? (
            <div className="flex flex-col items-center gap-2">
              <div className={`rank-badge rank-${user.hunterRank} w-8 h-8 text-sm`}>
                {user.hunterRank}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className={`rank-badge rank-${user.hunterRank}`}>
                {user.hunterRank}
              </div>
              <div>
                <p className="font-bold text-sm truncate w-32" style={{ color: "var(--text-primary)" }}>
                  {user.name || "Scholar"}
                </p>
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  {user.hunterRank}-Rank • Lv. {user.level}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Navigation ────────── */}
      <nav className="flex-1 flex flex-col justify-start mt-8 gap-1 px-4">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center rounded transition-all duration-200 ${
                isCollapsed ? "justify-center p-2" : "gap-3 px-3 py-2.5"
              }`}
              style={{
                color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                background: isActive ? "var(--accent-primary-dim)" : "transparent",
                borderLeft: isActive && !isCollapsed ? "2px solid var(--accent-primary)" : "2px solid transparent",
              }}
              title={isCollapsed ? item.label : undefined}
            >
              <span className="flex items-center justify-center" style={isActive && isCollapsed ? { color: 'var(--accent-primary-light)' } : undefined}>
                {item.icon}
              </span>
              {!isCollapsed && (
                <span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 600 }}>
                  {item.label}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* ─── Logout ──────────────────────────────────── */}
      <div className="px-4">
        <button
          onClick={logout}
          className={`flex items-center text-sm transition-all duration-200 w-full hover:bg-white/5 rounded ${
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
    </aside>
  );
}
