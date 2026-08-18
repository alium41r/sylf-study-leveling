"use client";

import BackToSettings from "../../components/BackToSettings";

export default function CalendarSettingsPage() {
  return (
    <div className="settings-page-container">
      <BackToSettings />

      <p className="settings-page-breadcrumb">Appearance → Calendar</p>
      <h1 className="settings-page-header">Calendar Customization</h1>

      <div className="system-card" style={{ padding: "40px 20px", textAlign: "center", marginTop: "24px" }}>
        <div style={{
          width: "64px",
          height: "64px",
          borderRadius: "50%",
          background: "var(--accent-primary-dim)",
          border: "1px solid var(--accent-primary-mid)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 24px",
          color: "var(--accent-primary)"
        }}>
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        
        <h2 style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: "1.5rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "12px" }}>
          Calendar Customization
        </h2>
        
        <p style={{ color: "var(--text-secondary)", maxWidth: "500px", margin: "0 auto 32px", lineHeight: 1.6 }}>
          Advanced personalization options for your Study Calendar are currently in development. Soon, you will be able to customize themes, apply color coding, toggle heatmaps, create custom tags, and configure your preferred display settings here.
        </p>

        <div style={{ display: "flex", justifyContent: "center", gap: "12px", flexWrap: "wrap" }}>
          {["Themes", "Color Coding", "Heatmaps", "Custom Tags"].map((feature) => (
            <span key={feature} style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid var(--border-subtle)",
              padding: "6px 12px",
              borderRadius: "20px",
              fontSize: "0.8rem",
              fontFamily: "'Rajdhani', sans-serif",
              color: "var(--text-muted)",
              letterSpacing: "0.05em"
            }}>
              {feature}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
