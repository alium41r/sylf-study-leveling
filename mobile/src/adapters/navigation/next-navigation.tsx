/**
 * ============================================================================
 * Next.js Navigation Adapter (Mobile Client Shim)
 * ============================================================================
 * Allows existing shared React components that import from "next/navigation"
 * to run inside the Vite-powered mobile client shell without modifications.
 * ============================================================================
 */

import { useMemo } from "react";
import { useMobileNavigation } from "./NavigationContext";

export function useRouter() {
  const nav = useMobileNavigation();
  return useMemo(
    () => ({
      push: (href: string, _options?: { scroll?: boolean }) => {
        void _options;
        nav.push(href);
      },
      replace: (href: string, _options?: { scroll?: boolean }) => {
        void _options;
        nav.replace(href);
      },
      back: () => nav.back(),
      forward: () => nav.forward(),
      refresh: () => nav.refresh(),
      prefetch: (_href: string) => {
        void _href;
      },
    }),
    [nav]
  );
}

export function usePathname(): string {
  const nav = useMobileNavigation();
  return nav.pathname;
}

export function useSearchParams(): URLSearchParams {
  const nav = useMobileNavigation();
  return nav.searchParams;
}

export function useParams<T extends Record<string, string | string[]>>(): T {
  // Can be extended with dynamic route parameters if needed
  return {} as T;
}

export function redirect(url: string): never {
  if (typeof window !== "undefined") {
    window.location.hash = url.startsWith("#") ? url : `#${url}`;
  }
  throw new Error(`NEXT_REDIRECT:${url}`);
}
