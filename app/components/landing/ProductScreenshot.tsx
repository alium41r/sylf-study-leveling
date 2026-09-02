"use client";

import React from "react";
import Image from "next/image";
import { Monitor } from "lucide-react";

interface ProductScreenshotProps {
  /** Image source path when screenshot file is available */
  src?: string;
  /** Accessible alt description */
  alt: string;
  /** Title shown in the window title bar */
  title?: string;
  /** Small category badge in title bar (e.g., "Live Feature", "Beta Interface") */
  badge?: string;
  /** Explanatory caption beneath the screenshot frame */
  caption?: string;
  /** Frame aspect ratio */
  aspectRatio?: "16/10" | "16/9" | "4/3" | "auto";
  /** Optional interactive or component mockup content if src image is not yet supplied */
  children?: React.ReactNode;
  className?: string;
  /** Optional container max-width class (default: w-full) */
  containerClassName?: string;
}

export default function ProductScreenshot({
  src,
  alt,
  title,
  badge,
  caption,
  aspectRatio = "16/10",
  children,
  className = "",
  containerClassName = "w-full",
}: ProductScreenshotProps) {
  const aspectClass = {
    "16/10": "aspect-[16/10]",
    "16/9": "aspect-[16/9]",
    "4/3": "aspect-[4/3]",
    auto: "aspect-auto",
  }[aspectRatio];

  return (
    <figure className={`flex flex-col items-center ${containerClassName}`}>
      <div className="relative w-full">
        {/* Clean Window Frame */}
        <div
          className={`w-full rounded-xl border border-border-subtle bg-bg-abyss/95 backdrop-blur-md shadow-lg overflow-hidden transition-colors ${className}`}
        >
          {/* Top Title Bar */}
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-border-subtle bg-bg-void/50 text-xs select-none">
            {/* Window Dots */}
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-border-subtle" />
              <span className="w-2.5 h-2.5 rounded-full bg-border-subtle" />
              <span className="w-2.5 h-2.5 rounded-full bg-border-subtle" />
            </div>

            {/* Centered Route / Title */}
            {title && (
              <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-bg-abyss border border-border-subtle text-[11px] font-mono text-text-secondary truncate max-w-[65%] sm:max-w-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-accent-primary" />
                <span className="truncate">{title}</span>
              </div>
            )}

            {/* Right Badge */}
            <div className="flex items-center gap-2">
              {badge ? (
                <span className="text-[10px] uppercase font-bold tracking-wider font-['Rajdhani'] px-2 py-0.5 rounded bg-accent-primary-dim text-accent-text-light border border-accent-primary-mid/30">
                  {badge}
                </span>
              ) : (
                <span className="text-[10px] text-text-muted font-mono hidden sm:inline">sylf.app</span>
              )}
            </div>
          </div>

          {/* Window Body */}
          <div className={`relative w-full overflow-hidden bg-bg-void/40 ${aspectClass}`}>
            {src ? (
              <Image
                src={src}
                alt={alt}
                fill
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 85vw, 1100px"
                className="object-cover object-top"
                priority={false}
              />
            ) : children ? (
              <div className="w-full h-full p-4 sm:p-5 overflow-hidden flex flex-col justify-center">
                {children}
              </div>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center select-none">
                <div className="w-10 h-10 rounded-lg bg-accent-primary-dim border border-accent-primary-mid/40 flex items-center justify-center text-accent-text-light mb-2.5">
                  <Monitor className="w-5 h-5 text-accent-primary-light" />
                </div>
                <h4 className="text-sm font-bold text-text-primary mb-1 font-['Rajdhani'] tracking-wide">
                  {title || alt}
                </h4>
                <p className="text-xs text-text-muted max-w-xs leading-relaxed">
                  Real Sylf product interface view.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {caption && (
        <figcaption className="mt-2 text-xs text-text-muted text-center font-mono">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
