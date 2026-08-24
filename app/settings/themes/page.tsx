"use client";

import { useState, useEffect } from "react";
import BackToSettings from "../../components/BackToSettings";
import { THEME_MAP, applyGlobalBackground } from "../../components/GlobalSystemWrapper";
import { useAuth } from "../../components/AuthProvider";
import { COSMETICS_CATALOG } from "@/lib/cosmetics-catalog";

/* ─── Types ────────────────────────────────────────────────── */

interface ThemeOption {
  id: string;
  name: string;
  description: string;
  color: string;       /* The main accent tint */
  colorLight: string;  /* The lighter shade */
}

const THEMES: ThemeOption[] = [
  {
    id: "cyberpunk",
    name: "Cyberpunk",
    description: "The default — electric purple across the entire UI.",
    color: "#7c3aed",
    colorLight: "#a78bfa",
  },
  {
    id: "sakura",
    name: "Sakura",
    description: "Soft, elegant pink with warm rose tones.",
    color: "#ec4899",
    colorLight: "#f9a8d4",
  },
  {
    id: "emerald",
    name: "Emerald",
    description: "Deep calming greens for focused concentration.",
    color: "#10b981",
    colorLight: "#6ee7b7",
  },
  {
    id: "crimson",
    name: "Crimson",
    description: "Intense fiery reds for high-energy sessions.",
    color: "#ef4444",
    colorLight: "#fca5a5",
  },
  {
    id: "amber",
    name: "Amber",
    description: "Warm, prestigious tones of gold — rewarding and bold.",
    color: "#f59e0b",
    colorLight: "#fcd34d",
  },
  {
    id: "abyss",
    name: "Abyss",
    description: "Ultra-cool indigo for immersive deep work.",
    color: "#6366f1",
    colorLight: "#a5b4fc",
  },
];

/* ─── Mini Dashboard Preview ───────────────────────────────── */

function MiniPreview({ theme }: { theme: ThemeOption }) {
  const c = theme.color;
  const cl = theme.colorLight;
  return (
    <div
      style={{
        background: "#0a0a14",
        borderRadius: "8px",
        padding: "12px",
        border: `1px solid ${c}20`,
        fontSize: "0",
        overflow: "hidden",
      }}
    >
      {/* Fake header bar */}
      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px" }}>
        <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#ef4444" }} />
        <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#f59e0b" }} />
        <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#22c55e" }} />
        <div style={{ flex: 1 }} />
        <div style={{ width: "20px", height: "3px", borderRadius: "2px", background: cl + "40" }} />
      </div>

      {/* Fake stat cards — both use the same tint */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", marginBottom: "8px" }}>
        <div style={{ background: c + "15", borderRadius: "4px", padding: "6px 8px", border: `1px solid ${c}20` }}>
          <div style={{ width: "12px", height: "2px", borderRadius: "1px", background: cl, marginBottom: "4px" }} />
          <div style={{ width: "24px", height: "3px", borderRadius: "1px", background: c + "60" }} />
        </div>
        <div style={{ background: c + "10", borderRadius: "4px", padding: "6px 8px", border: `1px solid ${c}15` }}>
          <div style={{ width: "12px", height: "2px", borderRadius: "1px", background: cl, marginBottom: "4px" }} />
          <div style={{ width: "18px", height: "3px", borderRadius: "1px", background: c + "50" }} />
        </div>
      </div>

      {/* Fake progress bar */}
      <div style={{ height: "4px", background: "rgba(255,255,255,0.05)", borderRadius: "2px", overflow: "hidden" }}>
        <div style={{ width: "65%", height: "100%", background: c, borderRadius: "2px" }} />
      </div>

      {/* Fake chart bars — all same colour family */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: "2px", height: "24px", marginTop: "8px" }}>
        {[40, 70, 55, 85, 30, 60, 90].map((h, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: `${h}%`,
              background: c + (i % 2 === 0 ? "50" : "30"),
              borderRadius: "1px 1px 0 0",
            }}
          />
        ))}
      </div>

      {/* Fake sidebar glow line */}
      <div style={{ marginTop: "8px", height: "2px", background: `linear-gradient(90deg, transparent, ${c}, transparent)`, opacity: 0.4 }} />
    </div>
  );
}

/* ─── Main Page ─────────────────────────────────────────────── */

export default function ThemesSettingsPage() {
  const { user, token, mutateUser } = useAuth();
  const [appliedThemeId, setAppliedThemeId] = useState<string>("cyberpunk");
  const [mode, setMode] = useState<"light" | "dark">("dark");
  const [showApplied, setShowApplied] = useState(false);
  const [cosmetics, setCosmetics] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const savedMode = localStorage.getItem("app_mode") as "light" | "dark";
    if (savedMode) setMode(savedMode);

    if (!token) return;
    
    fetch("/api/cosmetics", {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(async (res) => {
        if (!res.ok) return null;
        return res.json().catch(() => null);
      })
      .then((data) => {
        if (!data) return;
        setCosmetics(data.cosmetics || []);
        if (data.active?.activeTheme) {
          setAppliedThemeId(data.active.activeTheme);
        } else {
          const saved = localStorage.getItem("app_theme");
          if (saved && THEMES.find((t) => t.id === saved)) {
            setAppliedThemeId(saved);
          }
        }
      })
      .catch(console.error);
  }, [token]);

  const hasCosmetic = (itemKey: string) => {
    return true; // Temporarily unlocked for testing Light Mode
  };

  const handleToggleMode = (newMode: "light" | "dark") => {
    setMode(newMode);
    localStorage.setItem("app_mode", newMode);
    document.documentElement.setAttribute("data-mode", newMode);

    // Apply globally (painted on the viewport-fixed background layer)
    applyGlobalBackground(localStorage.getItem("app_background"), newMode);
    window.dispatchEvent(new Event("background-updated"));
  };

  const handleApplyTheme = async (theme: ThemeOption) => {
    if (!hasCosmetic(theme.id)) return;
    if (loading) return;
    
    setLoading(true);
    try {
      const res = await fetch("/api/cosmetics", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ category: "THEME", itemKey: theme.id })
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setAppliedThemeId(theme.id);
        localStorage.setItem("app_theme", theme.id);
        if (data.user) {
          mutateUser(data.user);
        }

        // Apply CSS variables globally
        const vars = THEME_MAP[theme.id];
        if (vars) {
          for (const [prop, val] of Object.entries(vars)) {
            document.documentElement.style.setProperty(prop, val);
          }
        }
        window.dispatchEvent(new Event("theme-updated"));

        setShowApplied(true);
        setTimeout(() => setShowApplied(false), 2000);
      }
    } catch (err) {
      console.error("Theme apply error:", err);
    } finally {
      setLoading(false);
    }
  };

  if (!user) return <div className="p-8 text-center text-gray-400">Loading...</div>;

  return (
    <div className="settings-page-container">
      <BackToSettings />

      <p className="settings-page-breadcrumb">Appearance → Themes</p>
      
      {/* Mode Toggle Section */}
      <h1 className="settings-page-header" style={{ marginBottom: "16px" }}>App Mode</h1>
      <div style={{ display: "flex", gap: "12px", marginBottom: "40px" }}>
        <button
          onClick={() => handleToggleMode("dark")}
          style={{
            flex: 1,
            padding: "16px",
            background: mode === "dark" ? "var(--accent-primary-dim)" : "var(--bg-panel)",
            border: `2px solid ${mode === "dark" ? "var(--accent-primary)" : "var(--border-subtle)"}`,
            borderRadius: "12px",
            color: "var(--text-primary)",
            fontFamily: "'Rajdhani', sans-serif",
            fontWeight: 700,
            fontSize: "1.1rem",
            cursor: "pointer",
            transition: "all 0.2s",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px"
          }}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
          DARK
        </button>
        <button
          onClick={() => handleToggleMode("light")}
          style={{
            flex: 1,
            padding: "16px",
            background: mode === "light" ? "var(--accent-primary-dim)" : "var(--bg-panel)",
            border: `2px solid ${mode === "light" ? "var(--accent-primary)" : "var(--border-subtle)"}`,
            borderRadius: "12px",
            color: "var(--text-primary)",
            fontFamily: "'Rajdhani', sans-serif",
            fontWeight: 700,
            fontSize: "1.1rem",
            cursor: "pointer",
            transition: "all 0.2s",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px"
          }}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
          LIGHT
        </button>
      </div>

      <h1 className="settings-page-header">App Tint</h1>

      <p
        style={{
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: "0.85rem",
          color: "var(--text-secondary)",
          marginBottom: "28px",
          lineHeight: 1.6,
        }}
      >
        Choose one accent colour. Every button, glow, border, and highlight across the
        entire app transforms to match — like iPhone tinting. Complete achievements to unlock more!
      </p>

      {/* Applied Toast */}
      {showApplied && (
        <div
          style={{
            position: "fixed",
            top: "24px",
            right: "24px",
            background: "rgba(34, 197, 94, 0.15)",
            border: "1px solid rgba(34, 197, 94, 0.3)",
            borderRadius: "8px",
            padding: "12px 20px",
            zIndex: 100,
            animation: "toastIn 0.3s ease forwards",
          }}
        >
          <p
            style={{
              fontFamily: "'Rajdhani', sans-serif",
              fontWeight: 700,
              fontSize: "0.85rem",
              color: "#22c55e",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Theme Applied!
          </p>
        </div>
      )}

      {/* Theme Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: "16px",
        }}
      >
        {THEMES.map((theme, i) => {
          const isApplied = theme.id === appliedThemeId;
          const unlocked = hasCosmetic(theme.id);
          const catalogInfo = COSMETICS_CATALOG.THEME.find(t => t.id === theme.id);

          return (
            <div
              key={theme.id}
              onClick={() => handleApplyTheme(theme)}
              style={{
                borderRadius: "10px",
                overflow: "hidden",
                border: isApplied
                  ? `2px solid ${theme.color}`
                  : "2px solid var(--border-subtle)",
                boxShadow: isApplied ? `0 0 25px ${theme.color}30` : "none",
                cursor: unlocked ? "pointer" : "not-allowed",
                transition: "all 0.3s ease",
                animation: `fadeInUp 0.4s ease forwards ${i * 0.06}s`,
                opacity: 0,
                position: "relative"
              }}
            >
              {/* Gradient Banner */}
              <div style={{ height: "5px", background: unlocked ? theme.color : "#444" }} />

              <div style={{ padding: "16px", background: "var(--bg-abyss)" }}>
                {/* Mini Preview */}
                <div style={{ opacity: unlocked ? 1 : 0.2, filter: unlocked ? "none" : "grayscale(100%) blur(1px)" }}>
                  <MiniPreview theme={theme} />
                </div>

                {/* Theme Info */}
                <div style={{ marginTop: "14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <h3
                      style={{
                        fontFamily: "'Rajdhani', sans-serif",
                        fontWeight: 700,
                        fontSize: "1rem",
                        color: isApplied ? theme.color : (unlocked ? "var(--text-primary)" : "var(--text-muted)"),
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        marginBottom: "2px",
                      }}
                    >
                      {theme.name}
                    </h3>
                    <p
                      style={{
                        fontFamily: "'Rajdhani', sans-serif",
                        fontSize: "0.72rem",
                        color: "var(--text-muted)",
                        lineHeight: 1.3,
                      }}
                    >
                      {theme.description}
                    </p>
                  </div>

                  {/* Status Indicator */}
                  <div
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "50%",
                      background: unlocked ? theme.color : "transparent",
                      border: "3px solid",
                      borderColor: unlocked ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.1)",
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: isApplied ? `0 0 12px ${theme.color}60` : "none",
                    }}
                  >
                    {isApplied && (
                      <svg className="w-4 h-4" fill="none" stroke="#000" viewBox="0 0 24 24" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    {!unlocked && (
                      <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    )}
                  </div>
                </div>
                
                {!unlocked && catalogInfo && (
                  <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                    <p style={{ fontSize: "0.7rem", fontFamily: "'Rajdhani', sans-serif", fontWeight: "bold", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
                      REQ: {catalogInfo.unlockCondition}
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes toastIn {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
