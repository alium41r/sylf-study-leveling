/**
 * ============================================================================
 * Next.js Link Adapter (Mobile Client Shim)
 * ============================================================================
 * Allows existing shared React components that import Link from "next/link"
 * to render and navigate cleanly inside the Vite mobile client shell.
 * ============================================================================
 */

import React, { forwardRef } from "react";
import { useMobileNavigation } from "./NavigationContext";

export interface LinkProps
  extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  href: string | { pathname?: string; query?: Record<string, string | number | boolean | undefined> };
  replace?: boolean;
  scroll?: boolean;
  prefetch?: boolean;
  children?: React.ReactNode;
}

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { href, replace, onClick, children, ...rest },
  ref
) {
  const nav = useMobileNavigation();

  let targetUrl = "";
  if (typeof href === "string") {
    targetUrl = href;
  } else if (href && typeof href === "object") {
    const p = href.pathname || "";
    const params = new URLSearchParams();
    if (href.query) {
      Object.entries(href.query).forEach(([k, v]) => {
        if (v !== undefined) params.set(k, String(v));
      });
    }
    const q = params.toString();
    targetUrl = q ? `${p}?${q}` : p;
  }

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (onClick) onClick(e);
    if (
      !e.defaultPrevented &&
      !e.metaKey &&
      !e.ctrlKey &&
      !e.shiftKey &&
      !e.altKey &&
      (!rest.target || rest.target === "_self")
    ) {
      e.preventDefault();
      if (replace) {
        nav.replace(targetUrl);
      } else {
        nav.push(targetUrl);
      }
    }
  };

  const hashHref = targetUrl.startsWith("#")
    ? targetUrl
    : targetUrl.startsWith("/")
    ? `#${targetUrl}`
    : targetUrl;

  return (
    <a ref={ref} href={hashHref} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
});

export default Link;
