import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

export interface NavigationContextValue {
  pathname: string;
  searchParams: URLSearchParams;
  push: (href: string, options?: { scroll?: boolean }) => void;
  replace: (href: string, options?: { scroll?: boolean }) => void;
  back: () => void;
  forward: () => void;
  refresh: () => void;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

function parseHashLocation(): { pathname: string; searchParams: URLSearchParams } {
  if (typeof window === "undefined") {
    return { pathname: "/dashboard", searchParams: new URLSearchParams() };
  }
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) {
    return { pathname: "/dashboard", searchParams: new URLSearchParams() };
  }
  const [pathPart, queryPart] = hash.split("?");
  const pathname = pathPart.startsWith("/") ? pathPart : `/${pathPart}`;
  const searchParams = new URLSearchParams(queryPart || "");
  return { pathname, searchParams };
}

export function NavigationProvider({
  children,
  initialPath = "/dashboard",
}: {
  children: React.ReactNode;
  initialPath?: string;
}) {
  const [loc, setLoc] = useState<{ pathname: string; searchParams: URLSearchParams }>(() => {
    if (typeof window !== "undefined" && window.location.hash) {
      return parseHashLocation();
    }
    const [pathPart, queryPart] = initialPath.split("?");
    return {
      pathname: pathPart.startsWith("/") ? pathPart : `/${pathPart}`,
      searchParams: new URLSearchParams(queryPart || ""),
    };
  });

  useEffect(() => {
    const handleHashChange = () => {
      setLoc(parseHashLocation());
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const push = useCallback((href: string) => {
    if (typeof window !== "undefined") {
      window.location.hash = href.startsWith("#") ? href : `#${href}`;
      setLoc(parseHashLocation());
    } else {
      const [pathPart, queryPart] = href.split("?");
      setLoc({
        pathname: pathPart.startsWith("/") ? pathPart : `/${pathPart}`,
        searchParams: new URLSearchParams(queryPart || ""),
      });
    }
  }, []);

  const replace = useCallback((href: string) => {
    if (typeof window !== "undefined") {
      const targetHash = href.startsWith("#") ? href : `#${href}`;
      window.location.replace(targetHash);
      setLoc(parseHashLocation());
    } else {
      const [pathPart, queryPart] = href.split("?");
      setLoc({
        pathname: pathPart.startsWith("/") ? pathPart : `/${pathPart}`,
        searchParams: new URLSearchParams(queryPart || ""),
      });
    }
  }, []);

  const back = useCallback(() => {
    if (typeof window !== "undefined") {
      window.history.back();
    }
  }, []);

  const forward = useCallback(() => {
    if (typeof window !== "undefined") {
      window.history.forward();
    }
  }, []);

  const refresh = useCallback(() => {
    setLoc(parseHashLocation());
  }, []);

  return (
    <NavigationContext.Provider
      value={{
        pathname: loc.pathname,
        searchParams: loc.searchParams,
        push,
        replace,
        back,
        forward,
        refresh,
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
}

export function useMobileNavigation(): NavigationContextValue {
  const ctx = useContext(NavigationContext);
  if (!ctx) {
    // Fallback if rendered outside provider (e.g. unit tests or isolated story)
    return {
      pathname: "/dashboard",
      searchParams: new URLSearchParams(),
      push: () => {},
      replace: () => {},
      back: () => {},
      forward: () => {},
      refresh: () => {},
    };
  }
  return ctx;
}
