"use client";

import { useEffect, useState } from "react";
import { Brain, ChevronDown, Plus } from "lucide-react";
import { useAuth } from "@/app/components/AuthProvider";
import { invalidateClientCaches } from "@/lib/client-data-cache";
import { HubState } from "../../components/MainHubLayout";
import hub from "../../components/MainHub.module.css";
import styles from "./StatsSettingsScreen.module.css";

interface CognitiveAbility {
  key: string;
  label: string;
  description: string;
  perkName: string;
  perkLadder: string;
  value: number;
  tier: number;
  maxTier: number;
  nextTierAt: number | null;
  investable: boolean;
  costSp: number;
  costSylph: number;
}

interface CognitiveState {
  skillPoints: number;
  sylph: number;
  cap: number;
  abilities: CognitiveAbility[];
}

async function readAttributes(): Promise<CognitiveState> {
  const res = await fetch("/api/cognitive-stats/invest", {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Unavailable");
  return res.json();
}

function AttributeEditor() {
  const { refreshStats } = useAuth();
  const [state, setState] = useState<CognitiveState | null>(null);
  const [currency, setCurrency] = useState<"sp" | "sylph">("sylph");
  const [busyStat, setBusyStat] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const load = async () => {
    try {
      setState(await readAttributes());
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  };
  useEffect(() => {
    let active = true;
    readAttributes()
      .then((snapshot) => {
        if (active) setState(snapshot);
      })
      .catch(() => {
        if (active) setLoadError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const invest = async (key: string) => {
    if (!state || busyStat) return;
    setBusyStat(key);
    setFeedback(null);
    try {
      const res = await fetch("/api/cognitive-stats/invest", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stat: key, currency }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "Investment failed. Try again.");
      setFeedback(
        `${data.ability?.label ?? "Attribute"} increased to ${data.ability?.value}. +${data.amount} points · ${data.cost} ${currency === "sp" ? "SP" : "Sylph"} spent.`
      );
      invalidateClientCaches([
        "/api/user/stats",
        "/api/user/detailed-stats",
        "/api/skill-tree",
      ]);
      await Promise.all([load(), refreshStats()]);
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Connection lost. Try again."
      );
    } finally {
      setBusyStat(null);
    }
  };

  if (loadError)
    return (
      <HubState
        title="Attributes unavailable"
        onRetry={() => {
          void load();
        }}
      >
        Your progress is safe. Please try again.
      </HubState>
    );
  if (!state) return <HubState loading title="Loading attributes…" />;
  return (
    <div className={styles.attributesBody}>
      <div className={styles.attributeToolbar}>
        <p className={hub.caption}>
          Invest in passive study bonuses. Current cap: {state.cap}/100.
        </p>
        <div className={hub.segmented} aria-label="Investment currency">
          {(["sp", "sylph"] as const).map((c) => (
            <button
              key={c}
              aria-pressed={currency === c}
              onClick={() => setCurrency(c)}
              disabled={busyStat !== null}
            >
              {c === "sp" ? `${state.skillPoints} SP` : `${state.sylph} Sylph`}
            </button>
          ))}
        </div>
      </div>
      {feedback && (
        <p role="status" className={styles.feedback}>
          {feedback}
        </p>
      )}
      <div className={styles.attributesList}>
        {state.abilities.map((a) => {
          const cost = currency === "sp" ? a.costSp : a.costSylph;
          const affordable =
            (currency === "sp" ? state.skillPoints : state.sylph) >= cost;
          return (
            <div key={a.key} className={styles.attribute}>
              <div className={styles.attributeTitle}>
                <h3>{a.label}</h3>
                <span>
                  {a.value}
                  <small>/100</small>
                </span>
              </div>
              <div className={styles.thinTrack}>
                <span style={{ width: `${Math.min(100, a.value)}%` }} />
              </div>
              <p className={styles.perk}>
                <strong>{a.perkName}</strong> · Tier {a.tier}/{a.maxTier}
              </p>
              <p className={hub.caption}>{a.perkLadder}</p>
              {a.investable ? (
                <button
                  className={hub.secondaryButton}
                  onClick={() => {
                    void invest(a.key);
                  }}
                  disabled={busyStat !== null || !affordable}
                  aria-label={`Invest in ${a.label} with ${currency === "sp" ? "SP" : "Sylph"}`}
                  title={
                    !affordable
                      ? `You need ${cost} ${currency === "sp" ? "SP" : "Sylph"}`
                      : a.nextTierAt
                        ? `Next tier at ${a.nextTierAt}`
                        : "Maximum perk tier"
                  }
                >
                  <Plus size={13} aria-hidden="true" />
                  {busyStat === a.key
                    ? "Investing…"
                    : `5 points · ${cost} ${currency === "sp" ? "SP" : "Sylph"}`}
                </button>
              ) : (
                <span className={hub.pill}>
                  {a.value >= 100
                    ? "Maximum reached"
                    : `Level cap · ${state.cap}`}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CognitiveAttributes() {
  const [open, setOpen] = useState(false);
  return (
    <section className={styles.attributes}>
      <button
        className={styles.disclosure}
        aria-expanded={open}
        aria-controls="cognitive-attributes"
        onClick={() => setOpen((value) => !value)}
      >
        <Brain size={19} aria-hidden="true" />
        <span>
          <strong>Cognitive attributes</strong>
          <small>Invest Skill Points or Sylph to develop your abilities.</small>
        </span>
        <ChevronDown
          size={18}
          className={open ? styles.rotated : ""}
          aria-hidden="true"
        />
      </button>
      <div id="cognitive-attributes" hidden={!open}>
        {open && <AttributeEditor />}
      </div>
    </section>
  );
}
