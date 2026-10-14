"use client";

import { useEffect, useRef, useState } from "react";
import { LampDesk, Pause, Play } from "lucide-react";
import Companion from "../landing/companion/Companion";
import type { CompanionReaction } from "../landing/companion/model";
import {
  IslandScenery,
  Moon,
  Sky,
  HangingLantern,
} from "./IslandScenery";
import styles from "./StudyIsland.module.css";

export type IslandGreeting = string;

export type IslandAttention = "reading" | "curious" | "private";

/** The scene owns ambience only; credentials never enter the illustration. */
export default function StudyIslandScene({
  attention = "reading",
  greeting,
}: {
  attention?: IslandAttention;
  greeting?: IslandGreeting;
}) {
  const sceneRef = useRef<HTMLElement>(null);
  const [lit, setLit] = useState(true);
  const [paused, setPaused] = useState(false);
  const [reaction, setReaction] = useState<CompanionReaction>();
  const greetingSequence = useRef(0);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    let visible = true;
    const sync = () => {
      scene.dataset.active = String(visible && !document.hidden);
    };
    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting;
            sync();
          });
    observer?.observe(scene);
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  return (
    <aside
      ref={sceneRef}
      className={styles.scene}
      aria-label="Sylf’s floating study island"
      data-lit={lit}
      data-paused={paused}
    >
      {greeting && (
        <header className={styles.welcome}>
          <p>
            <span className={styles.quote} aria-hidden="true">
              “
            </span>
            {greeting}
            <span className={styles.quote} aria-hidden="true">
              ”
            </span>
          </p>
          <svg
            className={styles.welcomeThread}
            viewBox="0 0 88 28"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M5 3C23 11 51 12 71 3M49 10C47 17 52 22 62 23"
              stroke="currentColor"
              strokeWidth=".8"
              strokeLinecap="round"
            />
            <circle cx="65" cy="24" r="1.4" fill="currentColor" />
          </svg>
        </header>
      )}
      <div className={styles.world}>
        <div className={styles.aura} aria-hidden="true" />
        <Sky className={styles.sky} />
        <Moon className={styles.moon} />
        <HangingLantern className={styles.hangingLeft} />
        <HangingLantern className={styles.hangingRight} />
        <div className={styles.islandAssembly}>
          <IslandScenery />
          <button
            type="button"
            className={styles.companionButton}
            aria-label="Say hello to Sylf"
            onClick={() =>
              setReaction({ id: ++greetingSequence.current, type: "GREETING" })
            }
          >
            <Companion
              state="READING"
              size="HERO"
              motion={paused ? "none" : "quiet"}
              reaction={reaction}
              className={styles.companion}
              preview={
                attention === "reading"
                  ? undefined
                  : {
                      expression:
                        attention === "private" ? "SLEEPY" : "CURIOUS",
                      action: "READING",
                      eyeExpression:
                        attention === "private" ? "SLEEPY" : "CURIOUS",
                    }
              }
            />
            <span className={styles.greetingHint}>
              Say hello <span aria-hidden="true">✦</span>
            </span>
          </button>
        </div>
      </div>
      <div className={styles.sceneFooter}>
        <span className={styles.location}>THE FLOATING SANCTUARY</span>
        <div className={styles.controls}>
          <button
            type="button"
            onClick={() => setLit(!lit)}
            aria-pressed={lit}
            aria-label="Lantern light"
            title={lit ? "Dim the lanterns" : "Light the lanterns"}
          >
            <LampDesk size={15} aria-hidden="true" />
            <span>{lit ? "Lights on" : "Lights dimmed"}</span>
          </button>
          <button
            type="button"
            className={styles.motionControl}
            onClick={() => setPaused(!paused)}
            aria-pressed={paused}
            aria-label="Pause scene animation"
            title={paused ? "Resume scene" : "Pause scene"}
          >
            {paused ? (
              <Play size={14} aria-hidden="true" />
            ) : (
              <Pause size={14} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    </aside>
  );
}
