"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { useRouter, usePathname } from "next/navigation";

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
  sylph: number;
  hasCompletedOnboarding: boolean;
  hasPassword?: boolean;
  timezone?: string;
  createdAt: string;
}

interface AuthContextType {
  user: UserStats | null;
  token: string | null;
  isLoading: boolean;
  login: (token: string, userData: UserStats) => void;
  logout: () => Promise<void>;
  refreshStats: () => Promise<void>;
  mutateUser: (user: UserStats) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ─── Provider ────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserStats | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const mutateUser = useCallback((newUserData: UserStats | null) => {
    setUser(newUserData);
    if (typeof window !== "undefined") {
      if (newUserData) {
        localStorage.setItem("user_data", JSON.stringify(newUserData));
      } else {
        localStorage.removeItem("user_data");
      }
    }
  }, []);

  // Fetch fresh stats from the server
  const refreshStats = useCallback(async () => {
    const storedToken = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    try {
      const res = await fetch("/api/user/stats", {
        credentials: "include",
        headers: storedToken ? { Authorization: `Bearer ${storedToken}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
        if (typeof window !== "undefined") {
          localStorage.setItem("user_data", JSON.stringify(data));
          if (data.token) {
            localStorage.setItem("token", data.token);
            setToken(data.token);
          } else if (storedToken) {
            setToken(storedToken);
          }
        }
      } else if (res.status === 401) {
        // Explicitly unauthorized — clear everything
        if (typeof window !== "undefined") {
          localStorage.removeItem("token");
          localStorage.removeItem("user_data");
        }
        setToken(null);
        setUser(null);
      }
      // Other errors (500, network issues): don't nuke the session
    } catch (err) {
      console.error("Failed to refresh stats:", err);
    }
  }, []);

  // On mount: hydrate from localStorage first, then validate with server
  useEffect(() => {
    // 1. Synchronously restore cached state from localStorage
    const cachedUser = localStorage.getItem("user_data");
    const cachedToken = localStorage.getItem("token");

    if (cachedToken) {
      setToken(cachedToken);
    }
    if (cachedUser) {
      try {
        const parsed = JSON.parse(cachedUser);
        if (parsed && parsed.id) {
          setUser(parsed);
        }
      } catch {
        localStorage.removeItem("user_data");
      }
    }

    // 2. Validate with server in the background
    refreshStats().finally(() => setIsLoading(false));
  }, [refreshStats]);

  const login = useCallback((newToken: string, userData: UserStats) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("token", newToken);
      localStorage.setItem("user_data", JSON.stringify(userData));
    }
    setToken(newToken);
    setUser(userData);
    setIsLoading(false);
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch (e) {
      console.error("Logout API error:", e);
    }
    if (typeof window !== "undefined") {
      localStorage.removeItem("token");
      localStorage.removeItem("user_data");
    }
    setToken(null);
    setUser(null);
    window.location.href = "/login";
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, token, isLoading, login, logout, refreshStats, mutateUser }}
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
