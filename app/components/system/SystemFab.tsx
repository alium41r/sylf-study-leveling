"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Lock } from "lucide-react";
import { SylvieIcon } from "../icons";
import Companion from "../landing/companion/Companion";
import { MOTION_SPRING, MOTION_TWEEN } from "@/lib/motion";
import type { PagePresence } from "./page-presence";
import type { QuotaInfo } from "../AiPlannerModal";
import styles from "./SystemFab.module.css";

interface SystemFabProps {
  presence: PagePresence;
  chatQuota: QuotaInfo | null;
  onClick: () => void;
}

/** The canonical Sylf companion opens the existing contextual conversation. */
export default function SystemFab({ presence, chatQuota, onClick }: SystemFabProps) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const reducedMotion = useReducedMotion();
  const attentive = hovered || focused;
  const quotaExhausted =
    chatQuota !== null && !chatQuota.unlimited && chatQuota.remaining === 0;

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: reducedMotion ? 0 : 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: reducedMotion ? 0 : 12 }}
      transition={reducedMotion ? { duration: 0 } : MOTION_TWEEN.fade}
      onClick={onClick}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      aria-label={`Ask Sylvie — ${presence.label} context${quotaExhausted ? " — daily AI limit reached" : ""}`}
      aria-haspopup="dialog"
      className={styles.launcher}
      data-attentive={attentive}
      data-system-companion="true"
    >
      <span className={styles.aura} aria-hidden="true" />
      <motion.span
        className={styles.character}
        animate={{ scale: attentive ? 1.45 : 1, y: attentive ? -8 : 0 }}
        transition={reducedMotion ? { duration: 0 } : MOTION_SPRING.snappy}
      >
        <Companion
          size={88}
          motion={reducedMotion ? "none" : "quiet"}
          preview={attentive ? {
            expression: "HAPPY",
            action: "HELLO",
            eyeExpression: "HAPPY",
          } : undefined}
        />
      </motion.span>
      <span className={styles.chatBadge} aria-hidden="true">
        {quotaExhausted ? <Lock size={12} /> : <SylvieIcon size={16} />}
      </span>
      <span className={styles.hint} aria-hidden="true">
        <span className={styles.hintTitle}>Ask Sylvie</span>
        <span className={styles.hintContext}>
          {quotaExhausted ? "Daily AI limit reached" : presence.label}
        </span>
      </span>
    </motion.button>
  );
}
