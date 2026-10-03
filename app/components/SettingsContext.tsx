"use client";

import { createContext, useContext, useState, useCallback, useRef } from "react";

interface SettingsContextValue {
  isOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;
  clearOriginRoute: () => void;
  /** The route the user was on when they first opened the settings panel */
  originRoute: string | null;
}

const SettingsContext = createContext<SettingsContextValue>({
  isOpen: false,
  openSettings: () => {},
  closeSettings: () => {},
  clearOriginRoute: () => {},
  originRoute: null,
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [originRoute, setOriginRoute] = useState<string | null>(null);

  const openSettings = useCallback(() => {
    // Only capture origin if we don't already have one AND the current route
    // is not a settings sub-page (so we never record a /settings/* route as the origin)
    if (typeof window !== "undefined") {
      const currentPath = window.location.pathname;
      if (!currentPath.startsWith("/settings")) {
        setOriginRoute((prev) => (prev ? prev : currentPath));
      }
    }
    setIsOpen(true);
  }, []);

  const closeSettings = useCallback(() => {
    setIsOpen(false);
  }, []);

  const clearOriginRoute = useCallback(() => {
    setOriginRoute(null);
  }, []);

  return (
    <SettingsContext.Provider
      value={{
        isOpen,
        openSettings,
        closeSettings,
        clearOriginRoute,
        originRoute,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
