"use client";

import React, { createContext, useContext, useState, useCallback } from "react";

interface ProfileModalContextType {
  isOpen: boolean;
  username: string | null;
  openProfile: (username: string) => void;
  closeProfile: () => void;
}

const ProfileModalContext = createContext<ProfileModalContextType | undefined>(undefined);

export function ProfileModalProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [username, setUsername] = useState<string | null>(null);

  const openProfile = useCallback((name: string) => {
    setUsername(name);
    setIsOpen(true);
  }, []);

  const closeProfile = useCallback(() => {
    setIsOpen(false);
    setUsername(null);
  }, []);

  return (
    <ProfileModalContext.Provider value={{ isOpen, username, openProfile, closeProfile }}>
      {children}
    </ProfileModalContext.Provider>
  );
}

export function useProfileModal() {
  const context = useContext(ProfileModalContext);
  if (!context) {
    throw new Error("useProfileModal must be used within a ProfileModalProvider");
  }
  return context;
}
