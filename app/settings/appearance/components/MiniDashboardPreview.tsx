"use client";

import React from "react";
import {
  getBackgroundTokens,
  getSafeAccentText,
} from "@/lib/color-utils";
import {
  Home,
  Target,
  BarChart2,
  Users,
  Calendar,
  Settings,
  Sparkles,
  Flame,
  User,
  ChevronsUp,
  Clock,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";

interface MiniDashboardPreviewProps {
  mode: "light" | "dark";
  accentHex: string;
  canvasHex: string;
}

export function MiniDashboardPreview({
  mode,
  accentHex,
  canvasHex,
}: MiniDashboardPreviewProps) {
  // Derive full canonical appearance token set matching the live app
  const bgTokens = getBackgroundTokens(canvasHex, mode);
  const safeAccentOnCard = getSafeAccentText(accentHex, bgTokens["--surface-1"]);

  return (
    <div
      className="relative overflow-hidden rounded-2xl border shadow-2xl transition-all duration-300 select-none flex"
      style={{
        backgroundColor: canvasHex,
        borderColor: bgTokens["--border-subtle"],
        color: bgTokens["--text-primary"],
      }}
    >
      {/* Top ambient highlight line */}
      <div
        className="absolute top-0 left-0 right-0 h-[2px] opacity-80 pointer-events-none z-20"
        style={{
          background: `linear-gradient(90deg, transparent 5%, ${accentHex} 50%, transparent 95%)`,
        }}
        aria-hidden="true"
      />

      {/* Subtle ambient stars in background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-35 z-0" aria-hidden="true">
        <span
          className="absolute top-8 left-[51%] w-1 h-1 rounded-full animate-pulse"
          style={{ backgroundColor: accentHex, boxShadow: `0 0 6px ${accentHex}` }}
        />
        <span
          className="absolute top-16 left-[68%] w-1 h-1 rounded-full opacity-60"
          style={{ backgroundColor: bgTokens["--text-primary"] }}
        />
        <span
          className="absolute top-10 left-[65%] w-0.5 h-0.5 rounded-full opacity-40"
          style={{ backgroundColor: bgTokens["--text-primary"] }}
        />
      </div>

      {/* ─── Sidebar Strip (Left) ─────────────────────────────────── */}
      <aside
        className="w-12 sm:w-14 shrink-0 flex flex-col items-center py-4 border-r gap-3.5 z-10 transition-colors"
        style={{
          backgroundColor: bgTokens["--sidebar-bg"],
          borderColor: bgTokens["--border-subtle"],
        }}
        aria-hidden="true"
      >
        {/* Top: Stylized Sylf Feather/Logo */}
        <div
          className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl border flex items-center justify-center transition-all shadow-xs"
          style={{
            backgroundColor: bgTokens["--surface-1"],
            borderColor: bgTokens["--border-subtle"],
          }}
        >
          <svg className="w-4 h-4 sm:w-4.5 sm:h-4.5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M19.5 4.5C15 4.5 10.5 8 9 12.5C7.8 16 8 19 9.5 20.5C11 22 14 22 17.5 19.5C21 17 22.5 13 22.5 9L19.5 4.5Z"
              fill={`url(#sylf-logo-${mode})`}
            />
            <path
              d="M9 13C11 12 14.5 11.5 17 12"
              stroke="#ffffff"
              strokeWidth="1.5"
              strokeLinecap="round"
              opacity="0.75"
            />
            <defs>
              <linearGradient id={`sylf-logo-${mode}`} x1="9" y1="4.5" x2="22.5" y2="20.5" gradientUnits="userSpaceOnUse">
                <stop stopColor={accentHex} />
                <stop offset="1" stopColor={mode === "light" ? "#60a5fa" : "#38bdf8"} />
              </linearGradient>
            </defs>
          </svg>
        </div>

        {/* 1. Active: Home (Glowing Accent Container) */}
        <div
          className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl border flex items-center justify-center transition-all"
          style={{
            backgroundColor: `${accentHex}20`,
            borderColor: `${accentHex}80`,
            boxShadow: `0 0 14px ${accentHex}40`,
          }}
        >
          <Home className="w-4 h-4 sm:w-4.5 sm:h-4.5" style={{ color: accentHex }} />
        </div>

        {/* Inactive Nav Icons */}
        <div className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center opacity-40 hover:opacity-75 transition-opacity">
          <Target className="w-4 h-4 sm:w-4.5 sm:h-4.5" style={{ color: bgTokens["--text-muted"] }} />
        </div>
        <div className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center opacity-40 hover:opacity-75 transition-opacity">
          <BarChart2 className="w-4 h-4 sm:w-4.5 sm:h-4.5" style={{ color: bgTokens["--text-muted"] }} />
        </div>
        <div className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center opacity-40 hover:opacity-75 transition-opacity">
          <Users className="w-4 h-4 sm:w-4.5 sm:h-4.5" style={{ color: bgTokens["--text-muted"] }} />
        </div>
        <div className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center opacity-40 hover:opacity-75 transition-opacity">
          <Calendar className="w-4 h-4 sm:w-4.5 sm:h-4.5" style={{ color: bgTokens["--text-muted"] }} />
        </div>
        <div className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center opacity-40 hover:opacity-75 transition-opacity">
          <Settings className="w-4 h-4 sm:w-4.5 sm:h-4.5" style={{ color: bgTokens["--text-muted"] }} />
        </div>
      </aside>

      {/* ─── Main Dashboard Canvas ─────────────────────────────────── */}
      <main className="flex-1 min-w-0 p-3.5 sm:p-5 flex flex-col gap-3.5 sm:gap-4 relative overflow-hidden z-10">
        {/* ─── Header: Welcome Back & Status Chips ─────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-col gap-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="text-base sm:text-lg font-bold font-['Rajdhani'] tracking-wide"
                style={{ color: bgTokens["--text-primary"] }}
              >
                Welcome back,
              </span>
              {/* Name pill placeholder with glowing accent gradient */}
              <span
                className="w-20 sm:w-28 h-5 sm:h-6 rounded-md sm:rounded-lg inline-block shadow-xs"
                style={{
                  background: `linear-gradient(90deg, ${accentHex}bb 0%, ${accentHex}50 100%)`,
                  boxShadow: `0 0 12px ${accentHex}35`,
                }}
              />
            </div>
            {/* Subtitle placeholder line */}
            <span
              className="w-36 sm:w-56 h-2 rounded-full opacity-40"
              style={{ backgroundColor: bgTokens["--text-muted"] }}
            />
          </div>

          {/* Top-Right Chips (Sylph Currency & Streak) */}
          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
            {/* Sylph Currency Chip */}
            <div
              className="h-6 sm:h-7 px-2.5 sm:px-3 rounded-full border flex items-center gap-1.5 shadow-2xs"
              style={{
                backgroundColor: bgTokens["--surface-1"],
                borderColor: bgTokens["--border-subtle"],
              }}
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0" style={{ color: accentHex }} />
              <span
                className="text-[11px] sm:text-xs font-bold font-['Rajdhani'] tracking-wide"
                style={{ color: bgTokens["--text-primary"] }}
              >
                2497
              </span>
            </div>

            {/* Streak Chip */}
            <div
              className="h-6 sm:h-7 px-2.5 sm:px-3 rounded-full border flex items-center gap-1.5 shadow-2xs"
              style={{
                backgroundColor: bgTokens["--surface-1"],
                borderColor: bgTokens["--border-subtle"],
              }}
            >
              <Flame className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span
                className="text-[11px] sm:text-xs font-bold font-['Rajdhani'] tracking-wide"
                style={{ color: bgTokens["--text-secondary"] }}
              >
                0 wks
              </span>
            </div>
          </div>
        </div>

        {/* ─── Hero Section: Scholar Dossier & EXP/HP Telemetry ─────── */}
        <div
          className="p-3.5 sm:p-5 rounded-xl sm:rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6 shadow-sm transition-colors"
          style={{
            backgroundColor: bgTokens["--surface-1"],
            borderColor: bgTokens["--border-subtle"],
          }}
        >
          {/* Left: Avatar & Scholar Identity */}
          <div className="flex items-center gap-3 sm:gap-4 shrink-0">
            {/* Avatar Box with Person Silhouette */}
            <div
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl sm:rounded-2xl border flex items-center justify-center shrink-0 relative overflow-hidden"
              style={{
                backgroundColor: bgTokens["--surface-2"],
                borderColor: bgTokens["--border-subtle"],
              }}
            >
              <div className="w-full h-full flex flex-col items-center justify-end pb-1 overflow-hidden">
                <div
                  className="w-6 h-6 sm:w-7 sm:h-7 rounded-full shrink-0 mb-1"
                  style={{
                    background: `linear-gradient(180deg, ${accentHex}65 0%, ${accentHex}25 100%)`,
                    border: `1px solid ${accentHex}40`,
                  }}
                />
                <div
                  className="w-10 h-6 sm:w-12 sm:h-7 rounded-t-full shrink-0"
                  style={{
                    background: `linear-gradient(180deg, ${accentHex}45 0%, ${accentHex}18 100%)`,
                    border: `1px solid ${accentHex}30`,
                  }}
                />
              </div>
            </div>

            {/* Info lines: Name bar, subtitle bar, Lv.4 badge */}
            <div className="flex flex-col gap-1.5 min-w-0">
              <span
                className="w-16 sm:w-20 h-2.5 sm:h-3 rounded-full"
                style={{
                  backgroundColor: accentHex,
                  boxShadow: `0 0 8px ${accentHex}40`,
                }}
              />
              <span
                className="w-24 sm:w-28 h-2 rounded-full opacity-40"
                style={{ backgroundColor: bgTokens["--text-muted"] }}
              />
              <div
                className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border w-fit mt-0.5"
                style={{
                  backgroundColor: bgTokens["--surface-2"],
                  borderColor: bgTokens["--border-subtle"],
                }}
              >
                <span
                  className="w-7 h-1.5 rounded-full opacity-45"
                  style={{ backgroundColor: bgTokens["--text-muted"] }}
                />
                <span
                  className="text-[10px] sm:text-[11px] font-bold font-['Rajdhani']"
                  style={{ color: bgTokens["--text-secondary"] }}
                >
                  Lv. 4
                </span>
              </div>
            </div>
          </div>

          {/* Right: Dual EXP & HP Progress Bars */}
          <div className="flex-1 md:max-w-md lg:max-w-lg flex flex-col justify-center gap-3 min-w-0">
            {/* EXP Row */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-[11px] font-['Rajdhani'] font-bold uppercase tracking-wider">
                <span style={{ color: bgTokens["--text-secondary"] }}>EXP</span>
                <span style={{ color: bgTokens["--text-secondary"] }}>223 / 318</span>
              </div>
              <div
                className="w-full h-2 rounded-full overflow-hidden border"
                style={{
                  backgroundColor: bgTokens["--surface-2"],
                  borderColor: bgTokens["--border-subtle"],
                }}
              >
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: "70%",
                    backgroundColor: accentHex,
                    boxShadow: `0 0 10px ${accentHex}90`,
                  }}
                />
              </div>
            </div>

            {/* HP Row */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-[11px] font-['Rajdhani'] font-bold uppercase tracking-wider">
                <span style={{ color: bgTokens["--text-secondary"] }}>HP</span>
                <span style={{ color: bgTokens["--text-secondary"] }}>42 / 105</span>
              </div>
              <div
                className="w-full h-2 rounded-full overflow-hidden border"
                style={{
                  backgroundColor: bgTokens["--surface-2"],
                  borderColor: bgTokens["--border-subtle"],
                }}
              >
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: "42%",
                    backgroundColor: accentHex,
                    boxShadow: `0 0 10px ${accentHex}90`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ─── Middle Section: 3 Metric Cards ───────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
          {/* Card 1: ChevronsUp */}
          <div
            className="p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl border flex items-center gap-3 shadow-2xs transition-colors"
            style={{
              backgroundColor: bgTokens["--surface-1"],
              borderColor: bgTokens["--border-subtle"],
            }}
          >
            <div
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl border flex items-center justify-center shrink-0"
              style={{
                backgroundColor: bgTokens["--surface-2"],
                borderColor: bgTokens["--border-subtle"],
              }}
            >
              <ChevronsUp className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: accentHex }} />
            </div>
            <div className="flex flex-col gap-1.5 min-w-0 flex-1">
              <span
                className="w-16 sm:w-20 h-2.5 rounded-full opacity-80"
                style={{ backgroundColor: bgTokens["--text-primary"] }}
              />
              <span
                className="w-24 sm:w-28 h-2 rounded-full opacity-40"
                style={{ backgroundColor: bgTokens["--text-muted"] }}
              />
            </div>
          </div>

          {/* Card 2: Clock */}
          <div
            className="p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl border flex items-center gap-3 shadow-2xs transition-colors"
            style={{
              backgroundColor: bgTokens["--surface-1"],
              borderColor: bgTokens["--border-subtle"],
            }}
          >
            <div
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl border flex items-center justify-center shrink-0"
              style={{
                backgroundColor: bgTokens["--surface-2"],
                borderColor: bgTokens["--border-subtle"],
              }}
            >
              <Clock className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: accentHex }} />
            </div>
            <div className="flex flex-col gap-1.5 min-w-0 flex-1">
              <span
                className="w-18 sm:w-22 h-2.5 rounded-full opacity-80"
                style={{ backgroundColor: bgTokens["--text-primary"] }}
              />
              <span
                className="w-22 sm:w-26 h-2 rounded-full opacity-40"
                style={{ backgroundColor: bgTokens["--text-muted"] }}
              />
            </div>
          </div>

          {/* Card 3: CheckCircle2 */}
          <div
            className="p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl border flex items-center gap-3 shadow-2xs transition-colors"
            style={{
              backgroundColor: bgTokens["--surface-1"],
              borderColor: bgTokens["--border-subtle"],
            }}
          >
            <div
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl border flex items-center justify-center shrink-0"
              style={{
                backgroundColor: bgTokens["--surface-2"],
                borderColor: bgTokens["--border-subtle"],
              }}
            >
              <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: accentHex }} />
            </div>
            <div className="flex flex-col gap-1.5 min-w-0 flex-1">
              <span
                className="w-20 sm:w-24 h-2.5 rounded-full opacity-80"
                style={{ backgroundColor: bgTokens["--text-primary"] }}
              />
              <span
                className="w-24 sm:w-28 h-2 rounded-full opacity-40"
                style={{ backgroundColor: bgTokens["--text-muted"] }}
              />
            </div>
          </div>
        </div>

        {/* ─── Bottom Section: 2 Wide Cards ─────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 sm:gap-3">
          {/* Left Card: Tasks / Quests (md:col-span-7) */}
          <div
            className="md:col-span-7 p-3.5 sm:p-4 rounded-xl sm:rounded-2xl border flex flex-col gap-3 shadow-sm transition-colors"
            style={{
              backgroundColor: bgTokens["--surface-1"],
              borderColor: bgTokens["--border-subtle"],
            }}
          >
            {/* Header: Diamond + Accent title bar + Arrow */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rotate-45 border-2 rounded-xs shrink-0"
                  style={{ borderColor: accentHex }}
                />
                <span
                  className="w-28 sm:w-36 h-2.5 sm:h-3 rounded-full"
                  style={{
                    backgroundColor: accentHex,
                    boxShadow: `0 0 8px ${accentHex}40`,
                  }}
                />
              </div>
              <ArrowRight
                className="w-4 h-4 opacity-50"
                style={{ color: bgTokens["--text-muted"] }}
              />
            </div>

            {/* Row 1: Accent bullet + 2 lines + Accent button */}
            <div
              className="p-2.5 sm:p-3 rounded-xl border flex items-center justify-between gap-3"
              style={{
                backgroundColor: bgTokens["--surface-2"],
                borderColor: bgTokens["--border-subtle"],
              }}
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{
                    backgroundColor: accentHex,
                    boxShadow: `0 0 8px ${accentHex}`,
                  }}
                />
                <div className="flex flex-col gap-1 min-w-0 flex-1">
                  <span
                    className="w-32 sm:w-44 h-2.5 rounded-full opacity-85"
                    style={{ backgroundColor: bgTokens["--text-primary"] }}
                  />
                  <span
                    className="w-24 sm:w-36 h-2 rounded-full opacity-40"
                    style={{ backgroundColor: bgTokens["--text-muted"] }}
                  />
                </div>
              </div>
              <div
                className="w-14 sm:w-16 h-6 rounded-md sm:rounded-lg shrink-0 flex items-center justify-center shadow-xs"
                style={{
                  backgroundColor: accentHex,
                  boxShadow: `0 0 10px ${accentHex}50`,
                }}
              />
            </div>

            {/* Row 2: Muted bullet + 2 lines + Muted button */}
            <div
              className="p-2.5 sm:p-3 rounded-xl border flex items-center justify-between gap-3"
              style={{
                backgroundColor: bgTokens["--surface-2"],
                borderColor: bgTokens["--border-subtle"],
              }}
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0 opacity-40"
                  style={{ backgroundColor: bgTokens["--text-muted"] }}
                />
                <div className="flex flex-col gap-1 min-w-0 flex-1">
                  <span
                    className="w-28 sm:w-40 h-2.5 rounded-full opacity-70"
                    style={{ backgroundColor: bgTokens["--text-primary"] }}
                  />
                  <span
                    className="w-36 sm:w-48 h-2 rounded-full opacity-35"
                    style={{ backgroundColor: bgTokens["--text-muted"] }}
                  />
                </div>
              </div>
              <div
                className="w-14 sm:w-16 h-6 rounded-md sm:rounded-lg shrink-0 border"
                style={{
                  backgroundColor: bgTokens["--surface-raised"],
                  borderColor: bgTokens["--border-subtle"],
                }}
              />
            </div>
          </div>

          {/* Right Card: Social / Study Circle (md:col-span-5) */}
          <div
            className="md:col-span-5 p-3.5 sm:p-4 rounded-xl sm:rounded-2xl border flex flex-col gap-3 shadow-sm transition-colors"
            style={{
              backgroundColor: bgTokens["--surface-1"],
              borderColor: bgTokens["--border-subtle"],
            }}
          >
            {/* Header: Users icon + Accent title bar + Arrow */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 shrink-0" style={{ color: accentHex }} />
                <span
                  className="w-24 sm:w-28 h-2.5 sm:h-3 rounded-full"
                  style={{
                    backgroundColor: accentHex,
                    boxShadow: `0 0 8px ${accentHex}40`,
                  }}
                />
              </div>
              <ArrowRight
                className="w-4 h-4 opacity-50"
                style={{ color: bgTokens["--text-muted"] }}
              />
            </div>

            {/* 3 Member Rows */}
            <div className="flex flex-col gap-2.5 pt-0.5">
              {[
                { w1: "w-20 sm:w-28", w2: "w-14 sm:w-20" },
                { w1: "w-16 sm:w-24", w2: "w-20 sm:w-28" },
                { w1: "w-24 sm:w-30", w2: "w-12 sm:w-16" },
              ].map((item, idx) => (
                <div key={idx} className="flex items-center justify-between py-0.5">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div
                      className="w-7 h-7 rounded-full border flex items-center justify-center shrink-0"
                      style={{
                        backgroundColor: bgTokens["--surface-2"],
                        borderColor: bgTokens["--border-subtle"],
                      }}
                    >
                      <User
                        className="w-3.5 h-3.5 opacity-60"
                        style={{ color: bgTokens["--text-muted"] }}
                      />
                    </div>
                    <div className="flex flex-col gap-1 min-w-0 flex-1">
                      <span
                        className={`${item.w1} h-2 rounded-full opacity-80`}
                        style={{ backgroundColor: bgTokens["--text-primary"] }}
                      />
                      <span
                        className={`${item.w2} h-1.5 rounded-full opacity-40`}
                        style={{ backgroundColor: bgTokens["--text-muted"] }}
                      />
                    </div>
                  </div>
                  <span
                    className="w-10 sm:w-12 h-2 rounded-full opacity-50 shrink-0"
                    style={{ backgroundColor: bgTokens["--surface-raised"] }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

