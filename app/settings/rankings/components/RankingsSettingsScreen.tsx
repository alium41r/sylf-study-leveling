"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  ChevronDown,
  Clock,
  Flame,
  Globe,
  Shield,
  Target,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";
import { useAuth } from "@/app/components/AuthProvider";
import { fetchCachedJSON } from "@/lib/client-data-cache";
import {
  MainHubLayout,
  HubLink,
  HubState,
} from "../../components/MainHubLayout";
import hub from "../../components/MainHub.module.css";
import styles from "./RankingsSettingsScreen.module.css";

interface RankedUser {
  id: number;
  username: string;
  name: string | null;
  hunterRank: string;
  level: number;
  totalStudyMinutes: number;
  studyHours: number;
  streakDays: number;
  questsCompleted: number;
  isCurrentUser: boolean;
  rank: number;
  friendRank?: number;
}

interface RankingsData {
  global: RankedUser[];
  friends: RankedUser[];
  currentUserRank: number;
  totalPlayers: number;
}

type SortOption = "level" | "studyHours" | "streak" | "quests";
type TabOption = "global" | "friends";

const metrics = [
  { key: "level", label: "Level", icon: Shield },
  { key: "studyHours", label: "Focus hours", icon: Clock },
  { key: "streak", label: "Weekly streak", icon: Flame },
  { key: "quests", label: "Quests", icon: Target },
] as const;

function score(entry: RankedUser, sort: SortOption) {
  switch (sort) {
    case "studyHours":
      return `${entry.studyHours.toLocaleString()}h`;
    case "streak":
      return `${entry.streakDays} ${entry.streakDays === 1 ? "week" : "weeks"}`;
    case "quests":
      return entry.questsCompleted.toLocaleString();
    default:
      return `Lv. ${entry.level}`;
  }
}

function LadderRow({
  entry,
  sort,
  scope,
}: {
  entry: RankedUser;
  sort: SortOption;
  scope: TabOption;
}) {
  const position =
    scope === "friends" ? (entry.friendRank ?? entry.rank) : entry.rank;
  return (
    <tr
      className={`${entry.isCurrentUser ? styles.currentRow : ""} ${position <= 3 ? styles.leadingRow : ""}`}
      aria-current={entry.isCurrentUser ? "true" : undefined}
    >
      <td className={styles.position}>
        {position === 1 ? (
          <Trophy size={17} aria-label="1st place" />
        ) : (
          String(position).padStart(2, "0")
        )}
      </td>
      <td>
        <div className={styles.scholar}>
          <span className={styles.avatar} aria-hidden="true">
            {(entry.name || entry.username).slice(0, 1).toUpperCase()}
          </span>
          <div>
            <div className={styles.name}>
              <strong>{entry.name || entry.username}</strong>
              {entry.isCurrentUser && <span>You</span>}
            </div>
            <p>
              @{entry.username}
              <span className={styles.mobileGrade}>
                {" "}
                · {entry.hunterRank} rank
              </span>
            </p>
          </div>
        </div>
      </td>
      <td className={styles.grade}>
        <span>
          {entry.hunterRank}
          <small> Rank</small>
        </span>
      </td>
      <td className={styles.score}>{score(entry, sort)}</td>
    </tr>
  );
}

export function RankingsSettingsScreen() {
  const { user, isLoading: authLoading } = useAuth();
  const userId = user?.id;
  const [response, setResponse] = useState<{
    key: string;
    data: RankingsData | null;
    error: boolean;
  } | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("level");
  const [tab, setTab] = useState<TabOption>("global");
  const [attempt, setAttempt] = useState(0);

  const requestKey = `${userId}:${sortBy}:${attempt}`;
  const isLoading = response?.key !== requestKey;
  const data = response?.key === requestKey ? response.data : null;
  const error = response?.key === requestKey && response.error;

  useEffect(() => {
    if (!userId) return;
    let active = true;
    fetchCachedJSON<RankingsData>(
      `/api/user/rankings?sortBy=${sortBy}`,
      {},
      {
        ttlMs: 30_000,
        staleMs: 120_000,
        storageKey: `rankings:${sortBy}`,
        forceFresh: attempt > 0,
      }
    )
      .then((result) => {
        if (active)
          setResponse({ key: requestKey, data: result, error: !result });
      })
      .catch(() => {
        if (active) setResponse({ key: requestKey, data: null, error: true });
      });
    return () => {
      active = false;
    };
  }, [userId, sortBy, attempt, requestKey]);

  const entries = data ? (tab === "friends" ? data.friends : data.global) : [];
  const current =
    data?.friends.find((entry) => entry.isCurrentUser) ??
    data?.global.find((entry) => entry.isCurrentUser);
  const position =
    tab === "friends"
      ? (current?.friendRank ?? 0)
      : (data?.currentUserRank ?? 0);
  const population =
    tab === "friends" ? (data?.friends.length ?? 0) : (data?.totalPlayers ?? 0);
  const percentile =
    position > 0 && population > 0
      ? Math.min(100, Math.max(1, Math.ceil((position / population) * 100)))
      : null;
  const metric = metrics.find((item) => item.key === sortBy)!;
  const currentIndex = entries.findIndex((entry) => entry.isCurrentUser);
  const ahead = currentIndex > 0 ? entries[currentIndex - 1] : null;
  const soloFriends =
    tab === "friends" && entries.length === 1 && entries[0].isCurrentUser;
  const pending = authLoading || (Boolean(user) && isLoading);

  return (
    <MainHubLayout title="Rankings">
      <div className={styles.toolbar}>
        <div className={hub.segmented} aria-label="Leaderboard scope">
          <button
            onClick={() => setTab("global")}
            aria-pressed={tab === "global"}
          >
            <Globe size={14} aria-hidden="true" />
            Global
          </button>
          <button
            onClick={() => setTab("friends")}
            aria-pressed={tab === "friends"}
          >
            <Users size={14} aria-hidden="true" />
            Friends
          </button>
        </div>
        <label className={styles.sortLabel}>
          <span>Rank by</span>
          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as SortOption)}
            aria-label="Rank by"
          >
            {metrics.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>
          <ChevronDown size={13} aria-hidden="true" />
        </label>
      </div>
      {pending ? (
        <HubState loading title="Loading the ladder…" />
      ) : !user ? (
        <HubState title="Sign in to find your place">
          <HubLink href="/login">Sign in</HubLink>
        </HubState>
      ) : error || !data ? (
        <HubState
          title="Rankings are temporarily unavailable"
          onRetry={() => setAttempt((n) => n + 1)}
        >
          Please reconnect to see the latest standings.
        </HubState>
      ) : (
        <div className={styles.layout}>
          <aside className={styles.standing} aria-label="Your standing">
            <div className={styles.standingTop}>
              <span>
                Your {tab === "friends" ? "friends" : "global"} standing
              </span>
              <metric.icon size={16} aria-hidden="true" />
            </div>
            <div className={styles.rankNumber}>
              {position > 0 ? (
                <>
                  <span>#</span>
                  {position.toLocaleString()}
                </>
              ) : (
                "—"
              )}
            </div>
            <p className={styles.rankContext}>
              {position > 0
                ? `of ${population.toLocaleString()} ${population === 1 ? "scholar" : "scholars"} · ${metric.label.toLowerCase()}`
                : "Your place is still taking shape"}
            </p>
            {percentile !== null && (
              <div className={styles.percentile}>
                <div>
                  <span>Top {percentile}%</span>
                  <span>
                    {tab === "friends" ? "In your circle" : "Across Sylf"}
                  </span>
                </div>
                <div className={styles.positionTrack}>
                  <span
                    style={{
                      width: `${Math.max(2, ((population - position + 1) / population) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}
            <div className={styles.personalMetric}>
              <metric.icon size={18} aria-hidden="true" />
              <div>
                <strong>{current ? score(current, sortBy) : "—"}</strong>
                <span>Your {metric.label.toLowerCase()}</span>
              </div>
            </div>
            <div className={styles.standingNote}>
              <span className={styles.noteIcon}>
                <TrendingUp size={17} aria-hidden="true" />
              </span>
              <div>
                <h2>
                  {position === 1 && !soloFriends
                    ? "Setting the pace"
                    : ahead
                      ? "Your next place"
                      : "Progress worth showing up for"}
                </h2>
                <p>
                  {position === 1 && !soloFriends
                    ? "Every focused session builds on what you’ve earned."
                    : ahead
                      ? `${ahead.name || ahead.username} is just ahead at ${score(ahead, sortBy)}. Keep your own rhythm.`
                      : "Study consistently, complete quests, and let your progress add up."}
                </p>
              </div>
            </div>
            <Link href="/timer" className={hub.primaryButton}>
              Keep studying <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
            <p className={styles.standingFoot}>
              All-time achievements. Updated as scholars progress.
            </p>
          </aside>
          <section
            className={styles.board}
            aria-label={`${tab === "friends" ? "Friends" : "Global"} leaderboard`}
          >
            <div className={hub.sectionHeading}>
              <div>
                <h2>
                  {tab === "friends" ? "Your circle" : "The global ladder"}
                </h2>
                <p>
                  {tab === "friends"
                    ? "A little friendly motivation."
                    : "Built one focused session at a time."}
                </p>
              </div>
              <span className={hub.pill}>
                {tab === "friends"
                  ? `${population} ${population === 1 ? "scholar" : "scholars"}`
                  : `Top ${entries.length}`}
              </span>
            </div>
            {entries.length ? (
              <>
                <table className={styles.table}>
                  <caption className="sr-only">
                    {tab === "friends" ? "Friends" : "Global"} rankings ordered
                    by {metric.label.toLowerCase()}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Place</th>
                      <th scope="col">Scholar</th>
                      <th scope="col" className={styles.grade}>
                        Rank
                      </th>
                      <th scope="col">{metric.label}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry) => (
                      <LadderRow
                        key={entry.id}
                        entry={entry}
                        sort={sortBy}
                        scope={tab}
                      />
                    ))}
                  </tbody>
                </table>
                {soloFriends && (
                  <div className={styles.friendsNote}>
                    <Users size={23} aria-hidden="true" />
                    <div>
                      <h3>Better with a study circle</h3>
                      <p>Add friends to share a little motivation.</p>
                    </div>
                    <HubLink href="/social">Find friends</HubLink>
                  </div>
                )}
              </>
            ) : (
              <div className={styles.empty}>
                <Trophy size={30} aria-hidden="true" />
                <h3>
                  {tab === "friends"
                    ? "Your circle starts here"
                    : "A new ladder is taking shape"}
                </h3>
                <p>
                  {tab === "friends"
                    ? "Find friends on Social to compare your progress."
                    : "Come back after your next study session."}
                </p>
                <HubLink href={tab === "friends" ? "/social" : "/timer"}>
                  {tab === "friends" ? "Find friends" : "Start studying"}
                </HubLink>
              </div>
            )}
            <div className={styles.boardFoot}>
              <span>
                <Shield size={12} aria-hidden="true" />
                {sortBy === "level"
                  ? "Levels are ordered by XP when tied."
                  : `${metric.label} ranked from highest to lowest.`}
              </span>
              {tab === "global" && data.totalPlayers > entries.length && (
                <span>
                  Showing {entries.length} of{" "}
                  {data.totalPlayers.toLocaleString()}
                </span>
              )}
            </div>
          </section>
        </div>
      )}
    </MainHubLayout>
  );
}

export default RankingsSettingsScreen;
