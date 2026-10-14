"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { clearPixelCreations } from "@/lib/pixel-creations-client";
import { clearClientCache } from "@/lib/client-data-cache";
import { resolveApiUrl, fetchWithTimeout } from "@/lib/api-transport";

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  characterConfig?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  socialLinks?: any;
  hunterRank: string;
  level: number;
  currentXP: number;
  xpToNextLevel: number;
  hp: number;
  maxHp: number;
  effectiveMaxHp?: number;
  streakDays: number;
  totalStudyMinutes: number;
  totalStudySeconds?: number;
  todayStudyMinutes?: number;
  todayStudySeconds?: number;
  completedTodaySeconds?: number;
  activeSessionStartedAt?: string | null;
  sylph: number;
  hasCompletedOnboarding: boolean;
  isAdmin?: boolean;
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
  mutateUser: (user: Partial<UserStats> | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ─── Provider ────────────────────────────────────────────────

export function AuthProvider({
  children,
  initialUser,
}: {
  children: ReactNode;
  initialUser?: UserStats | null;
}) {
  const [user, setUser] = useState<UserStats | null>(initialUser ?? null);
  const [isLoading, setIsLoading] = useState(initialUser === undefined);
  const updateEpoch = useRef(0);
  const refreshSequence = useRef(0);
  const owner = useRef(initialUser?.id ?? null);
  const needsRetry = useRef(false);

  const mutateUser = useCallback((newUserData: Partial<UserStats> | null) => {
    updateEpoch.current++;
    if (newUserData === null) { clearClientCache(); clearPixelCreations(); owner.current = null; }
    // S3: in-memory only — no user profile is persisted to localStorage.
    setUser(previous => {
      if (newUserData === null) return null;
      if (!previous || (newUserData.id !== undefined && newUserData.id !== previous.id)) return previous;
      return { ...previous, ...newUserData };
    });
  }, []);

  // Fetch fresh stats from the server (httpOnly cookie authenticates; no JWT
  // in JS and no Bearer headers anywhere).
  const refreshStats = useCallback(async () => {
    const epoch = updateEpoch.current, sequence = ++refreshSequence.current;
    try {
      const res = await fetchWithTimeout(fetch, resolveApiUrl("/api/user/stats"), { credentials: "include", cache: "no-store" });
      if (res.ok) {
        const data: UserStats = await res.json();
        // An older read must not undo Apply/equip, login or logout.
        if (epoch !== updateEpoch.current || sequence !== refreshSequence.current) return;
        needsRetry.current = false;
        if (owner.current !== null && owner.current !== data.id) { clearClientCache(); clearPixelCreations(); }
        owner.current = data.id;
        setUser(data);
      } else if (res.status === 401) {
        if (epoch !== updateEpoch.current || sequence !== refreshSequence.current) return;
        needsRetry.current = false;
        updateEpoch.current++; owner.current = null;
        clearClientCache(); clearPixelCreations();
        setUser(null);
      } else if (epoch === updateEpoch.current && sequence === refreshSequence.current) {
        needsRetry.current = true;
      }
      // Other errors (500, network issues): don't nuke the session
    } catch (err) {
      if (epoch === updateEpoch.current && sequence === refreshSequence.current) needsRetry.current = true;
      console.error("Failed to refresh stats:", err);
    }
  }, []);

  // On mount: validate the cookie session with the server.
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void refreshStats().finally(() => { if (!cancelled) setIsLoading(false); });
    });
    const retry = () => { if (needsRetry.current) void refreshStats(); };
    const visible = () => { if (document.visibilityState === "visible") retry(); };
    const interval = setInterval(retry, 30_000);
    window.addEventListener("online", retry);
    window.addEventListener("pageshow", retry);
    document.addEventListener("visibilitychange", visible);
    return () => {
      cancelled = true;
      clearInterval(interval); window.removeEventListener("online", retry);
      window.removeEventListener("pageshow", retry); document.removeEventListener("visibilitychange", visible);
    };
  }, [refreshStats]);

  const login = useCallback((userData: UserStats) => {
    needsRetry.current = false;
    updateEpoch.current++;
    if (owner.current !== null && owner.current !== userData.id) { clearClientCache(); clearPixelCreations(); }
    owner.current = userData.id;
    setUser(userData);
    setIsLoading(false);
  }, []);

  const logout = useCallback(async () => {
    needsRetry.current = false;
    updateEpoch.current++;
    try {
      await fetch(resolveApiUrl("/api/auth/logout"), { method: "POST", credentials: "include" });
    } catch (e) {
      console.error("Logout API error:", e);
    }
    // S3: clear cached API payloads and scratchpad drafts so the next user
    // on a shared device cannot replay this session's data.
    clearClientCache();
    clearPixelCreations();
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
