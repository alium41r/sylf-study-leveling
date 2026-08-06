"use client";

import React from "react";

interface SettingsSectionCardProps {
  title: string;
  description: string;
  children?: React.ReactNode;
  danger?: boolean;
}

export default function SettingsSectionCard({
  title,
  description,
  children,
  danger = false,
}: SettingsSectionCardProps) {
  return (
    <div
      className={`system-card p-6 mb-6 flex flex-col ${
        danger ? "border-red-900/50 hover:shadow-[0_0_20px_rgba(239,68,68,0.3)]" : ""
      }`}
      style={danger ? { borderColor: "rgba(239, 68, 68, 0.2)" } : {}}
    >
      <div className="mb-4">
        <h2 className={`text-xl ${danger ? "text-danger" : "text-primary"}`}>
          {title}
        </h2>
        <p className="text-muted text-sm mt-1">{description}</p>
      </div>

      <div className="pt-4 border-t border-white/10 flex-grow">
        {children || (
          <div className="py-6 text-center text-muted italic text-sm bg-white/5 rounded">
            Component placeholder
          </div>
        )}
      </div>
    </div>
  );
}
