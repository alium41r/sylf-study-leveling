"use client";

import React from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { useImmersiveMode } from "./ImmersiveModeContext";

export type ImmersiveButtonVariant =
  | "top-bar"
  | "mobile-bar"
  | "header-pill"
  | "chat-header"
  | "focus-bar"
  | "focus-party";

export interface ImmersiveModeButtonProps {
  variant?: ImmersiveButtonVariant;
  showLabel?: boolean;
  className?: string;
}

export function ImmersiveModeButton({
  variant = "top-bar",
  showLabel = false,
  className = "",
}: ImmersiveModeButtonProps) {
  const { capabilities, isHydrated, triggerImmersiveAction } = useImmersiveMode();

  if (!isHydrated || capabilities.action === "none") {
    return null;
  }

  const isExit = capabilities.action === "exit-fullscreen";
  const isInstallPwa = capabilities.action === "install-pwa";

  const ariaLabel = isExit
    ? "Exit fullscreen"
    : isInstallPwa
      ? "Immersive app mode"
      : "Enter fullscreen";

  const titleText = isExit
    ? "Exit fullscreen (Esc)"
    : isInstallPwa
      ? "Install app for distraction-free fullscreen"
      : "Enter fullscreen";

  const shortLabel = isExit ? "Exit" : "Fullscreen";

  const Icon = isExit ? Minimize2 : Maximize2;

  const getVariantClasses = (): string => {
    switch (variant) {
      case "mobile-bar":
        return [
          "inline-flex items-center justify-center h-7 w-7 rounded-full border transition-all duration-150 shrink-0",
          isExit
            ? "border-accent-primary/45 bg-accent-primary/15 text-accent-text shadow-[0_0_10px_var(--accent-primary-dim)]"
            : "border-border-subtle bg-surface-raised/85 text-text-secondary hover:text-text-primary hover:border-border-default",
        ].join(" ");

      case "chat-header":
        return [
          "inline-flex items-center justify-center w-8 h-8 rounded-lg border transition-colors shrink-0",
          isExit
            ? "border-accent-primary/40 bg-accent-primary/12 text-accent-text"
            : "border-transparent text-text-muted hover:text-text-primary hover:bg-surface-hover",
        ].join(" ");

      case "focus-bar":
        return [
          "inline-flex items-center justify-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all duration-150 shrink-0",
          isExit
            ? "bg-white/15 text-white border border-white/25"
            : "text-white/75 hover:text-white hover:bg-white/10 border border-transparent",
        ].join(" ");

      case "focus-party":
        return [
          "inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl backdrop-blur-md border transition-all text-xs font-medium shrink-0",
          isExit
            ? "bg-white/20 hover:bg-white/25 border-white/30 text-white"
            : "bg-black/40 hover:bg-black/60 border-white/10 text-white/80 hover:text-white",
        ].join(" ");

      case "header-pill":
        return [
          "inline-flex items-center justify-center gap-1.5 h-8 px-2.5 rounded-lg border text-xs font-medium transition-all duration-150 shrink-0",
          isExit
            ? "border-accent-primary/45 bg-accent-primary/12 text-accent-text shadow-[0_0_12px_var(--accent-primary-dim)]"
            : "border-border-subtle bg-surface-raised/80 text-text-secondary hover:text-text-primary hover:border-border-default hover:bg-surface-hover/70",
        ].join(" ");

      case "top-bar":
      default:
        return [
          "inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-full backdrop-blur-md border transition-all duration-200 shrink-0 shadow-sm",
          isExit
            ? "bg-accent-primary/15 border-accent-primary/40 text-accent-text hover:bg-accent-primary/20"
            : "bg-surface-raised/85 hover:bg-surface-raised border-border-subtle hover:border-border-default text-text-secondary hover:text-text-primary",
        ].join(" ");
    }
  };

  const iconSizeClass =
    variant === "mobile-bar" || variant === "focus-bar"
      ? "w-3.5 h-3.5"
      : "w-4 h-4";

  return (
    <button
      type="button"
      onClick={() => {
        void triggerImmersiveAction();
      }}
      aria-label={ariaLabel}
      aria-pressed={isExit}
      title={titleText}
      data-testid={`immersive-mode-btn-${variant}`}
      data-immersive-action={capabilities.action}
      className={`${getVariantClasses()} ${className}`.trim()}
    >
      <Icon className={iconSizeClass} strokeWidth={1.85} />
      {showLabel && (
        <span className="font-['Rajdhani'] font-semibold tracking-wider uppercase text-[11px] leading-none">
          {shortLabel}
        </span>
      )}
    </button>
  );
}
