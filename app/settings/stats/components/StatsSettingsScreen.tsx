"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  BookOpen,
  ChevronDown,
  Clock,
  Flame,
  Layers,
  Sparkles,
  Timer,
  TrendingUp,
} from "lucide-react";
import { useAuth } from "@/app/components/AuthProvider";
import { fetchCachedJSON } from "@/lib/client-data-cache";
import {
  MainHubLayout,
  HubLink,
  HubState,
} from "../../components/MainHubLayout";
import { CognitiveAttributes } from "./CognitiveAttributes";
import hub from "../../components/MainHub.module.css";
import styles from "./StatsSettingsScreen.module.css";

interface DailyStudy {
  date: string;
  minutes: number;
}

interface SubjectBreakdown {
  name: string;
  color: string;
  minutes: number;
  sessions: number;
}

interface QuestStats {
  total: number;
  completed: number;
  failed: number;
  pending: number;
  inProgress: number;
  totalXPEarned: number;
}

interface GoalStats {
  total: number;
  active: number;
  completed: number;
}

interface Summary {
  totalSessions: number;
  avgSessionMinutes: number;
  avgSessionSeconds: number;
  activeDaysLast30: number;
  longestSession: number;
  longestSessionSeconds: number;
  accountAgeDays: number;
  completionRate: number;
}

interface SessionLogEntry {
  id: number;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number;
  durationSeconds: number;
  breakSeconds: number;
  focusRate: number;
  subjectName: string | null;
  subjectColor: string | null;
  questTitle: string | null;
}

interface DetailedStats {
  user: {
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
    totalStudySeconds?: number;
    createdAt: string;
  };
  dailyStudy: DailyStudy[];
  subjectBreakdown: SubjectBreakdown[];
  sessionLog: SessionLogEntry[];
  questStats: QuestStats;
  goalStats: GoalStats;
  todayDate?: string;
  summary: Summary;
}

function duration(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(value / 3600),
    minutes = Math.floor((value % 3600) / 60),
    remainder = value % 60;
  if (hours) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  if (minutes) return `${minutes}m${remainder ? ` ${remainder}s` : ""}`;
  return `${remainder}s`;
}

function minutesLabel(minutes: number) {
  if (minutes >= 60) return duration(Math.round(minutes * 60));
  return `${Number(minutes.toFixed(1))}m`;
}

function dayLabel(
  date: string,
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }
) {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, options);
}

function StudyRhythm({ days, today }: { days: DailyStudy[]; today?: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const current =
    days.find((day) => day.date === selected) ??
    days.find((day) => day.date === today) ??
    days.at(-1);
  const max = Math.max(...days.map((day) => day.minutes), 1);
  return (
    <div className={styles.chart}>
      <div
        className={styles.chartReadout}
        aria-live="polite"
        aria-atomic="true"
      >
        <span>
          {current
            ? dayLabel(current.date, {
                weekday: "short",
                month: "short",
                day: "numeric",
              })
            : "No activity yet"}
          {current?.date === today ? " · Today" : ""}
        </span>
        <strong>
          {current ? minutesLabel(current.minutes) : "0m"}
          <small> focused</small>
        </strong>
      </div>
      <div className={styles.plot}>
        <div className={styles.gridLines} aria-hidden="true">
          <span>{minutesLabel(max)}</span>
          <span>{minutesLabel(max / 2)}</span>
          <span>0</span>
        </div>
        <div
          className={styles.bars}
          role="group"
          aria-label="Daily study time"
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
              return;
            const buttons = Array.from(
              event.currentTarget.querySelectorAll("button")
            );
            const index = buttons.indexOf(event.target as HTMLButtonElement);
            if (index < 0) return;
            event.preventDefault();
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? buttons.length - 1
                  : Math.max(
                      0,
                      Math.min(
                        buttons.length - 1,
                        index + (event.key === "ArrowLeft" ? -1 : 1)
                      )
                    );
            buttons[next]?.focus();
          }}
        >
          {days.map((day) => (
            <button
              key={day.date}
              className={styles.barButton}
              aria-pressed={current?.date === day.date}
              tabIndex={current?.date === day.date ? 0 : -1}
              aria-label={`${dayLabel(day.date)}: ${minutesLabel(day.minutes)} of study${day.date === today ? ", today" : ""}`}
              onFocus={() => setSelected(day.date)}
              onMouseEnter={() => setSelected(day.date)}
              onClick={() => setSelected(day.date)}
            >
              <span
                className={`${styles.bar} ${day.date === today ? styles.todayBar : ""}`}
                style={{
                  height: `${Math.max(day.minutes > 0 ? 2.5 : 1, (day.minutes / max) * 100)}%`,
                }}
              />
            </button>
          ))}
        </div>
      </div>
      <div className={styles.axis} aria-hidden="true">
        <span>{days[0] && dayLabel(days[0].date)}</span>
        <span>
          {days.length > 10
            ? dayLabel(days[Math.floor(days.length / 2)].date)
            : ""}
        </span>
        <span>
          {days.at(-1)?.date === today
            ? "Today"
            : days.at(-1) && dayLabel(days.at(-1)!.date)}
        </span>
      </div>
    </div>
  );
}

export function StatsSettingsScreen() {
  const { user: currentUser, isLoading: authLoading } = useAuth();
  const userId = currentUser?.id;
  const [response, setResponse] = useState<{
    key: string;
    data: DetailedStats | null;
    error: boolean;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [period, setPeriod] = useState<7 | 30>(30);
  const [visibleSessions, setVisibleSessions] = useState(6);

  const requestKey = `${userId}:${attempt}`;
  const isLoading = response?.key !== requestKey;
  const data = response?.key === requestKey ? response.data : null;
  const error = response?.key === requestKey && response.error;

  useEffect(() => {
    if (!userId) return;
    let active = true;
    fetchCachedJSON<DetailedStats>(
      "/api/user/detailed-stats",
      {},
      { ttlMs: 30_000, staleMs: 300_000, forceFresh: attempt > 0 }
    )
      .then((result) => {
        if (active) {
          setResponse({ key: requestKey, data: result, error: !result });
          setVisibleSessions(6);
        }
      })
      .catch(() => {
        if (active) setResponse({ key: requestKey, data: null, error: true });
      });
    return () => {
      active = false;
    };
  }, [userId, attempt, requestKey]);

  const content = () => {
    if (authLoading || (currentUser && isLoading))
      return <HubState loading title="Loading your progress…" />;
    if (!currentUser)
      return (
        <HubState title="Sign in to see your progress">
          <HubLink href="/login">Sign in</HubLink>
        </HubState>
      );
    if (error || !data)
      return (
        <HubState
          title="Stats are temporarily unavailable"
          onRetry={() => setAttempt((n) => n + 1)}
        >
          Your study history is safe. Reconnect to load your progress.
        </HubState>
      );
    const {
      user,
      dailyStudy,
      subjectBreakdown,
      sessionLog,
      questStats,
      goalStats,
      summary,
    } = data;
    const days = dailyStudy.slice(-period);
    const total = days.reduce((sum, day) => sum + day.minutes, 0);
    const activeDays = days.filter((day) => day.minutes > 0).length;
    const peakDay = days.reduce<DailyStudy | null>(
      (best, day) => (!best || day.minutes > best.minutes ? day : best),
      null
    );
    const lastWeek = dailyStudy
      .slice(-7)
      .reduce((sum, day) => sum + day.minutes, 0);
    const previousWeek = dailyStudy
      .slice(-14, -7)
      .reduce((sum, day) => sum + day.minutes, 0);
    const change =
      previousWeek > 0
        ? Math.round(((lastWeek - previousWeek) / previousWeek) * 100)
        : null;
    const subjectTotal = subjectBreakdown.reduce(
      (sum, subject) => sum + subject.minutes,
      0
    );
    const topSubject = subjectBreakdown.reduce<SubjectBreakdown | null>(
      (best, subject) =>
        !best || subject.minutes > best.minutes ? subject : best,
      null
    );
    const xp = Math.max(
      0,
      Math.min(
        100,
        Math.round((user.currentXP / Math.max(user.xpToNextLevel, 1)) * 100)
      )
    );
    const recentMetrics = [
      {
        label: "Lifetime focus",
        value: duration(user.totalStudySeconds ?? user.totalStudyMinutes * 60),
        icon: Clock,
        note: "All recorded study time",
      },
      {
        label: "Sessions",
        value: summary.totalSessions.toLocaleString(),
        icon: Layers,
        note: "Recent 35 days",
      },
      {
        label: "Average session",
        value: duration(summary.avgSessionSeconds),
        icon: Timer,
        note: "Recent 35 days",
      },
      {
        label: "Weekly streak",
        value: `${user.streakDays} ${user.streakDays === 1 ? "week" : "weeks"}`,
        icon: Flame,
        note: "Your current streak",
      },
    ];
    return (
      <>
        <section className={styles.overview} aria-label="Study overview">
          <div className={styles.focusTotal}>
            <p className={hub.label}>Focus time · last {period} days</p>
            <div className={styles.largeValue}>{minutesLabel(total)}</div>
            <p className={hub.caption}>
              {activeDays} active {activeDays === 1 ? "day" : "days"}{" "}
              <span className={styles.dot}>/</span> {days.length} days
            </p>
          </div>
          <div className={styles.overviewNote}>
            <span className={styles.noteIcon}>
              <TrendingUp size={21} aria-hidden="true" />
            </span>
            <div>
              <h2>
                {change !== null
                  ? change === 0
                    ? "A steady study rhythm"
                    : `${Math.abs(change)}% ${change > 0 ? "more" : "less"} focus this week`
                  : lastWeek > 0
                    ? "Your rhythm is taking shape"
                    : "Make room for your next session"}
              </h2>
              <p>
                {change !== null
                  ? `${minutesLabel(lastWeek)} in the last 7 days, compared with ${minutesLabel(previousWeek)} in the previous 7.`
                  : lastWeek > 0
                    ? `${minutesLabel(lastWeek)} recorded in the last 7 days. Every session adds to the picture.`
                    : "A little focused time today is a good place to begin."}
              </p>
            </div>
          </div>
        </section>
        <div className={styles.metrics}>
          {recentMetrics.map(({ label, value, icon: Icon, note }) => (
            <div className={styles.metric} key={label}>
              <p>
                <Icon size={14} aria-hidden="true" />
                {label}
              </p>
              <strong>{value}</strong>
              <small>{note}</small>
            </div>
          ))}
        </div>
        <div className={styles.rhythmLayout}>
          <section className={styles.rhythm} aria-label="Study rhythm">
            <div className={hub.sectionHeading}>
              <h2>Study rhythm</h2>
              <div className={hub.segmented} aria-label="Activity period">
                {([7, 30] as const).map((value) => (
                  <button
                    key={value}
                    aria-pressed={period === value}
                    onClick={() => setPeriod(value)}
                  >
                    {value} days
                  </button>
                ))}
              </div>
            </div>
            <StudyRhythm days={days} today={data.todayDate} />
            {!total && (
              <p className={styles.chartEmpty}>
                No focus time in this period. Your next session will appear
                here.
              </p>
            )}
          </section>
          <aside className={styles.insights} aria-label="Study insights">
            <span className={styles.insightLabel}>
              <Sparkles size={14} aria-hidden="true" /> In focus
            </span>
            <div>
              <p className={hub.label}>Most focused day · last {period} days</p>
              <h3>
                {peakDay && peakDay.minutes > 0
                  ? dayLabel(peakDay.date, { weekday: "long" })
                  : "A fresh start"}
              </h3>
              <p className={hub.caption}>
                {peakDay && peakDay.minutes > 0
                  ? `${dayLabel(peakDay.date)} · ${minutesLabel(peakDay.minutes)} of focus`
                  : "Record a session to discover your patterns."}
              </p>
            </div>
            <div>
              <p className={hub.label}>Leading subject · recent 35 days</p>
              <h3>
                {topSubject && topSubject.minutes > 0
                  ? topSubject.name
                  : "Room to explore"}
              </h3>
              <p className={hub.caption}>
                {topSubject && subjectTotal > 0
                  ? `${Math.round((topSubject.minutes / subjectTotal) * 100)}% of subject focus · ${minutesLabel(topSubject.minutes)}`
                  : "Choose a subject when you start your timer."}
              </p>
            </div>
            <HubLink href="/timer">Start a focus session</HubLink>
          </aside>
        </div>
        <div className={styles.breakdownLayout}>
          <section className={styles.subjects}>
            <div className={hub.sectionHeading}>
              <div>
                <h2>Where your time goes</h2>
                <p>Subject focus · recent 35 days</p>
              </div>
              <BookOpen size={17} aria-hidden="true" />
            </div>
            {subjectTotal > 0 ? (
              <>
                <div className={styles.allocation} aria-hidden="true">
                  {subjectBreakdown
                    .filter((s) => s.minutes > 0)
                    .map((s) => (
                      <span
                        key={s.name}
                        style={{
                          width: `${(s.minutes / subjectTotal) * 100}%`,
                          background: s.color || "var(--accent-primary)",
                        }}
                      />
                    ))}
                </div>
                <div className={styles.subjectList}>
                  {subjectBreakdown.map((subject) => (
                    <div key={subject.name}>
                      <span className={styles.subjectName}>
                        <i
                          style={{
                            background:
                              subject.color || "var(--accent-primary)",
                          }}
                        />
                        <span>
                          {subject.name}
                          <small>
                            {subject.sessions}{" "}
                            {subject.sessions === 1 ? "session" : "sessions"}
                          </small>
                        </span>
                      </span>
                      <span className={styles.subjectTime}>
                        {minutesLabel(subject.minutes)}
                        <small>
                          {Math.round((subject.minutes / subjectTotal) * 100)}%
                        </small>
                      </span>
                    </div>
                  ))}
                </div>
                <p className={hub.caption}>
                  {minutesLabel(subjectTotal)} recorded with a subject
                </p>
              </>
            ) : (
              <div className={styles.emptyInline}>
                <BookOpen size={25} aria-hidden="true" />
                <p>No subject focus yet.</p>
                <HubLink href="/timer">Study a subject</HubLink>
              </div>
            )}
          </section>
          <section className={styles.objectives}>
            <div className={hub.sectionHeading}>
              <h2>Turning focus into progress</h2>
              <HubLink href="/quests">Objectives</HubLink>
            </div>
            <div className={styles.completion}>
              <strong>
                {summary.completionRate}
                <span>%</span>
              </strong>
              <p>
                quest completion
                <small>
                  {questStats.completed} of {questStats.total} quests
                </small>
              </p>
            </div>
            <div
              className={styles.thinTrack}
              role="meter"
              aria-label="Quest completion"
              aria-valuenow={summary.completionRate}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span style={{ width: `${summary.completionRate}%` }} />
            </div>
            <div className={styles.questCounts}>
              <span>
                <strong>{questStats.completed}</strong>Completed
              </span>
              <span>
                <strong>{questStats.pending + questStats.inProgress}</strong>
                Active
              </span>
              <span>
                <strong>{questStats.failed}</strong>Failed
              </span>
            </div>
            <div className={styles.goalLine}>
              <span>Goals</span>
              <strong>
                {goalStats.active} active <i>·</i> {goalStats.completed}{" "}
                completed <i>·</i> {goalStats.total} total
              </strong>
            </div>
            <div className={styles.goalLine}>
              <span>Quest XP earned</span>
              <strong>{questStats.totalXPEarned.toLocaleString()} XP</strong>
            </div>
          </section>
        </div>
        <section className={styles.sessions} aria-label="Session history">
          <div className={hub.sectionHeading}>
            <div>
              <h2>Session history</h2>
              <p>
                Recent 35 days · {sessionLog.length}{" "}
                {sessionLog.length === 1 ? "session" : "sessions"}
              </p>
            </div>
            <span className={styles.sessionBest}>
              Longest{" "}
              <strong>
                {summary.longestSessionSeconds > 0
                  ? duration(summary.longestSessionSeconds)
                  : "—"}
              </strong>
            </span>
          </div>
          {sessionLog.length ? (
            <>
              <div className={styles.sessionHeader} aria-hidden="true">
                <span>Subject / quest</span>
                <span>Started</span>
                <span>Focus</span>
              </div>
              <div className={styles.sessionList}>
                {sessionLog.slice(0, visibleSessions).map((session) => {
                  const started = new Date(session.startedAt);
                  return (
                    <div className={styles.sessionRow} key={session.id}>
                      <div className={styles.sessionSubject}>
                        <i
                          style={{
                            background:
                              session.subjectColor || "var(--accent-primary)",
                          }}
                        />
                        <div>
                          <strong>
                            {session.subjectName || "General focus"}
                          </strong>
                          {session.questTitle && (
                            <small>{session.questTitle}</small>
                          )}
                          <p>
                            {session.breakSeconds > 0 && (
                              <span>
                                {duration(session.breakSeconds)} break
                              </span>
                            )}
                            {session.focusRate > 0 && (
                              <span>{session.focusRate}% focus rate</span>
                            )}
                            {!session.endedAt && <span>In progress</span>}
                          </p>
                        </div>
                      </div>
                      <time dateTime={session.startedAt}>
                        {started.toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          timeZone: currentUser.timezone || undefined,
                        })}
                        <small>
                          {started.toLocaleTimeString(undefined, {
                            hour: "2-digit",
                            minute: "2-digit",
                            timeZone: currentUser.timezone || undefined,
                          })}
                        </small>
                      </time>
                      <strong className={styles.sessionDuration}>
                        {duration(session.durationSeconds)}
                      </strong>
                    </div>
                  );
                })}
              </div>
              {visibleSessions < sessionLog.length && (
                <div className={styles.moreSessions}>
                  <button
                    className={hub.secondaryButton}
                    onClick={() => setVisibleSessions((n) => n + 10)}
                  >
                    Show more <ChevronDown size={14} aria-hidden="true" />
                  </button>
                  <button onClick={() => setVisibleSessions(sessionLog.length)}>
                    View all {sessionLog.length} sessions
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className={styles.emptyInline}>
              <Clock size={25} aria-hidden="true" />
              <p>Your first focus session starts your story.</p>
              <HubLink href="/timer">Open timer</HubLink>
            </div>
          )}
        </section>
        <section className={styles.progression} aria-label="Level progression">
          <div className={styles.identity}>
            <span className={styles.rankMark}>{user.hunterRank}</span>
            <div>
              <h2>{user.name || user.username}</h2>
              <p>
                {user.hunterRank}-Rank scholar · {summary.accountAgeDays} days
                on Sylf
              </p>
            </div>
          </div>
          <div className={styles.xp}>
            <div>
              <strong>Level {user.level}</strong>
              <span>
                {user.currentXP.toLocaleString()} /{" "}
                {user.xpToNextLevel.toLocaleString()} XP
              </span>
            </div>
            <div
              className={styles.thinTrack}
              role="meter"
              aria-label="Level experience"
              aria-valuenow={xp}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span style={{ width: `${xp}%` }} />
            </div>
          </div>
        </section>
        <CognitiveAttributes key={currentUser.id} />
      </>
    );
  };
  return (
    <MainHubLayout
      title="Stats"
      action={
        <Link href="/timer" className={hub.primaryButton}>
          Start studying <ArrowUpRight size={14} aria-hidden="true" />
        </Link>
      }
    >
      {content()}
    </MainHubLayout>
  );
}

export default StatsSettingsScreen;
