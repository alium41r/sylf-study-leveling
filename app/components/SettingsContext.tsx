"use client";

import { createContext, useContext, useState, useCallback, useRef } from "react";

interface SettingsContextValue {
  isOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;
  /** The route the user was on when they first opened the settings panel */
  originRoute: string | null;
}

const SettingsContext = createContext<SettingsContextValue>({
  isOpen: false,
  openSettings: () => {},
  closeSettings: () => {},
  originRoute: null,
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const originRouteRef = useRef<string | null>(null);

  const openSettings = useCallback(() => {
    // Only capture origin if we don't already have one (prevents overwriting when
    // the panel re-opens after navigating back from a sub-page)
    if (!originRouteRef.current) {
      originRouteRef.current = window.location.pathname;
    }
    setIsOpen(true);
  }, []);

  const closeSettings = useCallback(() => {
    setIsOpen(false);
    // Clear origin so next open captures fresh
    originRouteRef.current = null;
  }, []);

  return (
    <SettingsContext.Provider
      value={{
        isOpen,
        openSettings,
        closeSettings,
        originRoute: originRouteRef.current,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
