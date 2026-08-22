"use client";

import React, { useState } from "react";

interface UserAvatarProps {
  src?: string | null;
  name?: string | null;
  username?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl" | number;
  className?: string;
  fallbackClassName?: string;
  alt?: string;
  shape?: "circle" | "rounded" | "square";
}

const SIZE_MAP: Record<string, { container: string; text: string }> = {
  xs: { container: "w-6 h-6 text-[10px]", text: "text-[10px]" },
  sm: { container: "w-8 h-8 text-xs", text: "text-xs" },
  md: { container: "w-10 h-10 text-sm", text: "text-sm" },
  lg: { container: "w-16 h-16 text-xl", text: "text-xl" },
  xl: { container: "w-20 h-20 text-2xl", text: "text-2xl" },
  "2xl": { container: "w-28 h-28 text-4xl", text: "text-4xl" },
};

export function UserAvatar({
  src,
  name,
  username,
  size = "md",
  className = "",
  fallbackClassName = "",
  alt,
  shape = "circle",
}: UserAvatarProps) {
  const [hasError, setHasError] = useState(false);

  const displayName = name || username || "Scholar";
  const firstChar = displayName.trim().charAt(0).toUpperCase() || "S";

  const sizeClass = typeof size === "string" ? (SIZE_MAP[size]?.container || SIZE_MAP.md.container) : "";
  const shapeClass = shape === "circle" ? "rounded-full" : shape === "rounded" ? "rounded-xl" : "rounded-none";

  const customStyle = typeof size === "number" ? { width: `${size}px`, height: `${size}px` } : undefined;

  if (src && !hasError) {
    return (
      <div
        className={`relative overflow-hidden shrink-0 border border-border-subtle bg-bg-abyss shadow-sm ${sizeClass} ${shapeClass} ${className}`}
        style={customStyle}
      >
        <img
          src={src}
          alt={alt || displayName}
          onError={() => setHasError(true)}
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden shrink-0 border border-border-subtle bg-gradient-to-br from-emerald-950/60 via-bg-panel to-bg-abyss text-emerald-400 font-['Rajdhani'] font-bold flex items-center justify-center select-none shadow-sm ${sizeClass} ${shapeClass} ${className} ${fallbackClassName}`}
      style={customStyle}
      title={displayName}
    >
      <span>{firstChar}</span>
    </div>
  );
}

export default UserAvatar;
