"use client";

import BackToSettings from "../../components/BackToSettings";
import { useState, useEffect } from "react";

/* ─── Types ────────────────────────────────────────────────── */

interface Badge {
  id: string;
  name: string;
  description: string;
  color: string;
  isUnlocked: boolean;
  unlockCondition: string;
  icon: React.ReactNode;
}

const BADGES: Badge[] = [
  {
    id: "novice_hunter",
    name: "Novice Hunter",
    description: "Completed your first study session.",
    color: "#06b6d4", // Cyan
    isUnlocked: true,
    unlockCondition: "Complete 1 study session",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-10 h-10">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 2l3 6.5 7 1-5 5 1.5 7-6.5-3.5L5.5 21.5 7 14.5l-5-5 7-1z" />
      </svg>
    ),
  },
  {
    id: "focus_master",
    name: "Focus Master",
    description: "Maintained a single session for over 2 hours.",
    color: "#7c3aed", // Purple
    isUnlocked: true,
    unlockCondition: "Study for 120+ minutes straight",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-10 h-10">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
  },
  {
    id: "streak_god",
    name: "Streak God",
    description: "Hit a 30-day study streak.",
    color: "#f59e0b", // Amber
    isUnlocked: false,
    unlockCondition: "Reach a 30-day streak",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-10 h-10">
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
      </svg>
    ),
  },
  {
    id: "night_owl",
    name: "Night Owl",
    description: "Completed 10 sessions after midnight.",
    color: "#6366f1", // Indigo
    isUnlocked: false,
    unlockCondition: "Study after 12:00 AM (10 times)",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-10 h-10">
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
      </svg>
    ),
  },
  {
    id: "iron_will",
    name: "Iron Will",
    description: "Studied for 40 hours in a single week.",
    color: "#ef4444", // Red
    isUnlocked: false,
    unlockCondition: "40 hrs study time in 1 week",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-10 h-10">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
  {
    id: "scholar_king",
    name: "Scholar King",
    description: "Mastered all subjects and reached max level.",
    color: "#10b981", // Emerald
    isUnlocked: false,
    unlockCondition: "Reach Level S-Rank",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-10 h-10">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
      </svg>
    ),
  },
];

/* ─── Badge Card Component ──────────────────────────────────── */

function BadgeCard({
  badge,
  isActive,
  onEquip,
  delay,
}: {
  badge: Badge;
  isActive: boolean;
  onEquip: () => void;
  delay: number;
}) {
  const [rotateX, setRotateX] = useState(0);
  const [rotateY, setRotateY] = useState(0);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!badge.isUnlocked) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateXValue = ((y - centerY) / centerY) * -15;
    const rotateYValue = ((x - centerX) / centerX) * 15;
    setRotateX(rotateXValue);
    setRotateY(rotateYValue);
  };

  const handleMouseLeave = () => {
    setRotateX(0);
    setRotateY(0);
  };

  return (
    <div
      onClick={() => badge.isUnlocked && onEquip()}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="system-card"
      style={{
        padding: "24px 20px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        cursor: badge.isUnlocked ? "pointer" : "default",
        border: isActive ? `1px solid ${badge.color}` : "1px solid rgba(255,255,255,0.05)",
        background: isActive ? `${badge.color}15` : badge.isUnlocked ? "var(--bg-panel)" : "rgba(20,20,25,0.6)",
        boxShadow: isActive ? `0 0 30px ${badge.color}30` : "none",
        transition: "transform 0.1s ease-out, background 0.3s ease",
        transform: `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) ${isActive ? "scale(1.02)" : "scale(1)"}`,
        animation: `fadeInUp 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards ${delay}s`,
        opacity: 0,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Locked Overlay / Grayscale Effect on contents */}
      <div style={{
        filter: badge.isUnlocked ? "none" : "grayscale(100%) opacity(0.5)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        width: "100%",
        pointerEvents: "none",
      }}>
        {/* Badge Icon */}
        <div style={{
          width: "70px",
          height: "70px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: isActive ? badge.color : badge.isUnlocked ? "var(--text-primary)" : "var(--text-muted)",
          marginBottom: "16px",
          filter: badge.isUnlocked ? `drop-shadow(0 0 10px ${badge.color}40)` : "none",
        }}>
          {badge.icon}
        </div>

        {/* Info */}
        <h3 style={{
          fontFamily: "'Rajdhani', sans-serif",
          fontWeight: 700,
          fontSize: "1.1rem",
          color: isActive ? badge.color : "var(--text-primary)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: "4px",
        }}>
          {badge.name}
        </h3>

        <p style={{
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: "0.75rem",
          color: "var(--text-muted)",
          marginBottom: "16px",
          minHeight: "36px",
        }}>
          {badge.description}
        </p>
      </div>

      {/* Footer Element */}
      {!badge.isUnlocked ? (
        <div style={{
          marginTop: "auto",
          width: "100%",
          padding: "8px",
          borderRadius: "4px",
          background: "rgba(0,0,0,0.3)",
          border: "1px dashed rgba(255,255,255,0.1)",
        }}>
          <p style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: "0.65rem",
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "4px",
          }}>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            {badge.unlockCondition}
          </p>
        </div>
      ) : (
        <div style={{
          marginTop: "auto",
          padding: "6px 16px",
          borderRadius: "20px",
          background: isActive ? badge.color : "rgba(255,255,255,0.03)",
          color: isActive ? "#000" : "var(--text-muted)",
          fontFamily: "'Rajdhani', sans-serif",
          fontWeight: 700,
          fontSize: "0.7rem",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          transition: "all 0.3s ease",
        }}>
          {isActive ? "Equipped" : "Equip Title"}
        </div>
      )}
    </div>
  );
}

/* ─── Main Page ─────────────────────────────────────────────── */

export default function BadgesSettingsPage() {
  const [activeBadgeId, setActiveBadgeId] = useState<string>("novice_hunter");

  useEffect(() => {
    const saved = localStorage.getItem("app_badge");
    if (saved && BADGES.find((b) => b.id === saved)) {
      setActiveBadgeId(saved);
    }
  }, []);

  const handleEquipBadge = (badge: Badge) => {
    setActiveBadgeId(badge.id);
    localStorage.setItem("app_badge", badge.id);
  };

  return (
    <div className="settings-page-container">
      <BackToSettings />

      <p className="settings-page-breadcrumb">Appearance → Badges</p>
      <h1 className="settings-page-header">Titles & Badges</h1>
      
      <p style={{
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: "0.85rem",
        color: "var(--text-secondary)",
        marginBottom: "24px",
        lineHeight: 1.6,
      }}>
        Equip a title to display alongside your name on leaderboards and profile cards. Complete quests and maintain streaks to unlock more.
      </p>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
        gap: "16px",
        perspective: "1000px", // Important for 3D tilt
      }}>
        {BADGES.map((badge, i) => (
          <BadgeCard
            key={badge.id}
            badge={badge}
            isActive={badge.id === activeBadgeId}
            onEquip={() => handleEquipBadge(badge)}
            delay={i * 0.1}
          />
        ))}
      </div>

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
