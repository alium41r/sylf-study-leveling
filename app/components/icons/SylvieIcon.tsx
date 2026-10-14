import { useId } from "react";
import type { IconProps } from "./SystemIcons";

/** Sylvie's crescent, four-point sparkle, and two orbiting dots. */
export function SylvieIcon({ size = 18, className = "", ...props }: IconProps) {
  const gradientId = `sylvie-${useId().replace(/:/g, "")}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      className={className}
      aria-hidden="true"
      data-sylvie-icon="true"
      {...props}
    >
      <defs>
        <linearGradient id={gradientId} x1="8" y1="8" x2="31" y2="36" gradientUnits="userSpaceOnUse">
          <stop stopColor="color-mix(in srgb, var(--accent-text, currentColor) 25%, var(--text-primary, currentColor))" />
          <stop offset="1" stopColor="color-mix(in srgb, var(--accent-text, currentColor) 55%, var(--text-primary, currentColor))" />
        </linearGradient>
      </defs>
      <g fill={`url(#${gradientId})`}>
        <path d="M13.8 7.2C7.3 9.2 3 15.2 3 22.1C3 30.7 9.9 37.5 18.4 37.5C24.5 37.5 29.8 34.1 32.4 29.1C32.9 28.2 32.1 27.3 31.2 27.7C25.6 30 19.3 28.8 15.4 24.3C11.6 19.9 10.9 13.7 14.9 8.7C15.6 7.9 14.8 6.9 13.8 7.2Z" />
        <path d="M30.7 7.4C31.1 7.4 31.4 7.7 31.6 8.3L33.2 12.3C33.5 13.1 34.1 13.7 34.9 14L38.1 15.2C39.2 15.6 39.2 16.3 38.1 16.7L34.9 17.9C34.1 18.2 33.5 18.8 33.2 19.6L31.6 23.6C31.2 24.7 30.5 24.7 30.1 23.6L28.5 19.6C28.2 18.8 27.6 18.2 26.8 17.9L23.6 16.7C22.5 16.3 22.5 15.6 23.6 15.2L26.8 14C27.6 13.7 28.2 13.1 28.5 12.3L30.1 8.3C30.3 7.7 30.5 7.4 30.7 7.4Z" />
        <circle cx="18.5" cy="5.5" r="2.8" />
        <circle cx="35.5" cy="29.1" r="2" />
      </g>
      <path d="M13.2 8.8C7.7 11.4 5 16.8 5 22.1C5 29.4 10.8 35.5 18.4 35.5C12.1 34.5 8 29.1 8 22.8C8 17.7 9.8 12.8 13.2 8.8Z" fill="var(--text-primary, currentColor)" opacity="0.22" />
    </svg>
  );
}
