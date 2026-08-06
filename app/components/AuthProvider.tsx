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
  hunterRank: string;
  level: number;
  currentXP: number;
  xpToNextLevel: number;
  hp: number;
  maxHp: number;
  streakDays: number;
  totalStudyMinutes: number;
  sylph: number;
  createdAt: string;
}

interface AuthContextType {
  user: UserStats | null;
  token: string | null;
  isLoading: boolean;
  login: (token: string, userData: UserStats) => void;
  logout: () => void;
  refreshStats: () => Promise<void>;
  mutateUser: (user: UserStats) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ─── Protected Routes ────────────────────────────────────────

const PUBLIC_PATHS = ["/", "/login", "/register"];

// ─── Provider ────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserStats | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  // Fetch fresh stats from the server
  const refreshStats = useCallback(async () => {
    const storedToken = localStorage.getItem("token");
    if (!storedToken) return;

    try {
      const res = await fetch("/api/user/stats", {
        headers: { Authorization: `Bearer ${storedToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
      } else {
        // Token expired or invalid
        localStorage.removeItem("token");
        setToken(null);
        setUser(null);
      }
    } catch (err) {
      console.error("Failed to refresh stats:", err);
    }
  }, []);

  // On mount: check for existing token
  useEffect(() => {
    const storedToken = localStorage.getItem("token");
    if (storedToken) {
      setToken(storedToken);
      refreshStats().finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [refreshStats]);

  // Redirect unauthenticated users away from protected routes
  useEffect(() => {
    if (!isLoading && !token && !PUBLIC_PATHS.includes(pathname)) {
      router.push("/login");
    }
  }, [isLoading, token, pathname, router]);

  const login = useCallback((newToken: string, userData: UserStats) => {
    localStorage.setItem("token", newToken);
    setToken(newToken);
    setUser(userData);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
    router.push("/");
  }, [router]);

  return (
    <AuthContext.Provider
      value={{ user, token, isLoading, login, logout, refreshStats, mutateUser: setUser }}
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
