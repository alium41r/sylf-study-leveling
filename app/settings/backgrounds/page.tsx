"use client";

import { useState, useEffect } from "react";
import BackToSettings from "../../components/BackToSettings";
import { BG_MAP, applyGlobalBackground } from "../../components/GlobalSystemWrapper";
import { useAuth } from "@/app/components/AuthProvider";
import { COSMETICS_CATALOG } from "@/lib/cosmetics-catalog";
import { fetchCachedJSON } from "@/lib/client-data-cache";

/* ─── Types ────────────────────────────────────────────────── */

interface BackgroundOption {
  id: string;
  name: string;
  description: string;
  category: "gradient" | "pattern" | "ambient";
}

const BACKGROUNDS: BackgroundOption[] = [
  {
    id: "void",
    name: "The Void",
    description: "Pure, distraction-free darkness. The original.",
    category: "gradient",
  },
  {
    id: "cyber-grid",
    name: "Cyber Grid",
    description: "Tron-inspired digital grid lines pulsing beneath the surface.",
    category: "pattern",
  },
  {
    id: "sakura-fall",
    name: "Sakura Dusk",
    description: "A warm rose glow fading into the dark — gentle and meditative.",
    category: "ambient",
  },
  {
    id: "abyssal-glow",
    name: "Abyssal Glow",
    description: "A deep purple nebula radiating from the center of the screen.",
    category: "ambient",
  },
  {
    id: "neon-sunrise",
    name: "Neon Sunrise",
    description: "Fiery warm tones rising from the bottom edge — dawn of a new session.",
    category: "gradient",
  },
  {
    id: "matrix-rain",
    name: "Digital Rain",
    description: "Subtle cascading green lines — pure hacker aesthetic.",
    category: "pattern",
  },
  {
    id: "aurora-borealis",
    name: "Aurora Borealis",
    description: "Shimmering cyan and purple light drifting across the northern sky.",
    category: "ambient",
  },
  {
    id: "deep-ocean",
    name: "Deep Ocean",
    description: "Cool blue bioluminescence glowing from the ocean floor.",
    category: "ambient",
  },
];

const CATEGORY_LABELS: Record<string, string> = {
  gradient: "Gradients",
  pattern: "Patterns",
  ambient: "Ambient",
};

/* ─── Main Page ─────────────────────────────────────────────── */

export default function BackgroundsSettingsPage() {
  const { user, token, mutateUser } = useAuth();
  const [activeBgId, setActiveBgId] = useState<string>("void");
  const [appliedBgId, setAppliedBgId] = useState<string>("void");
  const [showApplied, setShowApplied] = useState(false);
  const [hoveredBg, setHoveredBg] = useState<string | null>(null);
  const [mode, setMode] = useState<"light" | "dark">("dark");
  
  const [cosmetics, setCosmetics] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const savedMode = localStorage.getItem("app_mode") as "light" | "dark";
    if (savedMode) setMode(savedMode);

    if (!token) return;
    
    // Stale-while-revalidate: reopening backgrounds paints instantly.
    fetchCachedJSON<{ cosmetics?: any[]; active?: { activeBackground?: string | null } }>(
      "/api/cosmetics",
      { headers: { Authorization: `Bearer ${token}` } },
      { ttlMs: 30_000, staleMs: 120_000, storageKey: "cosmetics:owned" }
    )
      .then((data) => {
        if (!data) return;
        setCosmetics(data.cosmetics || []);
        if (data.active?.activeBackground) {
          setActiveBgId(data.active.activeBackground);
          setAppliedBgId(data.active.activeBackground);
        } else {
          const saved = localStorage.getItem("app_background");
          if (saved && BG_MAP[saved]) {
            setActiveBgId(saved);
            setAppliedBgId(saved);
          }
        }
      })
      .catch(console.error);
  }, [token]);

  const hasCosmetic = (itemKey: string) => {
    return true; // Temporarily unlocked for testing Light Mode
  };

  const handleApplyBackground = async (bg: BackgroundOption) => {
    if (!hasCosmetic(bg.id)) return;
    if (loading) return;
    
    setLoading(true);
    try {
      const res = await fetch("/api/cosmetics", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ category: "BACKGROUND", itemKey: bg.id })
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setActiveBgId(bg.id);
        setAppliedBgId(bg.id);
        localStorage.setItem("app_background", bg.id);
        if (data.user) {
          mutateUser(data.user);
        }

        // Apply globally (painted on the viewport-fixed background layer)
        if (BG_MAP[bg.id]) {
          applyGlobalBackground(bg.id, mode);
        }
        window.dispatchEvent(new Event("background-updated"));

        setShowApplied(true);
        setTimeout(() => setShowApplied(false), 2000);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Group backgrounds by category
  const categories = ["gradient", "pattern", "ambient"];

  if (!user) return <div className="p-8 text-center text-gray-400">Loading...</div>;

  return (
    <div className="settings-page-container">
      <BackToSettings />

      <p className="settings-page-breadcrumb">Appearance → Backgrounds</p>
      <h1 className="settings-page-header">Wallpapers</h1>

      <p
        style={{
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: "0.85rem",
          color: "var(--text-secondary)",
          marginBottom: "28px",
          lineHeight: 1.6,
        }}
      >
        Set the atmosphere. Each wallpaper applies a subtle environmental backdrop across the entire app. Unlocked by reaching higher Hunter ranks.
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
            Wallpaper Applied!
          </p>
        </div>
      )}

      {/* Wallpapers by Category */}
      {categories.map((cat) => {
        const items = BACKGROUNDS.filter((bg) => bg.category === cat);
        if (items.length === 0) return null;

        return (
          <div key={cat} style={{ marginBottom: "32px" }}>
            <h2
              style={{
                fontFamily: "'Rajdhani', sans-serif",
                fontWeight: 700,
                fontSize: "0.75rem",
                textTransform: "uppercase",
                letterSpacing: "0.2em",
                color: "var(--accent-cyan)",
                marginBottom: "14px",
              }}
            >
              {CATEGORY_LABELS[cat]}
            </h2>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                gap: "16px",
              }}
            >
              {items.map((bg, i) => {
                const isApplied = bg.id === appliedBgId;
                const isHovered = bg.id === hoveredBg;
                const bgData = BG_MAP[bg.id];
                const unlocked = hasCosmetic(bg.id);
                const catalogInfo = COSMETICS_CATALOG.BACKGROUND.find(c => c.id === bg.id);

                return (
                  <div
                    key={bg.id}
                    onMouseEnter={() => setHoveredBg(bg.id)}
                    onMouseLeave={() => setHoveredBg(null)}
                    style={{
                      borderRadius: "10px",
                      overflow: "hidden",
                      border: isApplied
                        ? "2px solid var(--accent-cyan)"
                        : "2px solid var(--border-subtle)",
                      boxShadow: isApplied
                        ? "0 0 20px rgba(6, 182, 212, 0.2)"
                        : isHovered
                        ? "0 8px 32px rgba(0,0,0,0.2)"
                        : "none",
                      transform: isHovered ? "translateY(-4px) scale(1.01)" : "translateY(0) scale(1)",
                      transition: "all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)",
                      animation: `fadeInUp 0.5s ease forwards ${i * 0.1}s`,
                      opacity: 0,
                    }}
                  >
                    {/* Large Preview Area */}
                    <div
                      style={{
                        height: "180px",
                        backgroundImage: mode === "light" ? bgData?.lightValue : bgData?.value,
                        backgroundColor: mode === "light" ? "#f8fafc" : "#0a0a0f",
                        backgroundSize: bgData?.size || "cover",
                        position: "relative",
                        overflow: "hidden",
                        opacity: unlocked ? 1 : 0.2,
                        filter: unlocked ? "none" : "grayscale(100%)",
                      }}
                    >
                      {/* Animated overlay shimmer on hover */}
                      {unlocked && (
                        <div
                          style={{
                            position: "absolute",
                            inset: 0,
                            background: "linear-gradient(135deg, rgba(255,255,255,0.03) 0%, transparent 50%, rgba(255,255,255,0.02) 100%)",
                            opacity: isHovered ? 1 : 0,
                            transition: "opacity 0.4s ease",
                          }}
                        />
                      )}

                      {/* Category Chip */}
                      <div
                        style={{
                          position: "absolute",
                          top: "10px",
                          left: "10px",
                          padding: "3px 10px",
                          borderRadius: "12px",
                          background: "rgba(0,0,0,0.6)",
                          backdropFilter: "blur(8px)",
                          border: "1px solid rgba(255,255,255,0.1)",
                        }}
                      >
                        <span
                          style={{
                            fontFamily: "'Rajdhani', sans-serif",
                            fontSize: "0.6rem",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.1em",
                            color: "var(--text-secondary)",
                          }}
                        >
                          {bg.category}
                        </span>
                      </div>

                      {/* Applied check overlay */}
                      {isApplied && (
                        <div
                          style={{
                            position: "absolute",
                            top: "10px",
                            right: "10px",
                            width: "28px",
                            height: "28px",
                            borderRadius: "50%",
                            background: "var(--accent-cyan)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#000",
                            boxShadow: "0 0 12px rgba(6, 182, 212, 0.4)",
                          }}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      )}
                      
                      {/* Locked Icon overlay */}
                      {!unlocked && (
                         <div style={{
                           position: "absolute",
                           top: "50%",
                           left: "50%",
                           transform: "translate(-50%, -50%)",
                           display: "flex",
                           flexDirection: "column",
                           alignItems: "center",
                           color: "rgba(255,255,255,0.6)"
                         }}>
                           <svg className="w-8 h-8 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                         </div>
                      )}
                    </div>

                    {/* Info + Apply */}
                    <div
                      style={{
                        padding: "16px 18px",
                        background: "var(--bg-panel)",
                        borderTop: "1px solid var(--border-subtle)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                        <h3
                          style={{
                            fontFamily: "'Rajdhani', sans-serif",
                            fontWeight: 700,
                            fontSize: "1rem",
                            color: isApplied ? "var(--accent-cyan)" : (unlocked ? "var(--text-primary)" : "var(--text-muted)"),
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                          }}
                        >
                          {bg.name}
                        </h3>
                      </div>

                      <p
                        style={{
                          fontFamily: "'Rajdhani', sans-serif",
                          fontSize: "0.75rem",
                          color: "var(--text-secondary)",
                          marginBottom: "14px",
                          lineHeight: 1.4,
                        }}
                      >
                        {bg.description}
                      </p>

                      {unlocked ? (
                        <button
                          onClick={() => handleApplyBackground(bg)}
                          style={{
                            width: "100%",
                            padding: "9px",
                            borderRadius: "6px",
                            border: isApplied ? "none" : "1px solid var(--accent-cyan)",
                            background: isApplied ? "var(--accent-cyan)" : "rgba(6, 182, 212, 0.1)",
                            color: isApplied ? "#000" : "var(--accent-cyan)",
                            fontFamily: "'Rajdhani', sans-serif",
                            fontWeight: 700,
                            fontSize: "0.78rem",
                            textTransform: "uppercase",
                            letterSpacing: "0.1em",
                            cursor: "pointer",
                            transition: "all 0.3s ease",
                          }}
                        >
                          {isApplied ? "✓ Applied" : "Apply Wallpaper"}
                        </button>
                      ) : (
                        <div style={{
                          width: "100%",
                          padding: "9px",
                          borderRadius: "6px",
                          background: "var(--bg-shadow)",
                          border: "1px solid var(--border-subtle)",
                          textAlign: "center"
                        }}>
                          <p style={{ fontSize: "0.75rem", fontFamily: "'Rajdhani', sans-serif", fontWeight: "bold", letterSpacing: "0.1em", color: "var(--text-muted)" }}>
                            REQ: {catalogInfo?.unlockCondition || "Unknown"}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(16px); }
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
