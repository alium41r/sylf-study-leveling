"use client";

import { useState, useEffect, useCallback } from "react";
import BackToSettings from "@/app/components/BackToSettings";
import { motion, AnimatePresence } from "framer-motion";
import {
  BellRing,
  BellOff,
  Trophy,
  BookOpen,
  Clock,
  UserPlus,
  MessageCircle,
  Users2,
  Check,
  RotateCcw,
  AlertCircle,
  Bell,
} from "lucide-react";
import {
  LevelInsigniaIcon,
  StreakFlameIcon,
  SystemApertureIcon,
  QuestEmblemIcon,
} from "@/app/components/icons";
import {
  NotificationPreferences,
  DEFAULT_NOTIFICATION_PREFERENCES,
} from "@/lib/notification-preferences";
import { fetchCachedJSON } from "@/lib/client-data-cache";
import styles from "../../components/SystemHubPage.module.css";

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
      className={`flex items-center justify-between p-4 rounded-xl transition-all border ${
        disabled
          ? "opacity-45 bg-[var(--sub-surface)] border-[var(--sub-border)] cursor-not-allowed"
          : "bg-[var(--sub-surface)] hover:bg-[var(--sub-surface-hover)] border-[var(--sub-border)] hover:border-[var(--line)]"
      }`}
    >
      <div className="flex items-center gap-3.5 pr-4 min-w-0">
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border transition-colors ${
            checked && !disabled
              ? "bg-[var(--accent-dim)] border-[var(--line)] text-[var(--accent)]"
              : "bg-[var(--chip-bg)] border-[var(--sub-border)] text-[var(--muted)]"
          }`}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <h4 className="text-sm font-bold font-['Rajdhani'] tracking-wide text-[var(--ink)] truncate">
            {title}
          </h4>
          <p className="text-xs text-[var(--muted)] leading-relaxed mt-0.5">
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
        className={`${styles.configSwitch} ${
          disabled
            ? styles.configSwitchDisabled
            : checked
            ? styles.configSwitchActive
            : styles.configSwitchInactive
        }`}
        aria-label={`Toggle ${title}`}
      >
        <span
          className={`${styles.configSwitchThumb} ${
            checked ? styles.configSwitchThumbActive : styles.configSwitchThumbInactive
          }`}
        />
      </button>
    </div>
  );
}

export function NotificationsSettingsScreen() {
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
      const data = await fetchCachedJSON<{ preferences?: NotificationPreferences }>(
        "/api/notifications/preferences",
        { credentials: "include" },
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
  }, []);

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
      const res = await fetch("/api/notifications/preferences", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
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
      const res = await fetch("/api/notifications/preferences", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
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
    <div className={styles.hubContainer}>
      <div className={styles.topGlow} aria-hidden="true" />

      <div className={styles.contentWrapper}>
        {/* Navigation & Header */}
        <div>
          <BackToSettings />
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mt-4 mb-6">
            <div>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-['Rajdhani'] font-bold tracking-widest text-[var(--accent)] uppercase mb-2 ${styles.chip}`}>
                <Bell className="w-3.5 h-3.5" />
                <span>Config → Alerts</span>
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold font-['Rajdhani'] uppercase tracking-wider text-[var(--ink)]">
                Alerts & Notifications
              </h1>
              <p className="text-sm text-[var(--muted)] mt-1 max-w-xl">
                Fine-tune real-time system alerts, study reminders, progression achievements, and community messages.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleResetDefaults}
                disabled={isSaving || isLoading}
                className={styles.btnSecondary}
                style={{ padding: "8px 16px", fontSize: "0.8rem" }}
                title="Reset to default alert configuration"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Defaults</span>
              </button>
            </div>
          </div>
        </div>

        {/* Floating Save/Error Toast */}
        <AnimatePresence>
          {toastMessage && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="fixed top-6 right-6 z-[100] px-4 py-2.5 rounded-xl bg-[var(--surface)] border border-[var(--line)] text-[var(--ink)] text-xs font-['Rajdhani'] font-bold flex items-center gap-2 shadow-2xl backdrop-blur-md"
            >
              <Check className="w-4 h-4 text-emerald-500" />
              <span>{toastMessage}</span>
            </motion.div>
          )}
          {errorMessage && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-3.5 mb-6 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs font-['Rajdhani'] font-bold flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ─── 1. MASTER NOTIFICATION SWITCH CARD ───────────────── */}
        <div className={`${styles.configSectionCard} mb-6`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center border transition-all ${
                  isMasterOn
                    ? "bg-[var(--accent-dim)] border-[var(--line)] text-[var(--accent)] shadow-[0_0_20px_var(--accent-dim)]"
                    : "bg-[var(--sub-surface)] border-[var(--sub-border)] text-[var(--muted)]"
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
                  <h3 className="text-base font-bold font-['Rajdhani'] text-[var(--ink)] tracking-wide">
                    Master System Alerts
                  </h3>
                  <span
                    className={`text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                      isMasterOn
                        ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-500"
                        : "bg-amber-500/15 border-amber-500/30 text-amber-500"
                    }`}
                  >
                    {isMasterOn ? "Alerts Enabled" : "Silenced"}
                  </span>
                </div>
                <p className="text-xs text-[var(--muted)] mt-0.5">
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
              className={`${styles.configSwitch} ${
                isMasterOn ? styles.configSwitchActive : styles.configSwitchInactive
              }`}
              style={{ width: "54px", height: "30px" }}
              aria-label="Toggle master alerts"
            >
              <span
                className={`${styles.configSwitchThumb} ${
                  isMasterOn ? styles.configSwitchThumbActive : styles.configSwitchThumbInactive
                }`}
                style={{
                  width: "26px",
                  height: "26px",
                  transform: isMasterOn ? "translateX(24px)" : "translateX(0)",
                }}
              />
            </button>
          </div>
        </div>

        {/* ─── CATEGORY TOGGLE GROUPS ───────────────────────────── */}
        <div className="space-y-6">
          {/* SECTION 1: Progression & Milestones */}
          <div className={styles.configSectionCard}>
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[var(--subtle-line)]">
              <Trophy className="w-4 h-4 text-[var(--accent)]" />
              <h3 className="text-xs font-bold font-['Rajdhani'] uppercase tracking-widest text-[var(--accent)]">
                Progression & Hunter Milestones
              </h3>
            </div>
            <div className="space-y-3">
              <ToggleItem
                id="levelRankPromotions"
                title="Level & Rank Promotions"
                description="Receive broadcast announcements when ranking up or reaching new level tiers."
                icon={<LevelInsigniaIcon size={16} />}
                checked={preferences.levelRankPromotions}
                disabled={!isMasterOn || isLoading}
                onChange={handleToggle}
              />
              <ToggleItem
                id="streakMilestones"
                title="Daily & Weekly Streaks"
                description="Alerts for maintaining unbroken daily focus streaks and weekly consistency goals."
                icon={<StreakFlameIcon size={16} />}
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
          <div className={styles.configSectionCard}>
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[var(--subtle-line)]">
              <BookOpen className="w-4 h-4 text-[var(--accent)]" />
              <h3 className="text-xs font-bold font-['Rajdhani'] uppercase tracking-widest text-[var(--accent)]">
                Study & Quest Management
              </h3>
            </div>
            <div className="space-y-3">
              <ToggleItem
                id="aiStudyPlans"
                title="AI Study Plan Generation"
                description="Notifications when an adaptive study syllabus and quest roadmap are generated."
                icon={<SystemApertureIcon size={16} />}
                checked={preferences.aiStudyPlans}
                disabled={!isMasterOn || isLoading}
                onChange={handleToggle}
              />
              <ToggleItem
                id="questAssignments"
                title="Quest Assignments & Deadlines"
                description="Alerts for newly assigned daily quests and upcoming objective deadline checkpoints."
                icon={<QuestEmblemIcon size={16} />}
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
          <div className={styles.configSectionCard}>
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[var(--subtle-line)]">
              <Users2 className="w-4 h-4 text-[var(--accent)]" />
              <h3 className="text-xs font-bold font-['Rajdhani'] uppercase tracking-widest text-[var(--accent)]">
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
    </div>
  );
}

export default NotificationsSettingsScreen;
