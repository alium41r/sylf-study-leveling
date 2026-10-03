"use client";

import { useEffect, useId, useRef, type RefObject } from "react";
import {
  buildJourneyPath,
  journeyYForScroll,
  pointAtJourneyY,
  journeyDistanceAtY,
  snapPixelPosition,
  type JourneyPoint,
  type JourneyDistance,
} from "./journey-geometry";
import JourneyCompanion, {
  type JourneyCompanionHandle,
} from "../companion/JourneyCompanion";
import { JourneyMovement, stateForWaypoint } from "../companion/journey-motion";
import type { CompanionState } from "../companion/model";
import { usePixelCompanionVariant } from "../companion/pixel-preview";
import styles from "./Journey.module.css";
import botanical from "./BotanicalTrail.module.css";

type GrowthStage = "leaves" | "blooms" | "arcane" | "connected" | "grown";
type JourneyStop = {
  y: number;
  message: string;
  stage: GrowthStage;
  state: CompanionState;
};
type GrowthMark = { element: SVGUseElement; length: number; state: string };

function stageFor(anchor: HTMLElement): GrowthStage {
  switch (anchor.closest("section[id]")?.id) {
    case "progression":
      return "blooms";
    case "study-ai":
      return "arcane";
    case "together":
      return "connected";
    case "early-access":
      return "grown";
    default:
      return "leaves";
  }
}

function motifFor(stage: GrowthStage, index: number) {
  if (stage === "arcane" && index % 4 === 0) return "rune";
  if (stage === "connected" && index % 3 === 0) return "connected";
  if ((stage === "blooms" || stage === "grown") && index % 4 === 0)
    return "bloom";
  if (stage === "grown" && index % 3 === 0) return "connected";
  if (index % 5 === 0) return "sprout";
  return index % 3 === 1 ? "seed" : "leaf";
}

export default function JourneyPath({
  root,
  paused,
}: {
  root: RefObject<HTMLDivElement | null>;
  paused: boolean;
}) {
  const symbolId = useId();
  const pixelVariant = usePixelCompanionVariant();
  const svg = useRef<SVGSVGElement>(null);
  const track = useRef<SVGPathElement>(null);
  const marks = useRef<SVGGElement>(null);
  const traveler = useRef<HTMLDivElement>(null);
  const companion = useRef<JourneyCompanionHandle>(null);

  useEffect(() => {
    const container = root.current,
      path = track.current,
      walker = traveler.current,
      growth = marks.current;
    if (!container || !path || !walker || !growth) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const message = walker.querySelector<HTMLElement>(
      "[data-companion-message]"
    );
    const movement = new JourneyMovement();
    let frame = 0,
      total = 0,
      origin = 0,
      originX = 0,
      lastTime = 0;
    let pixelOffset: JourneyPoint | null = null;
    let stops: JourneyStop[] = [];
    let points: JourneyPoint[] = [];
    let distances: JourneyDistance[] = [];
    let heroExitY: number | undefined;
    let growthMarks: GrowthMark[] = [];
    let previousPoint: { x: number; y: number } | null = null;
    const targetY = () =>
      paused || reduced.matches
        ? stops[0].y
        : journeyYForScroll({
            scrollY: window.scrollY,
            viewportHeight: window.innerHeight,
            origin,
            startY: stops[0].y,
            endY: stops[stops.length - 1].y,
            heroExitY,
          });
    const nearestStop = (y: number) =>
      stops.reduce(
        (best, stop) =>
          Math.abs(stop.y - y) < Math.abs(best.y - y) ? stop : best,
        stops[0]
      );
    const suspend = () => {
      companion.current?.present("IDLE", false);
      previousPoint = null;
      walker.dataset.moving = "false";
    };
    const paint = (dt = 0) => {
      const point = pointAtJourneyY(points, movement.y);
      const length = journeyDistanceAtY(distances, movement.y);
      const velocity =
        previousPoint && dt > 0
          ? {
              x: (point.x - previousPoint.x) / dt,
              y: (point.y - previousPoint.y) / dt,
            }
          : { x: 0, y: 0 };
      previousPoint = point;
      const viewportY = point.y + origin - window.scrollY;
      const visible =
        !document.hidden &&
        // A static hero needs no scroll updates to reappear when returning to
        // the top. Its document position naturally takes it out of the viewport.
        (paused ||
          reduced.matches ||
          (viewportY > -30 && viewportY < window.innerHeight + 180));
      // The trajectory and its physics remain continuous. Only the pixel
      // presentation rounds the final canvas origin; SVG keeps the original point.
      const displayed = pixelOffset
        ? snapPixelPosition(
            point,
            {
              x: originX + pixelOffset.x,
              y: origin - window.scrollY + pixelOffset.y,
            },
            window.devicePixelRatio
          )
        : point;
      walker.style.transform = `translate3d(${displayed.x}px, ${displayed.y}px, 0)`;
      const visibility = visible ? "visible" : "hidden";
      if (walker.style.visibility !== visibility)
        walker.style.visibility = visibility;
      const moving = String(movement.active);
      if (walker.dataset.moving !== moving) walker.dataset.moving = moving;
      const hero = String(heroExitY !== undefined && movement.y < heroExitY);
      if (walker.dataset.hero !== hero) walker.dataset.hero = hero;
      const nearby = nearestStop(movement.y);
      // SVG holds the nearby chapter's expression while traveling through its
      // range. The frozen raster comparison keeps its original idle-on-travel behavior.
      const state =
        pixelVariant !== "svg" && movement.active
          ? "IDLE"
          : window.scrollY < 24
            ? "GREETING"
            : nearby.state;
      if (walker.dataset.motionState !== state)
        walker.dataset.motionState = state;
      const settling =
        companion.current?.present(
          state,
          visible && !paused && !reduced.matches,
          velocity,
          dt,
          pixelVariant === "svg" && !paused && !reduced.matches
        ) ?? false;
      if (walker.dataset.stage !== nearby.stage)
        walker.dataset.stage = nearby.stage;
      const nextMessage =
        pixelVariant !== "svg" && movement.active
          ? "One step at a time."
          : nearby.message;
      if (message && message.textContent !== nextMessage)
        message.textContent = nextMessage;
      for (const mark of growthMarks) {
        const state =
          Math.abs(mark.length - length) < 105
            ? "growing"
            : mark.length < length
              ? "grown"
              : "dormant";
        if (state !== mark.state) {
          mark.element.dataset.state = state;
          mark.state = state;
        }
      }
      return settling;
    };
    const draw = (time: number) => {
      frame = 0;
      if (!total || document.hidden || paused || reduced.matches) {
        suspend();
        return;
      }
      const dt = Math.min(time - (lastTime || time - 16), 48) / 1000;
      lastTime = time;
      movement.advance(targetY(), dt);
      const settling = paint(dt);
      if (movement.active || settling) frame = requestAnimationFrame(draw);
      else lastTime = 0;
    };
    const schedule = () => {
      if (document.hidden || paused || reduced.matches) {
        suspend();
        return;
      }
      if (!frame) frame = requestAnimationFrame(draw);
    };
    const measure = () => {
      const bounds = container.getBoundingClientRect();
      origin = bounds.top + window.scrollY;
      originX = bounds.left;
      pixelOffset = null;
      if (pixelVariant !== "svg") {
        const pixel = walker.querySelector<HTMLElement>(
          '[data-sylf-companion="pixel"]'
        );
        if (pixel) {
          const canvas = pixel.querySelector<HTMLElement>(
            "[data-pixel-canvas]"
          );
          const raster = (canvas ?? pixel).getBoundingClientRect();
          const travelerBounds = walker.getBoundingClientRect();
          // Cache geometry at layout/variant changes, avoiding frame-by-frame
          // layout reads. The Phase 1 full image is contained in the same square.
          const side = Math.min(raster.width, raster.height);
          pixelOffset = {
            x:
              raster.left -
              travelerBounds.left +
              (canvas ? 0 : (raster.width - side) / 2),
            y:
              raster.top -
              travelerBounds.top +
              (canvas ? 0 : (raster.height - side) / 2),
          };
        }
      }
      const anchors = [
        ...container.querySelectorAll<HTMLElement>("[data-journey-stop]"),
      ]
        .map((anchor) => {
          const rect = anchor.getBoundingClientRect();
          return {
            anchor,
            x: rect.left - bounds.left + rect.width / 2,
            y: rect.top - bounds.top + rect.height / 2,
          };
        })
        .sort((a, b) => a.y - b.y);
      if (anchors.length < 2) return;
      points = anchors;
      heroExitY = anchors[0].anchor.hasAttribute("data-journey-start")
        ? anchors[1].y
        : undefined;
      stops = anchors.map(({ anchor, y }) => ({
        y,
        message: anchor.dataset.message || "Let’s grow.",
        stage: stageFor(anchor),
        state: anchor.closest("#study-ai")
          ? "PLANNING"
          : anchor.closest("#focus")
            ? "FOCUSING"
            : stateForWaypoint(anchor.dataset.pose),
      }));
      path.setAttribute("d", buildJourneyPath(anchors));
      svg.current?.setAttribute(
        "viewBox",
        `0 0 ${bounds.width} ${container.offsetHeight}`
      );
      total = path.getTotalLength();
      const mobile = bounds.width <= 700,
        spacing = mobile ? 110 : 66;
      const fragment = document.createDocumentFragment();
      growthMarks = [];
      distances = [{ y: anchors[0].y, length: 0 }];
      for (
        let length = 28, index = 0;
        length < total - 20;
        length += spacing, index++
      ) {
        const point = path.getPointAtLength(length);
        distances.push({ y: point.y, length });
        if (stops.some((stop) => Math.abs(stop.y - point.y) < 21)) continue;
        const tangent = path.getPointAtLength(Math.min(total, length + 3));
        const angle =
          (Math.atan2(tangent.y - point.y, tangent.x - point.x) * 180) /
          Math.PI;
        const side = index % 2 === 0 ? 1 : -1,
          offset = (mobile ? 3 : 6) * side;
        const radians = (angle * Math.PI) / 180;
        const x = point.x - Math.sin(radians) * offset,
          y = point.y + Math.cos(radians) * offset;
        const stage = nearestStop(point.y).stage,
          motif = motifFor(stage, index);
        const element = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "use"
        );
        element.setAttribute("href", `#${symbolId}-${motif}`);
        element.setAttribute("class", botanical.mark);
        element.setAttribute(
          "transform",
          `translate(${x} ${y}) rotate(${angle - 90 + side * 15}) scale(${mobile ? 0.72 : 0.9 + (index % 3) * 0.08})`
        );
        element.dataset.stage = stage;
        fragment.append(element);
        growthMarks.push({ element, length, state: "" });
      }
      distances.push({ y: anchors[anchors.length - 1].y, length: total });
      growth.replaceChildren(fragment);
      movement.rebase(targetY());
      previousPoint = null;
      lastTime = 0;
      paint();
    };
    const visibilityChanged = () => {
      if (document.hidden) {
        cancelAnimationFrame(frame);
        frame = 0;
        lastTime = 0;
        suspend();
      } else measure();
    };
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", measure);
    reduced.addEventListener("change", measure);
    document.addEventListener("visibilitychange", visibilityChanged);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      suspend();
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", measure);
      reduced.removeEventListener("change", measure);
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, [root, paused, symbolId, pixelVariant]);

  return (
    <div className={styles.journeyLayer} aria-hidden="true">
      <svg ref={svg} className={styles.pathSvg} preserveAspectRatio="none">
        <defs>
          <g id={`${symbolId}-leaf`}>
            <path d="M-2 9C-1 3 2-2 7-8" />
            <path
              className={botanical.leafFill}
              d="M0 5C-7 3-8-4-7-8C0-6 3-2 0 5ZM2 1C2-7 8-10 12-10C12-4 8 0 2 1Z"
            />
          </g>
          <g id={`${symbolId}-seed`} className={botanical.seed}>
            <ellipse
              cx="-2"
              cy="-3"
              rx="1.1"
              ry="2.2"
              transform="rotate(-25)"
            />
            <ellipse cx="2.5" cy="4" rx="0.8" ry="1.8" transform="rotate(20)" />
          </g>
          <g id={`${symbolId}-sprout`}>
            <path d="M0 9C1 3 0-1-2-6" />
            <path
              className={botanical.leafFill}
              d="M0 3C-7 4-10 0-10-4C-4-4-1-1 0 3ZM0 0C0-6 4-9 9-8C9-3 5 1 0 0Z"
            />
          </g>
          <g id={`${symbolId}-bloom`}>
            <path d="M0 12V1M0 8C-4 8-6 5-6 3C-2 3 0 5 0 8" />
            <path
              className={botanical.leafFill}
              d="M0-4C-6-7-7-2-3 0C-7 4-2 7 0 3C3 7 7 3 3 0C7-2 5-7 1-4C3-10-3-10 0-4Z"
            />
            <circle cx="0" cy="-1" r="1" />
          </g>
          <g id={`${symbolId}-rune`}>
            <path d="m0-9 4 7-4 7-4-7 4-7ZM-7 5C-5 8-2 10 0 11M7 5C5 8 2 10 0 11" />
            <circle cx="0" cy="-2" r="0.8" className={botanical.seed} />
            <path d="M0-14v1M-9-3h1M8-3h1" />
          </g>
          <g id={`${symbolId}-connected`}>
            <path d="M-5 10C-5 2-3-2-4-8M5 10C5 5 4 1 5-4M-5 8C-1 5 1 5 5 8" />
            <path
              className={botanical.leafFill}
              d="M-4 0C-10 1-12-3-11-6C-6-6-4-4-4 0ZM5 3C5-3 9-6 13-5C12 0 9 3 5 3ZM-4-3C-4-8-1-11 3-10C3-6 0-3-4-3Z"
            />
          </g>
        </defs>
        <path ref={track} className={botanical.geometry} />
        <g ref={marks} />
      </svg>
      <div
        ref={traveler}
        className={`${styles.traveler} ${botanical.heroTraveler}`}
        data-journey-traveler
      >
        <span
          className={`${styles.travelerMessage} ${botanical.message}`}
          data-companion-message
        >
          Let’s begin.
        </span>
        <div
          className={`${styles.travelerBody} ${botanical.characterBody}`}
          data-character-surface
        >
          <JourneyCompanion ref={companion} />
        </div>
      </div>
    </div>
  );
}
