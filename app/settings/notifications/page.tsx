"use client";

import { useState, useEffect, useCallback } from "react";
import BackToSettings from "../../components/BackToSettings";
import { useAuth } from "../../components/AuthProvider";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell,
  BellRing,
  BellOff,
  Zap,
  Flame,
  Trophy,
  Sparkles,
  BookOpen,
  Clock,
  UserPlus,
  MessageCircle,
  Users2,
  Check,
  RotateCcw,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";
import {
  NotificationPreferences,
  DEFAULT_NOTIFICATION_PREFERENCES,
} from "@/lib/notification-preferences";
import { fetchCachedJSON } from "@/lib/client-data-cache";

interface ToggleItemProps {
  id: keyof NotificationPreferences;
  title: string;
  description: string;
  icon: React.ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: (id: keyof NotificationPreferences, value: boolean) => void;
}

function ToggleItem({
  id,
  title,
  description,
  icon,
  checked,
  disabled = false,
  onChange,
}: ToggleItemProps) {
  return (
    <div
      className={`flex items-center justify-between p-4 rounded-xl transition-all duration-200 border ${
        disabled
          ? "opacity-40 bg-bg-void/40 border-border-subtle/50 cursor-not-allowed"
          : "bg-bg-void/70 hover:bg-bg-void border-border-subtle hover:border-accent-primary-mid/50"
      }`}
    >
      <div className="flex items-center gap-3.5 pr-4">
        <div
          className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border transition-colors ${
            checked && !disabled
              ? "bg-accent-primary-dim border-accent-primary-mid text-accent-text-light"
              : "bg-bg-abyss border-border-subtle text-text-muted"
          }`}
        >
          {icon}
        </div>
        <div>
          <h4 className="text-sm font-bold font-['Rajdhani'] tracking-wide text-text-primary">
            {title}
          </h4>
          <p className="text-xs text-text-secondary leading-relaxed mt-0.5 font-['Rajdhani']">
            {description}
          </p>
        </div>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(id, !checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2 focus:ring-offset-bg-abyss ${
          disabled
            ? "bg-bg-abyss cursor-not-allowed"
            : checked
            ? "bg-accent-primary"
            : "bg-bg-abyss border border-border-subtle"
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

export default function NotificationsSettingsPage() {
  const { token } = useAuth();
  const [preferences, setPreferences] = useState<NotificationPreferences>(
    DEFAULT_NOTIFICATION_PREFERENCES
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch current preferences on load
  const fetchPreferences = useCallback(async () => {
    setIsLoading(true);
    try {
      const activeToken = token || (typeof window !== "undefined" ? localStorage.getItem("token") : null);
      const headers: Record<string, string> = {};
      if (activeToken) {
        headers["Authorization"] = `Bearer ${activeToken}`;
      }

      // Stale-while-revalidate: reopening alerts paints instantly.
      const data = await fetchCachedJSON<{ preferences?: NotificationPreferences }>(
        "/api/notifications/preferences",
        { headers, credentials: "include" },
        { ttlMs: 20_000, staleMs: 120_000 }
      );

      if (data?.preferences) {
        setPreferences(data.preferences);
      }
    } catch (e) {
      console.error("Failed to load notification preferences:", e);
      setErrorMessage("Could not load preferences. Showing default settings.");
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  // Show transient toast notification
  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  // Update a preference toggle
  const handleToggle = async (key: keyof NotificationPreferences, value: boolean) => {
    const updated = { ...preferences, [key]: value };
    setPreferences(updated);
    setIsSaving(true);
    setErrorMessage(null);

    try {
      const activeToken = token || (typeof window !== "undefined" ? localStorage.getItem("token") : null);
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (activeToken) {
        headers["Authorization"] = `Bearer ${activeToken}`;
      }

      const res = await fetch("/api/notifications/preferences", {
        method: "PATCH",
        headers,
        credentials: "include",
        body: JSON.stringify({ [key]: value }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to save alert preference");
      }

      triggerToast("Alert preferences saved");
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("notification-preferences-updated"));
      }
    } catch (e: any) {
      console.error(e);
      setErrorMessage(e.message || "Failed to save changes. Please try again.");
      // Rollback on error
      fetchPreferences();
    } finally {
      setIsSaving(false);
    }
  };

  // Reset all preferences to default
  const handleResetDefaults = async () => {
    setPreferences(DEFAULT_NOTIFICATION_PREFERENCES);
    setIsSaving(true);
    setErrorMessage(null);

    try {
      const activeToken = token || (typeof window !== "undefined" ? localStorage.getItem("token") : null);
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (activeToken) {
        headers["Authorization"] = `Bearer ${activeToken}`;
      }

      const res = await fetch("/api/notifications/preferences", {
        method: "PATCH",
        headers,
        credentials: "include",
        body: JSON.stringify(DEFAULT_NOTIFICATION_PREFERENCES),
      });

      if (!res.ok) throw new Error("Failed to reset preferences");
      triggerToast("Reset all preferences to system defaults");
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("notification-preferences-updated"));
      }
    } catch (e) {
      console.error(e);
      setErrorMessage("Failed to reset defaults.");
      fetchPreferences();
    } finally {
      setIsSaving(false);
    }
  };

  const isMasterOn = preferences.masterEnabled;

  return (
    <div className="settings-page-container pb-20">
      <BackToSettings />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <p className="settings-page-breadcrumb">Config → Alerts</p>
          <h1 className="settings-page-header mb-1">Alerts & Notifications</h1>
          <p className="text-xs text-text-secondary font-['Rajdhani']">
            Fine-tune real-time system alerts, study reminders, progression achievements, and community messages.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleResetDefaults}
            disabled={isSaving || isLoading}
            className="px-3.5 py-2 rounded-xl bg-bg-abyss hover:bg-bg-shadow border border-border-subtle hover:border-accent-primary text-text-muted hover:text-text-primary text-xs font-['Rajdhani'] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-sm"
            title="Reset to default alert configuration"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Defaults</span>
          </button>
        </div>
      </div>

      {/* Floating Save/Error Toast */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="fixed top-6 right-6 z-[100] px-4 py-2.5 rounded-xl bg-bg-panel/95 border border-accent-primary text-text-primary text-xs font-['Rajdhani'] font-bold flex items-center gap-2 shadow-2xl backdrop-blur-md"
          >
            <Check className="w-4 h-4 text-emerald-400" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
        {errorMessage && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-3.5 mb-6 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-['Rajdhani'] font-bold flex items-center gap-2"
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── 1. MASTER NOTIFICATION SWITCH CARD ───────────────── */}
      <div className="p-5 rounded-2xl bg-bg-abyss border border-border-subtle relative overflow-hidden mb-6 shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center border transition-all ${
                isMasterOn
                  ? "bg-accent-primary-dim border-accent-primary-mid text-accent-text-light shadow-[0_0_20px_var(--accent-primary-dim)]"
                  : "bg-bg-void border-border-subtle text-text-muted"
              }`}
            >
              {isMasterOn ? (
                <BellRing className="w-6 h-6 animate-pulse" />
              ) : (
                <BellOff className="w-6 h-6" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="text-base font-bold font-['Rajdhani'] text-text-primary tracking-wide">
                  Master System Alerts
                </h3>
                <span
                  className={`text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                    isMasterOn
                      ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                      : "bg-amber-500/15 border-amber-500/30 text-amber-400"
                  }`}
                >
                  {isMasterOn ? "Alerts Enabled" : "Silenced"}
                </span>
              </div>
              <p className="text-xs text-text-secondary font-['Rajdhani'] mt-0.5">
                {isMasterOn
                  ? "Application notifications and audio-visual cues are active."
                  : "All in-app alerts and notifications are currently muted."}
              </p>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={isMasterOn}
            disabled={isLoading}
            onClick={() => handleToggle("masterEnabled", !isMasterOn)}
            className={`relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2 focus:ring-offset-bg-abyss ${
              isMasterOn ? "bg-accent-primary" : "bg-bg-shadow border border-border-subtle"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                isMasterOn ? "translate-x-7" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>

      {/* ─── CATEGORY TOGGLE GROUPS ───────────────────────────── */}
      <div className="space-y-6">
        {/* SECTION 1: Progression & Milestones */}
        <div className="p-5 rounded-2xl bg-bg-abyss border border-border-subtle shadow-md">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border-subtle">
            <Trophy className="w-4 h-4 text-accent-text-light" />
            <h3 className="text-xs font-bold font-['Rajdhani'] uppercase tracking-widest text-accent-text-light">
              Progression & Hunter Milestones
            </h3>
          </div>
          <div className="space-y-3">
            <ToggleItem
              id="levelRankPromotions"
              title="Level & Rank Promotions"
              description="Receive broadcast announcements when ranking up or reaching new level tiers."
              icon={<Zap className="w-4 h-4" />}
              checked={preferences.levelRankPromotions}
              disabled={!isMasterOn || isLoading}
              onChange={handleToggle}
            />
            <ToggleItem
              id="streakMilestones"
              title="Daily & Weekly Streaks"
              description="Alerts for maintaining unbroken daily focus streaks and weekly consistency goals."
              icon={<Flame className="w-4 h-4" />}
              checked={preferences.streakMilestones}
              disabled={!isMasterOn || isLoading}
              onChange={handleToggle}
            />
            <ToggleItem
              id="unlockedAchievements"
              title="Unlocked Achievements & Titles"
              description="Celebratory system banners when claiming achievements, badges, and hunter titles."
              icon={<Trophy className="w-4 h-4" />}
              checked={preferences.unlockedAchievements}
              disabled={!isMasterOn || isLoading}
              onChange={handleToggle}
            />
          </div>
        </div>

        {/* SECTION 2: Study & Quest Management */}
        <div className="p-5 rounded-2xl bg-bg-abyss border border-border-subtle shadow-md">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border-subtle">
            <BookOpen className="w-4 h-4 text-accent-text-light" />
            <h3 className="text-xs font-bold font-['Rajdhani'] uppercase tracking-widest text-accent-text-light">
              Study & Quest Management
            </h3>
          </div>
          <div className="space-y-3">
            <ToggleItem
              id="aiStudyPlans"
              title="AI Study Plan Generation"
              description="Notifications when an adaptive study syllabus and quest roadmap are generated."
              icon={<Sparkles className="w-4 h-4" />}
              checked={preferences.aiStudyPlans}
              disabled={!isMasterOn || isLoading}
              onChange={handleToggle}
            />
            <ToggleItem
              id="questAssignments"
              title="Quest Assignments & Deadlines"
              description="Alerts for newly assigned daily quests and upcoming objective deadline checkpoints."
              icon={<ShieldCheck className="w-4 h-4" />}
              checked={preferences.questAssignments}
              disabled={!isMasterOn || isLoading}
              onChange={handleToggle}
            />
            <ToggleItem
              id="scheduledFocusReminders"
              title="Scheduled Focus Reminders"
              description="Gentle notifications for planned Pomodoro blocks and daily focus intervals."
              icon={<Clock className="w-4 h-4" />}
              checked={preferences.scheduledFocusReminders}
              disabled={!isMasterOn || isLoading}
              onChange={handleToggle}
            />
          </div>
        </div>

        {/* SECTION 3: Social & Community */}
        <div className="p-5 rounded-2xl bg-bg-abyss border border-border-subtle shadow-md">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border-subtle">
            <Users2 className="w-4 h-4 text-accent-text-light" />
            <h3 className="text-xs font-bold font-['Rajdhani'] uppercase tracking-widest text-accent-text-light">
              Social & Guild Community
            </h3>
          </div>
          <div className="space-y-3">
            <ToggleItem
              id="incomingFriendRequests"
              title="Incoming Friend Requests"
              description="Alerts when another hunter sends a study buddy connection invitation."
              icon={<UserPlus className="w-4 h-4" />}
              checked={preferences.incomingFriendRequests}
              disabled={!isMasterOn || isLoading}
              onChange={handleToggle}
            />
            <ToggleItem
              id="directMessages"
              title="Private Direct Messages"
              description="Real-time notifications for incoming 1-on-1 direct messages from study friends."
              icon={<MessageCircle className="w-4 h-4" />}
              checked={preferences.directMessages}
              disabled={!isMasterOn || isLoading}
              onChange={handleToggle}
            />
            <ToggleItem
              id="groupActivity"
              title="Group Chat Activity & Mentions"
              description="Updates for new study group discussions, replies, and @mentions."
              icon={<Users2 className="w-4 h-4" />}
              checked={preferences.groupActivity}
              disabled={!isMasterOn || isLoading}
              onChange={handleToggle}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
