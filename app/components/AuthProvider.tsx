"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { clearClientCache } from "@/lib/client-data-cache";

// ─── Types ───────────────────────────────────────────────────

export interface UserStats {
  id: number;
  email: string;
  username: string;
  name: string | null;
  scholarId?: string | null;
  verificationStatus?: "UNVERIFIED" | "VERIFIED";
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  bio?: string | null;
  activeAvatar?: string;
  activeFrame?: string;
  activeTitle?: string;
  activeAura?: string;
  activeNameColor?: string;
  activeTheme?: string;
  activeBackground?: string;
  characterConfig?: any;
  socialLinks?: any;
  hunterRank: string;
  level: number;
  currentXP: number;
  xpToNextLevel: number;
  hp: number;
  maxHp: number;
  streakDays: number;
  totalStudyMinutes: number;
  totalStudySeconds?: number;
  todayStudyMinutes?: number;
  todayStudySeconds?: number;
  completedTodaySeconds?: number;
  activeSessionStartedAt?: string | null;
  sylph: number;
  hasCompletedOnboarding: boolean;
  hasPassword?: boolean;
  timezone?: string;
  createdAt: string;
}

interface AuthContextType {
  user: UserStats | null;
  isLoading: boolean;
  login: (userData: UserStats) => void;
  logout: () => Promise<void>;
  refreshStats: () => Promise<void>;
  mutateUser: (user: UserStats | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ─── Provider ────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const mutateUser = useCallback((newUserData: UserStats | null) => {
    // S3: in-memory only — no user profile is persisted to localStorage.
    setUser(newUserData);
  }, []);

  // Fetch fresh stats from the server (httpOnly cookie authenticates; no JWT
  // in JS and no Bearer headers anywhere).
  const refreshStats = useCallback(async () => {
    try {
      const res = await fetch("/api/user/stats", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
      } else if (res.status === 401) {
        setUser(null);
      }
      // Other errors (500, network issues): don't nuke the session
    } catch (err) {
      console.error("Failed to refresh stats:", err);
    }
  }, []);

  // On mount: validate the cookie session with the server.
  useEffect(() => {
    refreshStats().finally(() => setIsLoading(false));
  }, [refreshStats]);

  const login = useCallback((userData: UserStats) => {
    setUser(userData);
    setIsLoading(false);
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch (e) {
      console.error("Logout API error:", e);
    }
    // S3: clear cached API payloads and scratchpad drafts so the next user
    // on a shared device cannot replay this session's data.
    clearClientCache();
    setUser(null);
    window.location.href = "/login";
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, isLoading, login, logout, refreshStats, mutateUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
