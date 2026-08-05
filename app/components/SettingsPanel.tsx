"use client";

import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { useSettings } from "./SettingsContext";

/* ─── Settings Data ────────────────────────────────────────────── */

interface SettingsTile {
  key: string;
  label: string;
  icon: React.ReactNode;
  danger?: boolean;
  action?: "logout";
}

interface SettingsCategory {
  label: string;
  tiles: SettingsTile[];
}

const ICON_SIZE = "w-6 h-6";

const SETTINGS_CATEGORIES: SettingsCategory[] = [
  {
    label: "MAIN",
    tiles: [
      {
        key: "stats",
        label: "Stats",
        icon: (
          <svg className={ICON_SIZE} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13h4v8H3zM10 9h4v12h-4zM17 5h4v16h-4z" />
          </svg>
        ),
      },
      {
        key: "rankings",
        label: "Rankings",
        icon: (
          <svg className={ICON_SIZE} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 17l6-6 4 4 8-8M14 7h7v7" />
          </svg>
        ),
      },
      {
        key: "modes",
        label: "Modes",
        icon: (
          <svg className={ICON_SIZE} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        ),
      },
      {
        key: "calendar",
        label: "Calendar",
        icon: (
          <svg className={ICON_SIZE} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        ),
      },
    ],
  },
  {
    label: "APPEARANCE",
    tiles: [
      {
        key: "backgrounds",
        label: "Backgrounds",
        icon: (
          <svg className={ICON_SIZE} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        ),
      },
      {
        key: "themes",
        label: "Themes",
        icon: (
          <svg className={ICON_SIZE} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
          </svg>
        ),
      },
      {
        key: "badges",
        label: "Badges",
        icon: (
          <svg className={ICON_SIZE} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
          </svg>
        ),
      },
      {
        key: "avatars",
        label: "Avatars",
        icon: (
          <svg className={ICON_SIZE} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
        ),
      },
    ],
  },
  {
    label: "SYSTEM",
    tiles: [
      {
        key: "inventory",
        label: "Inventory",
        icon: (
          <svg className={ICON_SIZE} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
        ),
      },
      {
        key: "achievements",
        label: "Achievements",
        icon: (
          <svg className={ICON_SIZE} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
          </svg>
        ),
      },
      {
        key: "guide",
        label: "Guide",
        icon: (
          <svg className={ICON_SIZE} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        ),
      },
    ],
  },
  {
    label: "CONFIG",
    tiles: [
      {
        key: "account",
        label: "Account",
        icon: (
          <svg className={ICON_SIZE} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        ),
      },
      {
        key: "sync",
        label: "Sync",
        icon: (
          <svg className={ICON_SIZE} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        ),
      },
      {
        key: "notifications",
        label: "Alerts",
        icon: (
          <svg className={ICON_SIZE} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        ),
      },
      {
        key: "logout",
        label: "Logout",
        icon: (
          <svg className={ICON_SIZE} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        ),
        danger: true,
        action: "logout",
      },
    ],
  },
];

/* ─── Component ────────────────────────────────────────────── */

export default function SettingsPanel() {
  const { isOpen, openSettings, closeSettings, originRoute } = useSettings();
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuth();

  // Don't render on public pages or when user is not logged in
  const PUBLIC_PATHS = ["/", "/login", "/register", "/focus"];
  if (!user || PUBLIC_PATHS.includes(pathname)) return null;

  const handleClose = () => {
    closeSettings();
    // If we're currently on a /settings/* route, navigate back to the origin page
    if (pathname.startsWith("/settings")) {
      router.push(originRoute || "/dashboard");
    }
  };

  const handleTileClick = (tile: SettingsTile) => {
    if (tile.action === "logout") {
      closeSettings();
      logout();
      return;
    }
    closeSettings();
    router.push(`/settings/${tile.key}`);
  };

  // Calculate stagger delay for tile animations
  let globalTileIndex = 0;

  return (
    <>
      {/* Gear button moved to TopRightBar */}

      {/* ─── Full-Screen Overlay ──────────────────────── */}
      <div className={`settings-overlay ${isOpen ? "settings-open" : ""}`}>
        {/* Close button */}
        <button
          className="settings-close-btn"
          onClick={handleClose}
          aria-label="Close settings"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* ─── Settings Grid ──────────────────────────── */}
        <div
          style={{
            maxWidth: "860px",
            margin: "0 auto",
            padding: "80px 24px 60px",
          }}
        >
          {/* Panel title */}
          <div style={{ textAlign: "center", marginBottom: "40px" }}>
            <p
              style={{
                fontFamily: "'Rajdhani', sans-serif",
                fontWeight: 600,
                fontSize: "0.7rem",
                textTransform: "uppercase",
                letterSpacing: "0.25em",
                color: "var(--accent-cyan)",
                marginBottom: "8px",
              }}
            >
              System Interface
            </p>
            <h2
              style={{
                fontFamily: "'Rajdhani', sans-serif",
                fontWeight: 700,
                fontSize: "1.8rem",
                color: "var(--text-primary)",
                letterSpacing: "0.05em",
              }}
            >
              SETTINGS
            </h2>
          </div>

          {/* 2x2 Category Grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: "20px",
            }}
          >
            {SETTINGS_CATEGORIES.map((category) => (
              <div key={category.label} className="settings-category-card">
                <p className="settings-category-label">{category.label}</p>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, 1fr)",
                    gap: "10px",
                  }}
                >
                  {category.tiles.map((tile) => {
                    const tileDelay = globalTileIndex * 0.04;
                    globalTileIndex++;
                    return (
                      <button
                        key={tile.key}
                        className={`settings-tile ${tile.danger ? "settings-tile-danger" : ""}`}
                        onClick={() => handleTileClick(tile)}
                        style={{ animationDelay: `${tileDelay}s` }}
                      >
                        <span className="settings-tile-icon">{tile.icon}</span>
                        <span className="settings-tile-label">{tile.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
