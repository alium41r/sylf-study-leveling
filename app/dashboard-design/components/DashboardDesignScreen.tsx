/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { OwnCompanionPreview } from "@/app/components/companion/OwnCompanionPreview";


import { lazy, Suspense, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clock3,
  ArrowRight,
  ArrowUpRight,
  Plus,
  TrendingUp,
  Lightbulb,
  Users,
  X,
  Play,
} from "lucide-react";
import {
  LevelInsigniaIcon,
  DailyQuotaIcon,
  QuestEmblemIcon,
  StreakFlameIcon,
  SystemInsightsIcon,
  SystemWarningIcon,
  SystemBriefingIcon,
} from "./DashboardIcons";
import { useDashboardData } from "@/app/hooks/useDashboardData";
import { DesignLabBar } from "./DesignLabBar";
import styles from "../styles/DashboardDesign.module.css";

// Lazy load MarkdownRenderer to keep route transitions instant
const MarkdownRenderer = lazy(() => import("@/app/components/MarkdownRenderer"));

export function DashboardDesignScreen() {
  const router = useRouter();
  const [isInsightsExpanded, setIsInsightsExpanded] = useState(false);
  const {
    user,
    isLoading,
    quests,
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
    activeWeeklyQuest,
  } = useDashboardData();

  const visibleInsights = useMemo(() => {
    return (insights || []).filter(
      (insight) => insight.category?.toLowerCase() !== "warning" && !insight.dismissed
    );
  }, [insights]);

  if (isLoading) {
    return (
      <div className={styles.dashboardContainer}>
        <DesignLabBar />
        <div className={styles.topGlow} aria-hidden="true" />
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 relative z-10">
          <div className="w-8 h-8 rounded-full border-2 border-accent-primary-light border-t-transparent animate-spin" />
          <p className="text-sm font-medium tracking-wider uppercase text-muted">
            Entering the Sanctuary...
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className={styles.dashboardContainer}>
        <DesignLabBar />
        <div className={styles.topGlow} aria-hidden="true" />
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 relative z-10">
          <p className="text-sm text-muted">Redirecting to login...</p>
          <button
            onClick={() => {
              if (typeof window !== "undefined") {
                document.cookie = "system_token=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT";
                window.location.href = "/login?force=true";
              }
            }}
            className={styles.btnStart}
          >
            Proceed to Login
          </button>
        </div>
      </div>
    );
  }

  // Active / next focus objective to answer: "What should I do now?"
  const activeQuest =
    quests.find((q) => q.status === "IN_PROGRESS") ||
    quests.find((q) => q.status === "PENDING");

  const rankClass =
    user.hunterRank === "S"
      ? styles.rankS
      : user.hunterRank === "A"
      ? styles.rankA
      : user.hunterRank === "B"
      ? styles.rankB
      : user.hunterRank === "C"
      ? styles.rankC
      : user.hunterRank === "D"
      ? styles.rankD
      : styles.rankE;

  const getDifficultyClass = (diff: string) => {
    switch (diff?.toUpperCase()) {
      case "EASY":
        return styles.diffEasy;
      case "HARD":
        return styles.diffHard;
      case "EXPERT":
        return styles.diffExpert;
      default:
        return styles.diffNormal;
    }
  };

  const getStatusClass = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return styles.statusCompleted;
      case "IN_PROGRESS":
        return styles.statusInProgress;
      case "FAILED":
        return styles.statusFailed;
      default:
        return styles.statusPending;
    }
  };

  const getInsightCategoryBadge = (category: string) => {
    switch (category?.toLowerCase()) {
      case "warning":
        return {
          className: styles.badgeWarning,
          icon: <SystemWarningIcon size={11} />,
          label: "Warning",
        };
      case "coaching":
        return {
          className: styles.badgeCoaching,
          icon: <Lightbulb size={11} />,
          label: "Tip",
        };
      case "trend":
        return {
          className: styles.badgeTrend,
          icon: <TrendingUp size={11} />,
          label: "Trend",
        };
      default:
        return {
          className: styles.badgeCoaching,
          icon: <SystemInsightsIcon size={11} />,
          label: category || "Notice",
        };
    }
  };

  return (
    <div className={styles.dashboardContainer}>
      {/* ─── Developer Utility Bar (Design Lab Only) ─── */}
      <DesignLabBar />

      {/* Ambient Celestial Starlight Glow */}
      <div className={styles.topGlow} aria-hidden="true" />

      <div className={styles.contentWrapper}>
        {/* ─── Header ───────────────────────────────────────── */}
        <header className={styles.headerArea}>
          <p className={styles.eyebrow}>
            <span className={styles.eyebrowDot} />
            Scholar Dashboard
          </p>
          <h1 className={styles.title}>
            Welcome back, <em>{user.name || user.username || "Scholar"}</em>
          </h1>
          <p className={styles.subtitle}>
            Your daily focus and quest overview.
          </p>

          {/* ─── Scholar Identity & Progression Row (Hybrid Refinement) ─── */}
          <section className={styles.characterRow} aria-label="Scholar Identity and Progression">
            {/* Compact Standalone Character Card */}
            <div
              className={styles.characterCard}
              title="Enter Companion Customizer in Locker"
            >
              <div className={styles.avatarFrame}>
                <OwnCompanionPreview config={characterCfg} size={110} label="Dashboard design companion" />
              </div>

              <div className={styles.avatarInfo}>
                <div className={styles.avatarHeader}>
                  <span className={styles.avatarTag}>
                    <span className={styles.avatarTagDot} />
                    Pixel Companion
                  </span>
                  <Link
                    href="/locker?tab=identity&view=customizer"
                    className={styles.quietCustomizeLink}
                    title="Customize your Pixel companion"
                  >
                    <span>Customize</span>
                    <ArrowUpRight size={10} />
                  </Link>
                </div>

                <div className={styles.identityDetailsRow}>
                  <span className={styles.scholarName}>
                    {user.name || user.username || "Scholar"}
                  </span>
                  <div className={styles.rankBadges}>
                    <span className={`${styles.rankPill} ${rankClass}`}>
                      {user.hunterRank || "E"}-Rank
                    </span>
                    <span className={styles.levelBadge}>
                      Lv. {user.level || 1}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Stacked Telemetry Bars (Outside Character Card) */}
            <div className={styles.barsContainer}>
              {/* EXP Track */}
              <div className={styles.trackGroup}>
                <div className={styles.trackHeader}>
                  <span className={styles.trackLabel}>EXP</span>
                  <div className={styles.trackValues}>
                    <span>
                      {currentXP} / {xpToNextLevel}
                    </span>
                    <span className={styles.percentChip}>{expPercent}%</span>
                  </div>
                </div>
                <div className={styles.progressWell}>
                  <div
                    className={styles.expFill}
                    style={{ width: `${expPercent}%` }}
                  />
                </div>
              </div>

              {/* HP Track */}
              <div className={styles.trackGroup}>
                <div className={styles.trackHeader}>
                  <span className={styles.trackLabel}>HP</span>
                  <div className={styles.trackValues}>
                    <span>
                      {hp} / {maxHp}
                    </span>
                    <span className={styles.percentChip}>{hpPercent}%</span>
                  </div>
                </div>
                <div className={styles.progressWell}>
                  <div
                    className={`${styles.hpFill} ${hpPercent < 25 ? styles.hpFillLow : ""}`}
                    style={{ width: `${hpPercent}%` }}
                  />
                </div>
              </div>
            </div>
          </section>
        </header>

        {/* ─── Metric Tiles Grid (Numbers Dominate) ─────────── */}
        <section className={styles.metricsGrid} aria-label="Metrics">
          <div className={styles.statCard}>
            <div className={styles.statIconBadge}>
              <LevelInsigniaIcon size={15} />
            </div>
            <p className={styles.statLabel}>Level</p>
            <p className={styles.statValue}>{user.level || 1}</p>
            <p className={styles.statSubtitle}>{user.hunterRank || "E"}-Rank Tier</p>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statIconBadge}>
              <Clock3 size={15} />
            </div>
            <p className={styles.statLabel}>Total Focus</p>
            <p className={styles.statValue}>
              {(() => {
                const totalMin = Number(user.totalStudyMinutes) || 0;
                const hrs = Math.floor(totalMin / 60);
                const mins = totalMin % 60;
                return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
              })()}
            </p>
            <p className={styles.statSubtitle}>All-time recorded</p>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statIconBadge}>
              <DailyQuotaIcon size={15} />
            </div>
            <p className={styles.statLabel}>Today&apos;s Quotas</p>
            <p className={styles.statValue}>
              {completedToday}
              <span className={styles.statValueDivider}> / </span>
              {totalToday}
            </p>
            <p className={styles.statSubtitle}>
              {totalToday === 0
                ? "No active quotas"
                : completedToday >= totalToday
                ? "All completed"
                : `${totalToday - completedToday} remaining`}
            </p>
          </div>
        </section>

        {/* ─── Daily Briefing Notification ──────────────────── */}
        <AnimatePresence>
          {briefings.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -10, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: -10, height: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className={styles.briefingCard}
            >
              <div className={styles.briefingHeader}>
                <div className={styles.briefingTitleRow}>
                  <SystemBriefingIcon size={16} className="text-accent" />
                  <h2 className={styles.briefingTitle}>Daily System Briefing</h2>
                </div>
                <button
                  onClick={() => dismissBriefing(briefings[0].id)}
                  className={styles.briefingCloseBtn}
                  title="Dismiss Briefing"
                  aria-label="Dismiss Briefing"
                >
                  <X size={16} />
                </button>
              </div>
              <Suspense fallback={<div className="h-20 animate-pulse rounded bg-surface/50" />}>
                <MarkdownRenderer
                  content={(briefings[0]?.content || "")
                    .replace(/^\[SYSTEM NOTIFICATION\]\s*/i, "")
                    .replace(/^\[SYSTEM\]\s*/i, "")}
                />
              </Suspense>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ─── Two-Column Primary Layout (Rebalanced Hierarchy) ─── */}
        <div className={styles.splitLayout}>
          {/* ─── Left Column: Quests & Cumulative Focus (PRIMARY) ── */}
          <div className={styles.columnGroup}>
            {/* Today's Quests Card (Elevated to top of main column) */}
            <section className={styles.questsCard} aria-label="Today's Quests">
              <div className={styles.sectionHeader}>
                <div className={styles.sectionTitleGroup}>
                  <QuestEmblemIcon size={18} className={styles.sectionIcon} />
                  <h2 className={styles.sectionTitle}>Today&apos;s Quests</h2>
                  {totalToday > 0 && (
                    <span className={styles.percentChip}>
                      {completedToday}/{totalToday} Done
                    </span>
                  )}
                </div>
                {quests.length > 0 && (
                  <Link href="/quests" className={styles.cardHeaderLink}>
                    New Quest <ArrowRight size={12} />
                  </Link>
                )}
              </div>

              {/* Elevated Primary Focus Action Banner (Answers: "What should I do now?") */}
              {activeQuest && (
                <div className={styles.activeFocusBanner}>
                  <div className={styles.activeFocusInfo}>
                    <span className={styles.activeFocusEyebrow}>
                      <span className={styles.activeBadgePulse} />
                      {activeQuest.status === "IN_PROGRESS" ? "Active Session" : "Next Objective"}
                    </span>
                    <p className={styles.activeFocusTitle}>{activeQuest.title}</p>
                    <span className={styles.activeFocusMeta}>
                      Target: {activeQuest.requiredMinutes} min • +{activeQuest.xpReward} XP
                    </span>
                  </div>
                  <button
                    onClick={() =>
                      router.push(
                        `/focus?questId=${activeQuest.id}&subjectName=${encodeURIComponent(
                          activeQuest.title
                        )}`
                      )
                    }
                    className={styles.btnPrimary}
                  >
                    <Play size={12} fill="currentColor" />
                    <span>{activeQuest.status === "IN_PROGRESS" ? "Resume Focus" : "Start Focus"}</span>
                  </button>
                </div>
              )}

              {quests.length === 0 ? (
                <div className={styles.emptyContainer}>
                  <div className={styles.emptyIconCircle}>
                    <QuestEmblemIcon size={18} />
                  </div>
                  <p className={styles.emptyText}>
                    No quests assigned for today.
                  </p>
                  <div className={styles.emptyActionsRow}>
                    <Link href="/quests" className={styles.emptyActionBtn}>
                      <Plus size={12} />
                      Create Quest
                    </Link>
                    <button
                      onClick={() => router.push("/focus")}
                      className={styles.emptySecondaryBtn}
                      title="Launch open study session"
                    >
                      <Play size={11} fill="currentColor" />
                      Quick Focus
                    </button>
                  </div>
                </div>
              ) : (
                <div className={styles.questsList}>
                  {quests.map((quest) => {
                    const isCurrentTarget = quest.id === activeQuest?.id;
                    return (
                      <div
                        key={quest.id}
                        className={`${styles.questItem} ${isCurrentTarget ? styles.questItemActive : ""}`}
                      >
                        <div className={styles.questInfo}>
                          <div className={styles.questTitleRow}>
                            <div className="relative group/title cursor-default min-w-0">
                              <p className={styles.questTitle}>{quest.title}</p>
                              {/* Glassmorphism Hover Tooltip */}
                              <div className="absolute left-0 top-full mt-1.5 hidden group-hover/title:block z-[100] bg-surface/95 backdrop-blur-xl text-ink text-xs p-2.5 rounded-lg shadow-xl border border-line whitespace-normal min-w-[180px] max-w-[280px]">
                                {quest.title}
                              </div>
                            </div>
                            <span
                              className={`${styles.difficultyChip} ${getDifficultyClass(
                                quest.difficulty
                              )}`}
                            >
                              {quest.difficulty
                                ? quest.difficulty.charAt(0) + quest.difficulty.slice(1).toLowerCase()
                                : "Normal"}
                            </span>
                          </div>
                          <p className={styles.questMeta}>
                            Target: {quest.requiredMinutes} min • +{quest.xpReward} XP
                          </p>
                        </div>

                        <div className={styles.questActions}>
                          <span
                            className={`${styles.statusPill} ${getStatusClass(quest.status)}`}
                          >
                            {quest.status === "IN_PROGRESS"
                              ? "In Progress"
                              : quest.status.charAt(0) + quest.status.slice(1).toLowerCase()}
                          </span>
                          {quest.status === "IN_PROGRESS" && (
                            <button
                              onClick={() =>
                                router.push(
                                  `/focus?questId=${quest.id}&subjectName=${encodeURIComponent(
                                    quest.title
                                  )}`
                                )
                              }
                              className={styles.btnStart}
                            >
                              <Play size={11} fill="currentColor" />
                              Resume
                            </button>
                          )}
                          {quest.status === "PENDING" && !isCurrentTarget && (
                            <button
                              onClick={() =>
                                router.push(
                                  `/focus?questId=${quest.id}&subjectName=${encodeURIComponent(
                                    quest.title
                                  )}`
                                )
                              }
                              className={styles.btnStart}
                            >
                              <Play size={11} fill="currentColor" />
                              Start
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Cumulative Focus (Streak Quest) Card */}
            {activeWeeklyQuest && (
              <section className={styles.streakCard} aria-label="Streak Quest">
                <div className={styles.streakHeader}>
                  <div className={styles.streakTitleGroup}>
                    <span className={styles.streakTag}>Streak Quest</span>
                    <span className={styles.streakTitle}>Cumulative Focus</span>
                  </div>

                  <div className={styles.streakRewards}>
                    <StreakFlameIcon size={13} />
                    <span>
                      +{activeWeeklyQuest.xpReward} XP • +{activeWeeklyQuest.sylphReward} Sylph
                    </span>
                  </div>
                </div>

                <div className={styles.streakProgressGroup}>
                  <div className={styles.streakMetaRow}>
                    <span>
                      {Math.floor((activeWeeklyQuest.progressMinutes || 0) / 60)}h{" "}
                      {(activeWeeklyQuest.progressMinutes || 0) % 60}m / 3h 00m
                      <span className="opacity-60 ml-2">
                        • Resets in {activeWeeklyQuest.daysRemaining || 1}d
                      </span>
                    </span>
                    <span className="font-semibold text-ink">
                      {activeWeeklyQuest.percentComplete || 0}%
                    </span>
                  </div>
                  <div className={styles.streakWell}>
                    <div
                      className={styles.streakFill}
                      style={{ width: `${activeWeeklyQuest.percentComplete || 0}%` }}
                    />
                  </div>
                </div>
              </section>
            )}
          </div>

          {/* ─── Right Column: Study Circle & System Insights (SUPPORTING) ─── */}
          <div className={styles.columnGroup}>
            {/* Study Circle (Friends) Card */}
            <section className={styles.friendsCard} aria-label="Study Circle">
              <div className={styles.sectionHeader}>
                <div className={styles.sectionTitleGroup}>
                  <Users size={18} className={styles.sectionIcon} />
                  <h2 className={styles.sectionTitle}>Study Circle</h2>
                </div>
                <Link href="/social" className={styles.cardHeaderLink}>
                  View All <ArrowRight size={12} />
                </Link>
              </div>

              {friends.length === 0 ? (
                <div className={styles.emptyContainer}>
                  <div className={styles.emptyIconCircle}>
                    <Users size={18} />
                  </div>
                  <p className={styles.emptyText}>
                    Connect with companions to study together.
                  </p>
                  <Link href="/social" className={styles.emptyActionBtn}>
                    Find Friends
                  </Link>
                </div>
              ) : (
                <div className={styles.friendsList}>
                  {/* Online Friends */}
                  {onlineFriends.length > 0 && (
                    <p className={`${styles.presenceGroupTitle} ${styles.presenceOnlineTitle}`}>
                      Online — {onlineFriends.length}
                    </p>
                  )}
                  {onlineFriends.slice(0, 3).map((friend) => (
                    <div key={friend.id} className={styles.friendRow}>
                      <div className={styles.friendMain}>
                        <div className={styles.friendAvatarWrapper}>
                          <div className={styles.friendAvatar}>
                            {friend.avatarUrl ? (
                              <img
                                src={friend.avatarUrl}
                                alt={friend.username}
                              />
                            ) : (
                              <span className={styles.friendAvatarInitial}>
                                {(friend.name || friend.username || "S")
                                  .charAt(0)
                                  .toUpperCase()}
                              </span>
                            )}
                          </div>
                          <span className={styles.presenceDot} />
                        </div>
                        <div className={styles.friendDetails}>
                          <Link
                            href={`/profile/${friend.username}`}
                            className={styles.friendName}
                          >
                            {friend.name || friend.username}
                          </Link>
                          <span className={styles.friendMeta}>
                            Lv. {friend.level} • {friend.todayMinutes}m today
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Offline Friends */}
                  {offlineFriends.length > 0 && (
                    <p className={styles.presenceGroupTitle}>
                      Offline — {offlineFriends.length}
                    </p>
                  )}
                  {offlineFriends.slice(0, 3).map((friend) => (
                    <div
                      key={friend.id}
                      className={`${styles.friendRow} ${styles.friendRowOffline}`}
                    >
                      <div className={styles.friendMain}>
                        <div className={styles.friendAvatarWrapper}>
                          <div className={styles.friendAvatar}>
                            {friend.avatarUrl ? (
                              <img
                                src={friend.avatarUrl}
                                alt={friend.username}
                              />
                            ) : (
                              <span className={styles.friendAvatarInitial}>
                                {(friend.name || friend.username || "S")
                                  .charAt(0)
                                  .toUpperCase()}
                              </span>
                            )}
                          </div>
                          <span
                            className={`${styles.presenceDot} ${styles.presenceDotOffline}`}
                          />
                        </div>
                        <div className={styles.friendDetails}>
                          <Link
                            href={`/profile/${friend.username}`}
                            className={styles.friendName}
                          >
                            {friend.name || friend.username}
                          </Link>
                          <span className={styles.friendMeta}>Lv. {friend.level}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* System Insights (Compact Right Rail Card) */}
            {visibleInsights.length > 0 && (
              <section className={styles.insightsContainer} aria-label="System Insights">
                <div className={styles.sectionHeader}>
                  <div className={styles.sectionTitleGroup}>
                    <SystemInsightsIcon size={18} className={styles.sectionIcon} />
                    <h2 className={styles.sectionTitle}>System Insights</h2>
                  </div>
                </div>

                <div
                  className={`${styles.insightsGrid} ${
                    isInsightsExpanded ? styles.insightsGridExpanded : styles.insightsGridCollapsed
                  }`}
                >
                  {visibleInsights.map((insight) => {
                    const badge = getInsightCategoryBadge(insight.category);
                    return (
                      <div key={insight.id} className={styles.insightCard}>
                        <div>
                          <span className={`${styles.insightBadge} ${badge.className}`}>
                            {badge.icon}
                            <span>{badge.label}</span>
                          </span>
                          <div>
                            <Suspense fallback={<div className="h-14 animate-pulse rounded bg-elevated" />}>
                              <MarkdownRenderer content={insight.content} compact />
                            </Suspense>
                          </div>
                        </div>
                        <span className={styles.insightDate}>
                          {new Date(insight.createdAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {visibleInsights.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setIsInsightsExpanded(!isInsightsExpanded)}
                    className={styles.insightsToggleBtn}
                    aria-expanded={isInsightsExpanded}
                  >
                    <span>{isInsightsExpanded ? "Show fewer insights" : `View all ${visibleInsights.length} insights`}</span>
                    <span>{isInsightsExpanded ? "▴" : "▾"}</span>
                  </button>
                )}
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default DashboardDesignScreen;
