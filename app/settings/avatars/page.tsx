"use client";

import BackToSettings from "../../components/BackToSettings";
import { useState, useEffect } from "react";

/* ─── Types ────────────────────────────────────────────────── */

interface AvatarClass {
  id: string;
  name: string;
  role: string;
  description: string;
  color: string;
  icon: React.ReactNode;
}

const AVATARS: AvatarClass[] = [
  {
    id: "scholar",
    name: "The Scholar",
    role: "Balanced Focus",
    description: "Consistent and disciplined. Thrives in long, steady sessions.",
    color: "#06b6d4", // Cyan
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-12 h-12">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
  },
  {
    id: "mage",
    name: "Arcane Mage",
    role: "Deep Work",
    description: "Channels extreme focus into single bursts of high productivity.",
    color: "#7c3aed", // Purple
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-12 h-12">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
      </svg>
    ),
  },
  {
    id: "warrior",
    name: "Iron Warrior",
    role: "Relentless Grind",
    description: "Unbreakable endurance. Never misses a day in the streak.",
    color: "#ef4444", // Red
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-12 h-12">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    ),
  },
  {
    id: "rogue",
    name: "Shadow Rogue",
    role: "Sprint Master",
    description: "Quick, effective, and stealthy. Specializes in short intense sprints.",
    color: "#f59e0b", // Amber
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-12 h-12">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
  {
    id: "druid",
    name: "Forest Druid",
    role: "Adaptive Flow",
    description: "Stays calm under pressure, adapting seamlessly to any subject.",
    color: "#10b981", // Emerald
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-12 h-12">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
      </svg>
    ),
  },
  {
    id: "monk",
    name: "Zen Monk",
    role: "Perfect Consistency",
    description: "Embraces routine. Maintains perfect balance in all stats.",
    color: "#6366f1", // Indigo
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-12 h-12">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
  },
];

/* ─── Main Page ─────────────────────────────────────────────── */

export default function AvatarsSettingsPage() {
  const [activeAvatarId, setActiveAvatarId] = useState<string>("scholar");
  const [hoveredAvatar, setHoveredAvatar] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("app_avatar");
    if (saved && AVATARS.find((a) => a.id === saved)) {
      setActiveAvatarId(saved);
    }
  }, []);

  const handleSelectAvatar = async (avatar: AvatarClass) => {
    // Optimistic UI Update
    setActiveAvatarId(avatar.id);
    localStorage.setItem("app_avatar", avatar.id);

    // Asynchronous backend sync
    try {
      await fetch("/api/user/avatar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarId: avatar.id }),
      });
    } catch (err) {
      console.error("Failed to sync avatar:", err);
    }
  };

  return (
    <div className="settings-page-container">
      <BackToSettings />

      <p className="settings-page-breadcrumb">Appearance → Avatars</p>
      <h1 className="settings-page-header">Select Avatar</h1>
      
      <p style={{
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: "0.85rem",
        color: "var(--text-secondary)",
        marginBottom: "24px",
        lineHeight: 1.6,
      }}>
        Choose your class avatar. This represents your profile across the global rankings and friend lists.
      </p>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
        gap: "20px",
      }}>
        {AVATARS.map((avatar, i) => {
          const isActive = avatar.id === activeAvatarId;
          const isHovered = avatar.id === hoveredAvatar;
          
          return (
            <div
              key={avatar.id}
              onClick={() => handleSelectAvatar(avatar)}
              onMouseEnter={() => setHoveredAvatar(avatar.id)}
              onMouseLeave={() => setHoveredAvatar(null)}
              className="system-card"
              style={{
                padding: "24px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                textAlign: "center",
                cursor: "pointer",
                border: isActive ? `1px solid ${avatar.color}` : "1px solid rgba(255,255,255,0.05)",
                background: isActive ? `${avatar.color}10` : "var(--bg-panel)",
                boxShadow: isActive ? `0 0 25px ${avatar.color}25` : isHovered ? "0 8px 24px rgba(0,0,0,0.6)" : "none",
                transform: isHovered && !isActive ? "translateY(-6px)" : "translateY(0)",
                transition: "all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
                animation: `fadeInScale 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards ${i * 0.1}s`,
                opacity: 0,
              }}
            >
              {/* Avatar Icon Container */}
              <div style={{
                position: "relative",
                width: "90px",
                height: "90px",
                marginBottom: "20px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: isActive ? avatar.color : "var(--text-primary)",
              }}>
                {/* Rotating Border for Active State */}
                <div style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: "50%",
                  border: `2px dashed ${isActive ? avatar.color : "transparent"}`,
                  animation: isActive ? "spin 12s linear infinite" : "none",
                  opacity: isActive ? 0.6 : 0,
                }} />
                
                {/* Solid Background Circle */}
                <div style={{
                  position: "absolute",
                  inset: "8px",
                  borderRadius: "50%",
                  background: isActive ? `${avatar.color}20` : "rgba(255,255,255,0.05)",
                  transition: "background 0.3s ease",
                }} />

                {/* The SVG Icon */}
                <div style={{ position: "relative", zIndex: 2, transform: isHovered ? "scale(1.1)" : "scale(1)", transition: "transform 0.3s ease" }}>
                  {avatar.icon}
                </div>
              </div>

              {/* Class Info */}
              <h3 style={{
                fontFamily: "'Rajdhani', sans-serif",
                fontWeight: 700,
                fontSize: "1.2rem",
                color: isActive ? avatar.color : "var(--text-primary)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: "4px",
              }}>
                {avatar.name}
              </h3>
              
              <p style={{
                fontFamily: "'Rajdhani', sans-serif",
                fontWeight: 600,
                fontSize: "0.75rem",
                color: avatar.color,
                textTransform: "uppercase",
                letterSpacing: "0.15em",
                marginBottom: "12px",
              }}>
                {avatar.role}
              </p>
              
              <p style={{
                fontFamily: "'Rajdhani', sans-serif",
                fontSize: "0.8rem",
                color: "var(--text-muted)",
                lineHeight: 1.5,
              }}>
                {avatar.description}
              </p>

              {/* Active Badge */}
              <div style={{
                marginTop: "16px",
                padding: "6px 16px",
                borderRadius: "20px",
                background: isActive ? avatar.color : "rgba(255,255,255,0.03)",
                color: isActive ? "#000" : "var(--text-muted)",
                fontFamily: "'Rajdhani', sans-serif",
                fontWeight: 700,
                fontSize: "0.7rem",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                transition: "all 0.3s ease",
                opacity: isActive || isHovered ? 1 : 0,
                transform: isActive || isHovered ? "translateY(0)" : "translateY(10px)",
              }}>
                {isActive ? "Equipped" : "Select"}
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes fadeInScale {
          from { opacity: 0; transform: scale(0.9) translateY(20px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
