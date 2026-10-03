"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Award,
  Check,
  Coins,
  LockKeyhole,
  Search,
  Sparkles,
  Trophy,
  Zap,
} from "lucide-react";
import { useAuth } from "@/app/components/AuthProvider";
import {
  ACHIEVEMENT_CATEGORIES,
  type AchievementCategory,
  type EnrichedAchievement,
} from "@/lib/achievements-catalog";
import { invalidateClientCaches } from "@/lib/client-data-cache";
import { LibraryEmpty, SystemLibrary } from "../../components/SystemLibrary";
import styles from "../../components/SystemLibrary.module.css";

type Status = "All" | "Ready to claim" | "In progress" | "Claimed";
const NOTES: Record<AchievementCategory, string> = {
  Study: "Your recorded focus time.",
  Subjects: "Subjects you have created.",
  Streaks: "Consecutive weekly focus milestones.",
  Rank: "Level milestones from D-Rank to Monarch.",
  Quests: "Completed study quests.",
  Planning: "Confirmed Exam, Roadmap, and Mastery plans.",
  Social: "Friends and shared focus.",
  Exploration: "Personal images, items, and Sylph spending.",
};

export function AchievementsSettingsScreen() {
  const { user } = useAuth();
  return <AchievementsContent key={user?.id || "guest"} />;
}

function AchievementsContent() {
  const { user, mutateUser } = useAuth();
  const [achievements, setAchievements] = useState<EnrichedAchievement[]>([]);
  const [category, setCategory] = useState<AchievementCategory | "All">("All");
  const [status, setStatus] = useState<Status>("All");
  const [query, setQuery] = useState("");
  const sheetRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (sheetRef.current) sheetRef.current.scrollTop = 0;
  }, [category, status, query]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [retiredCount, setRetiredCount] = useState(0);
  const claimingRef = useRef(false);
  const requestVersion = useRef(0);
  const userId = user?.id;

  const load = useCallback(async () => {
    if (!userId) return;
    const version = ++requestVersion.current;
    try {
      const response = await fetch("/api/achievements", { cache: "no-store" });
      if (!response.ok)
        throw new Error(
          "Your milestone register could not be loaded. Please try again."
        );
      const data = await response.json();
      if (requestVersion.current !== version) return;
      setAchievements(data.achievements || []);
      setRetiredCount(data.retiredClaimedCount || 0);
    } catch (failure) {
      if (requestVersion.current === version)
        setError(
          failure instanceof Error
            ? failure.message
            : "Could not load achievements."
        );
    } finally {
      if (requestVersion.current === version) setLoading(false);
    }
  }, [userId]);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void load();
    });
    return () => {
      active = false;
      requestVersion.current += 1;
    };
  }, [load]);

  const claim = async (achievement: EnrichedAchievement) => {
    if (claimingRef.current) return;
    claimingRef.current = true;
    setClaiming(achievement.id);
    setError(null);
    setNotice(null);
    const version = requestVersion.current;
    try {
      const response = await fetch("/api/achievements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ achievementId: achievement.id }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Reward could not be claimed.");
      if (requestVersion.current !== version) return;
      if (data.user && user) mutateUser({ ...user, ...data.user });
      setAchievements((previous) =>
        previous.map((entry) =>
          entry.id === achievement.id ? { ...entry, isClaimed: true } : entry
        )
      );
      setNotice(
        `${achievement.title}: +${achievement.reward.amount.toLocaleString()} ${achievement.reward.type === "SYLPH" ? "Sylph" : "XP"} claimed.`
      );
      invalidateClientCaches([
        "achievements",
        "collection:",
        "/api/currency/stats",
        "/api/user/stats",
        "/api/rankings",
        "/api/inventory",
      ]);
      // Refetch without the stale cache: an XP reward may also unlock rank milestones.
      setLoading(true);
      await load();
    } catch (failure) {
      if (requestVersion.current === version)
        setError(
          failure instanceof Error
            ? failure.message
            : "Reward could not be claimed."
        );
    } finally {
      claimingRef.current = false;
      setClaiming(null);
    }
  };
  const claimed = achievements.filter((entry) => entry.isClaimed).length;
  const ready = achievements.filter(
    (entry) => !entry.isClaimed && entry.currentProgress >= entry.target
  ).length;
  const percent = achievements.length
    ? Math.round((claimed / achievements.length) * 100)
    : 0;
  const categories = ACHIEVEMENT_CATEGORIES.filter((name) =>
    achievements.some((entry) => entry.category === name)
  );
  const search = query.trim().toLowerCase();
  const visible = achievements.filter((entry) => {
    if (category !== "All" && category !== entry.category) return false;
    if (
      search &&
      ![entry.title, entry.description, entry.category].some((text) =>
        text.toLowerCase().includes(search)
      )
    )
      return false;
    const claimable = !entry.isClaimed && entry.currentProgress >= entry.target;
    return (
      status === "All" ||
      (status === "Claimed" && entry.isClaimed) ||
      (status === "Ready to claim" && claimable) ||
      (status === "In progress" && !entry.isClaimed && !claimable)
    );
  });

  return (
    <SystemLibrary volume="Achievements">
      <section className={styles.summary} aria-label="Achievement overview">
        <div>
          <p className={styles.eyebrow}>Your journey / Milestone register</p>
          <h2 className={styles.summaryTitle}>Every chapter leaves a mark.</h2>
        </div>
        <div className={styles.metrics}>
          {[
            [achievements.length, "Milestones"],
            [claimed, "Claimed"],
            [ready, "Ready to claim"],
          ].map(([value, label]) => (
            <div className={styles.metric} key={label}>
              <strong>
                {loading && !achievements.length
                  ? "—"
                  : Number(value).toLocaleString()}
              </strong>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </section>
      {error && (
        <div className={styles.error} role="alert">
          <span>{error}</span>
          <button
            onClick={() => {
              setLoading(true);
              setError(null);
              void load();
            }}
          >
            Reload register
          </button>
        </div>
      )}
      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}
      <div className={styles.folio}>
        <aside className={styles.index} aria-label="Achievement index">
          <p className={styles.indexLabel}>Milestone index</p>
          <button
            aria-pressed={category === "All"}
            onClick={() => setCategory("All")}
          >
            <Trophy size={15} />
            <span>All milestones</span>
            <small>
              {claimed}/{achievements.length}
            </small>
          </button>
          {categories.map((name) => {
            const entries = achievements.filter(
              (entry) => entry.category === name
            );
            return (
              <button
                key={name}
                aria-pressed={category === name}
                onClick={() => setCategory(name)}
              >
                <Award size={15} />
                <span>{name}</span>
                <small>
                  {entries.filter((entry) => entry.isClaimed).length}/
                  {entries.length}
                </small>
              </button>
            );
          })}
          <div className={styles.indexNote}>
            <p>{percent}% of the current register claimed</p>
            <div className={styles.track}>
              <span style={{ width: `${percent}%` }} />
            </div>
          </div>
        </aside>
        <section
          ref={sheetRef}
          className={styles.sheet}
          aria-label="Milestone register"
          aria-busy={loading}
          tabIndex={0}
        >
          <div className={styles.runningHead}>
            <span>Sylf / Achievements</span>
            <span>
              Volume 02 · {claimed} / {achievements.length}
            </span>
          </div>
          <div className={styles.sectionHeader}>
            <div>
              <h2>
                {category === "All" ? "The milestone register" : category}
              </h2>
              <p>
                {category === "All"
                  ? "Track progress and claim rewards."
                  : NOTES[category]}
              </p>
            </div>
          </div>
          <div className={styles.tools}>
            <label className={styles.search}>
              <Search size={15} aria-hidden="true" />
              <input
                type="search"
                aria-label="Search achievements"
                placeholder="Find a milestone…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <div className={styles.filters} aria-label="Achievement status">
              {(
                ["All", "Ready to claim", "In progress", "Claimed"] as Status[]
              ).map((filter) => (
                <button
                  key={filter}
                  aria-pressed={status === filter}
                  onClick={() => setStatus(filter)}
                >
                  {filter}
                  {filter === "Ready to claim" && ready > 0
                    ? ` (${ready})`
                    : ""}
                </button>
              ))}
            </div>
          </div>
          {loading && !achievements.length ? (
            <p className={styles.loading} role="status">
              Opening your milestone register…
            </p>
          ) : visible.length ? (
            categories
              .filter((name) => category === "All" || category === name)
              .map((name) => {
                const entries = visible.filter(
                  (entry) => entry.category === name
                );
                if (!entries.length) return null;
                return (
                  <div key={name}>
                    <h3 className={styles.groupTitle}>
                      {name} · {entries.length}{" "}
                      {entries.length === 1 ? "milestone" : "milestones"}
                    </h3>
                    {entries.map((entry) => {
                      const claimable =
                        !entry.isClaimed &&
                        entry.currentProgress >= entry.target;
                      const progress = Math.min(
                        100,
                        Math.round((entry.currentProgress / entry.target) * 100)
                      );
                      return (
                        <article
                          key={entry.id}
                          className={styles.entry}
                          aria-label={entry.title}
                        >
                          <span
                            className={styles.entryNumber}
                            aria-hidden="true"
                          >
                            {entry.isClaimed ? (
                              <Check size={17} />
                            ) : claimable ? (
                              <Sparkles size={17} />
                            ) : (
                              String(achievements.indexOf(entry) + 1).padStart(
                                2,
                                "0"
                              )
                            )}
                          </span>
                          <div>
                            <div className={styles.entryHeading}>
                              <h3>{entry.title}</h3>
                              <span className={styles.badge}>
                                {entry.rarity}
                              </span>
                            </div>
                            {!["studyMinutes", "quests", "level"].includes(
                              entry.metric
                            ) && <p>{entry.description}</p>}
                            {!entry.isClaimed && (
                              <div className={styles.progress}>
                                <div className={styles.progressLabel}>
                                  <span>{progressLabel(entry)}</span>
                                  <span>{progress}%</span>
                                </div>
                                <div
                                  className={styles.track}
                                  role="progressbar"
                                  aria-label={`${entry.title} progress`}
                                  aria-valuemin={0}
                                  aria-valuemax={entry.target}
                                  aria-valuenow={entry.currentProgress}
                                  aria-valuetext={progressLabel(entry)}
                                >
                                  <span style={{ width: `${progress}%` }} />
                                </div>
                              </div>
                            )}
                          </div>
                          <div className={styles.entryReward}>
                            <span
                              className={`${styles.reward} ${entry.reward.type === "SYLPH" ? styles.rewardCurrency : ""}`}
                            >
                              {entry.reward.type === "SYLPH" ? (
                                <Coins size={14} />
                              ) : (
                                <Zap size={14} />
                              )}
                              +{entry.reward.amount.toLocaleString()}{" "}
                              {entry.reward.type === "SYLPH" ? "Sylph" : "XP"}
                            </span>
                            {entry.isClaimed ? (
                              <span
                                className={`${styles.badge} ${styles.active}`}
                              >
                                <Check size={12} />
                                Claimed
                              </span>
                            ) : claimable ? (
                              <button
                                className={styles.claim}
                                disabled={claiming !== null}
                                aria-label={`Claim ${entry.title}`}
                                onClick={() => void claim(entry)}
                              >
                                {claiming === entry.id
                                  ? "Claiming…"
                                  : "Claim reward"}
                              </button>
                            ) : (
                              <span className={styles.badge}>
                                <LockKeyhole size={11} />
                                In progress
                              </span>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                );
              })
          ) : (
            <LibraryEmpty
              title={
                error && !achievements.length
                  ? "Register unavailable"
                  : "No matching milestones"
              }
            >
              {error && !achievements.length
                ? "Reload your register to see your current progress."
                : "Try another category, status, or search."}
            </LibraryEmpty>
          )}
          {retiredCount > 0 && (
            <p className={styles.notice}>
              {retiredCount} earlier{" "}
              {retiredCount === 1 ? "honor is" : "honors are"} retained in your
              history.
            </p>
          )}
          <footer className={styles.footer}>
            <span>Every effort recorded</span>
            <span>Sylf / Achievements</span>
          </footer>
        </section>
      </div>
    </SystemLibrary>
  );
}
function progressLabel(entry: EnrichedAchievement) {
  if (entry.metric === "level")
    return `Level ${entry.currentProgress} / ${entry.target}`;
  const unit =
    { studyMinutes: "min", streakWeeks: "weeks", sylphSpent: "Sylph" }[
      entry.metric as "studyMinutes" | "streakWeeks" | "sylphSpent"
    ] || "";
  return `${entry.currentProgress.toLocaleString()} / ${entry.target.toLocaleString()} ${unit}`.trim();
}
export default AchievementsSettingsScreen;
