"use client";

/** Own-user adapter: progression signals and accessible reaction announcements.
 * Explicit previews/foreign users use the shared pure PixelCompanion presenter.
 * Physical size and saved logical density remain independent.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { ModularComposition } from "@/lib/pixel-display/content/asset";
import {
  type PixelDisplayHandle,
} from "@/lib/pixel-display/react/PixelDisplay";
import { usePixelCreations } from "@/lib/pixel-creations-client";
import { useLevelUp } from "@/app/components/LevelUpProvider";
import { useAuth } from "@/app/components/AuthProvider";
import {
  levelUpAnnouncement,
  useDashboardCompanionComposition,
  useDashboardCompanionDensity,
  useDashboardCompanionSignal,
  type CompanionSignalInput,
} from "../pixel-companion-adapter";
import { PixelCompanion } from "@/app/components/companion/PixelCompanion";
import styles from "./PixelCompanionCard.module.css";

export interface PixelCompanionCardProps {
  /** Physical CSS size; the dashboard supplies a fluid hero slot. */
  size?: number | string;
  /**
   * Logical resolution, in cells — the display's **pixel density**.
   *
   * Independent of `size`. Changing this changes how many cells the matrix has,
   * and therefore how large a logical pixel is, while the card keeps exactly the
   * same box: the renderer derives its backing store from the slot, never from
   * the matrix. This is not CSS zoom and not a resized canvas — the canvas's CSS
   * size and device-pixel size are identical across densities.
   *
   * Omitted, the card uses the **scholar's own saved preference**, which is what
   * a production surface wants. Passed explicitly, it overrides — which is how a
   * preview shows a density that has not been saved yet.
   */
  resolution?: number;
  /** Compatibility option for the bare content path. Composition framing is
   * resolved centrally; native drawings never receive a generic fill override. */
  characterFill?: number;
  /**
   * A signal from the surrounding surface. The dashboard's own level-up signal is
   * read from its owner; anything else is handed in.
   */
  signal?: CompanionSignalInput | null;
  /**
   * An **already-resolved** composition to draw, instead of the signed-in
   * scholar's.
   *
   * The customizer previews an unsaved draft, and the honest way to do that is to
   * run the real resolver and hand the result here — the card must not resolve a
   * configuration itself, because that would make it a second place where
   * cosmetics are interpreted.
   */
  composition?: ModularComposition | null;
  className?: string;
}

function OwnPixelCompanionCard({
  size = 110,
  resolution: resolutionOverride,
  characterFill = 0.9,
  signal: externalSignal = null,
  composition: explicitComposition = null,
  className,
}: PixelCompanionCardProps) {
  const signal = useDashboardCompanionSignal({ signal: externalSignal });
  const { user } = useAuth();
  const library = usePixelCreations(user?.id);
  const outfit = user?.characterConfig?.outfit;
  const hasArtworkSelection = typeof outfit === 'string' && outfit.startsWith("user:");
  /**
   * The composition, from the scholar's own configuration — or from an explicit
   * one when a caller is previewing a draft.
   *
   * Either way the card hands the display *assets*, never trait keys: a pedestal
   * key, an aura key and a relic key became a composition before they reached
   * here, so nothing on this surface knows what a Shop or a Locker is.
   */
  const scholarComposition = useDashboardCompanionComposition();
  const composition = explicitComposition ?? scholarComposition;
  const scholarDensity = useDashboardCompanionDensity();
  const resolution = resolutionOverride ?? scholarDensity;
  const { lastLevelUp } = useLevelUp();
  const [announcement, setAnnouncement] = useState("");

  // The announcement is written once per observed level-up, keyed by the same
  // run id the adapter reacts to, so the sentence and the celebration cannot
  // disagree about which event they are describing.
  const announcedRunId = useRef<number | null>(null);
  useEffect(() => {
    if (!lastLevelUp) return;
    if (announcedRunId.current === lastLevelUp.runId) return;
    announcedRunId.current = lastLevelUp.runId;
    setAnnouncement(levelUpAnnouncement(lastLevelUp));
  }, [lastLevelUp]);

  /**
   * Development-only probe.
   *
   * The same pattern the Pixel Display dev surface uses: a measurement hook that
   * exists only in development, so production code carries no test affordance.
   * It lets frame cost and idle behaviour be measured on the *real* card rather
   * than on a stand-in.
   */
  const publishProbe = useCallback(
    (handle: PixelDisplayHandle) => {
      if (process.env.NODE_ENV !== "development") return;
      (
        window as unknown as { __pixelDashboard?: unknown }
      ).__pixelDashboard = { handle, runtime: handle.runtime };
    },
    [],
  );

  const clearProbe = useCallback(() => {
    if (process.env.NODE_ENV !== "development") return;
    (window as unknown as { __pixelDashboard?: unknown }).__pixelDashboard = null;
  }, []);

  return (
    <div
      className={`${styles.slot} ${className ?? ""}`}
      style={{ "--pixel-card-size": typeof size === "number" ? `${size}px` : size } as React.CSSProperties}
      data-companion="pixel-display"
      data-empty={composition.base.id === 'pixel:empty'}
      data-state={signal.state}
      data-reacting={signal.isReacting ? "true" : "false"}
      data-signal={signal.signalKind ?? "none"}
      data-density={resolution}
    >
      <PixelCompanion emptyState={{ own: true, status: hasArtworkSelection && composition.base.id === 'pixel:empty' ? (library.loaded || library.error ? "Artwork unavailable" : "Loading artwork…") : undefined }} size="100%" resolution={resolution} composition={composition} displayBorder={user?.characterConfig?.displayBorder} pixelGap={user?.characterConfig?.pixelGap} content={{ state: signal.state, effect: signal.effect, reducedMotion: signal.reducedMotion, autoBlink: false, characterFill }} label="Your dashboard companion" onReady={publishProbe} onTeardown={clearProbe} />

      {/*
        Exposed only while a reaction is being reported, so the card is silent
        in its resting state and does not repeat the level-up overlay on every
        render. It is a plain region: a live region carries politeness and
        interruption semantics that belong to the surface, not to this card.
      */}
      {signal.isReacting && announcement ? (
        <span className={styles.srOnly} role="status">
          {announcement}
        </span>
      ) : null}
    </div>
  );
}

export function PixelCompanionCard(props: PixelCompanionCardProps) {
  if (props.composition) return <PixelCompanion composition={props.composition} resolution={props.resolution} size={props.size ?? 110} className={props.className} />;
  return <OwnPixelCompanionCard {...props} />;
}
export default PixelCompanionCard;
