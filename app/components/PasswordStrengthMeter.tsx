"use client";

import React from "react";

interface PasswordStrengthMeterProps {
  password: string;
}

export function getPasswordStrength(password: string): {
  score: number; // 0 to 4
  label: string;
  colorVar: string;
} {
  if (!password) {
    return { score: 0, label: "", colorVar: "transparent" };
  }

  let points = 0;

  // Length bonuses
  if (password.length >= 6) points += 1;
  if (password.length >= 10) points += 1;
  if (password.length >= 14) points += 1;

  // Character diversity bonuses
  if (/[a-z]/.test(password)) points += 1;
  if (/[A-Z]/.test(password)) points += 1;
  if (/\d/.test(password)) points += 1;
  if (/[^A-Za-z0-9]/.test(password)) points += 1;

  // Short passwords under 6 characters are always weak
  if (password.length < 6 || points <= 2) {
    return { score: 1, label: "Weak Protocol", colorVar: "var(--accent-red)" };
  } else if (points === 3) {
    return { score: 2, label: "Fair Defense", colorVar: "var(--accent-gold)" };
  } else if (points === 4) {
    return { score: 3, label: "Good Encryption", colorVar: "var(--accent-gold)" };
  } else {
    return { score: 4, label: "Monarch Security", colorVar: "var(--accent-green)" };
  }
}

export default function PasswordStrengthMeter({ password }: PasswordStrengthMeterProps) {
  if (!password) return null;

  const { score, label, colorVar } = getPasswordStrength(password);

  return (
    <div className="mt-2 space-y-1.5 animate-fadeIn">
      {/* ─── 4-Segment Visual Bar ────────────────────────────── */}
      <div className="grid grid-cols-4 gap-1.5 h-1.5 w-full">
        {[1, 2, 3, 4].map((step) => {
          const isActive = step <= score;
          return (
            <div
              key={step}
              className="h-full rounded-sm transition-all duration-300"
              style={{
                background: isActive ? colorVar : "rgba(255, 255, 255, 0.08)",
                boxShadow: isActive ? `0 0 8px ${colorVar}` : "none",
              }}
            />
          );
        })}
      </div>

      {/* ─── Label & Hint ──────────────────────────────────── */}
      <div className="flex items-center justify-between text-[0.65rem] font-['Rajdhani'] uppercase tracking-widest">
        <span style={{ color: "var(--text-muted)" }}>Security Protocol</span>
        <span className="font-bold transition-colors duration-300" style={{ color: colorVar }}>
          {label}
        </span>
      </div>
    </div>
  );
}
