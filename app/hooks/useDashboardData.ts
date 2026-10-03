/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useAuth } from "@/app/components/AuthProvider";
import { useEffect, useState } from "react";
import { calculateWeeklyQuestReward } from "@/lib/game-engine";
import { fetchCachedJSON } from "@/lib/client-data-cache";

export interface Quest {
  id: number;
  title: string;
  status: string;
  difficulty: string;
  xpReward: number;
  requiredMinutes: number;
  goal: { id: number; title: string };
}

export interface Friend {
  id: number;
  name: string | null;
  username: string;
  avatarUrl?: string | null;
  hunterRank: string;
  level: number;
  todayMinutes: number;
  isOnline: boolean;
}

export interface ActiveWeeklyQuest {
  progressMinutes: number;
  progressSeconds: number;
  percentComplete: number;
  isCompleted: boolean;
  daysRemaining: number;
  xpReward: number;
  sylphReward: number;
}

export interface DashboardData {
  user: any;
  isLoading: boolean;
  quests: Quest[];
  setQuests: React.Dispatch<React.SetStateAction<Quest[]>>;
  weeklyQuest: any;
  activeWeeklyQuest: ActiveWeeklyQuest;
  friends: Friend[];
  onlineFriends: Friend[];
  offlineFriends: Friend[];
  briefings: any[];
  dismissBriefing: (id: number) => Promise<void>;
  insights: any[];
  completedToday: number;
  totalToday: number;
  currentXP: number;
  xpToNextLevel: number;
  expPercent: number;
  hp: number;
  maxHp: number;
  hpPercent: number;
  characterCfg: any;
}

/**
 * Shared production controller hook for the Sylf Dashboard.
 * Powers both canonical `/dashboard` and experimental `/dashboard-design`
 * with identical data fetching, cache policies, auth validation, and progression calculations.
 */
export function useDashboardData(): DashboardData {
  const { user, isLoading } = useAuth();
  const [quests, setQuests] = useState<Quest[]>([]);
  const [weeklyQuest, setWeeklyQuest] = useState<any>(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem("sylf_cached_weekly_quest");
        if (cached) return JSON.parse(cached);
      } catch {}
    }
    return null;
  });
  const [friends, setFriends] = useState<Friend[]>([]);
  const [briefings, setBriefings] = useState<any[]>([]);
  const [insights, setInsights] = useState<any[]>([]);

  const dismissBriefing = async (id: number) => {
    setBriefings([]);
    try {
      await fetch("/api/system-messages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageIds: [id] }),
      });
    } catch (e) {
      console.error("Failed to dismiss briefing:", e);
    }
  };

  useEffect(() => {
    if (!user) return;

    // 1. Fetch weekly focus quest independently
    fetch("/api/quests/weekly", {})
      .then((r) => (r.ok ? r.json().catch(() => null) : null))
      .then((weeklyData) => {
        if (weeklyData && !weeklyData.error) {
          setWeeklyQuest(weeklyData);
          try {
            localStorage.setItem("sylf_cached_weekly_quest", JSON.stringify(weeklyData));
          } catch {}
        }
      })
      .catch(console.error);

    // 2-5. Cached stale-while-revalidate data loads
    fetchCachedJSON<any[]>("/api/quests", {}, { ttlMs: 15_000, staleMs: 120_000 })
      .then((questsData) => {
        if (questsData) setQuests(Array.isArray(questsData) ? questsData : []);
      })
      .catch(console.error);

    fetchCachedJSON<any[]>("/api/friends", {}, { ttlMs: 15_000, staleMs: 120_000 })
      .then((friendsData) => {
        if (friendsData) setFriends(Array.isArray(friendsData) ? friendsData : []);
      })
      .catch(console.error);

    fetchCachedJSON<any>(
      "/api/system-messages?type=DAILY_BRIEFING&global=true&limit=1&unreadOnly=true",
      {},
      { ttlMs: 20_000, staleMs: 120_000 }
    )
      .then((briefingsData) => {
        if (briefingsData) setBriefings(briefingsData.messages || []);
      })
      .catch(console.error);

    fetchCachedJSON<any[]>("/api/insights", {}, { ttlMs: 30_000, staleMs: 300_000 })
      .then((insightsData) => {
        if (insightsData) setInsights(Array.isArray(insightsData) ? insightsData : []);
      })
      .catch(console.error);
  }, [user?.id]);

  useEffect(() => {
    if (!isLoading && !user) {
      if (typeof window !== "undefined") {
        document.cookie = "hunter_token=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT";
        window.location.href = "/login?force=true";
      }
    }
  }, [isLoading, user]);

  const completedToday = quests.filter((q) => q.status === "COMPLETED").length;
  const totalToday = quests.length;
  const onlineFriends = friends.filter((f) => f.isOnline);
  const offlineFriends = friends.filter((f) => !f.isOnline);

  const currentXP = Number(user?.currentXP) || 0;
  const xpToNextLevel = Number(user?.xpToNextLevel) > 0 ? Number(user?.xpToNextLevel) : 1000;
  const expPercent = Math.min(100, Math.max(0, Math.round((currentXP / xpToNextLevel) * 100)));

  const hp = Number(user?.hp) || 0;
  const effectiveMaxHp =
    Number(user?.effectiveMaxHp) > 0
      ? Number(user?.effectiveMaxHp)
      : Number(user?.maxHp) > 0
      ? Number(user?.maxHp)
      : 100;
  const maxHp = effectiveMaxHp;
  const hpPercent = Math.min(100, Math.max(0, Math.round((hp / maxHp) * 100)));

  let characterCfg = user?.characterConfig;
  if (typeof characterCfg === "string") {
    try {
      characterCfg = JSON.parse(characterCfg);
    } catch {
      characterCfg = null;
    }
  }

  const fallbackRewards = calculateWeeklyQuestReward(user?.level || 1);
  const activeWeeklyQuest: ActiveWeeklyQuest = weeklyQuest || {
    progressMinutes: 0,
    progressSeconds: 0,
    percentComplete: 0,
    isCompleted: false,
    daysRemaining: (() => {
      const now = new Date();
      const day = now.getDay();
      return day === 0 ? 1 : 7 - day + 1;
    })(),
    xpReward: fallbackRewards.xpReward,
    sylphReward: fallbackRewards.sylphReward,
  };

  return {
    user,
    isLoading,
    quests,
    setQuests,
    weeklyQuest,
    activeWeeklyQuest,
    friends,
    onlineFriends,
    offlineFriends,
    briefings,
    dismissBriefing,
    insights,
    completedToday,
    totalToday,
    currentXP,
    xpToNextLevel,
    expPercent,
    hp,
    maxHp,
    hpPercent,
    characterCfg,
  };
}

export default useDashboardData;
