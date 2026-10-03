"use client";

import React from "react";
import Companion from "../landing/companion/Companion";
import StudyTimerHUD from "./StudyTimerHUD";
import styles from "./StudyIsland.module.css";

/**
 * StudyIslandScene: Modular 2D / 2.5D low-poly study illustration for Sylf auth.
 * Composed entirely of clean SVG polygon facets, vector study props,
 * floating crystals, and the canonical Sylf Companion in reading pose.
 */
export function StudyIslandScene() {
  return (
    <div className={styles.sceneContainer} aria-hidden="true">
      {/* ─── Upper Right Crescent Moon ────────────────────────── */}
      <svg
        className={styles.crescentMoon}
        width="68"
        height="68"
        viewBox="0 0 80 80"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="moonGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="60%" stopColor="#bfdbfe" />
            <stop offset="100%" stopColor="#60a5fa" />
          </linearGradient>
        </defs>
        <path
          d="M 44 4 C 20 14 10 38 18 58 C 26 76 50 82 70 70 C 52 74 34 62 30 44 C 26 26 34 12 44 4 Z"
          fill="url(#moonGrad)"
          opacity="0.92"
        />
      </svg>

      {/* ─── Top Hanging Vine & Lantern Ornament ─────────────── */}
      <svg
        className={styles.hangingOrnament}
        width="44"
        height="140"
        viewBox="0 0 44 140"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M 22 0 L 22 96"
          stroke="#4f46e5"
          strokeWidth="1"
          strokeOpacity="0.45"
        />
        {/* Tiny branch leaf */}
        <path
          d="M 22 40 C 30 32 38 35 40 44 C 32 47 25 44 22 40 Z"
          fill="#818cf8"
          fillOpacity="0.6"
        />
        {/* Hanging droplet lantern */}
        <polygon
          points="22,96 28,105 22,118 16,105"
          fill="#38bdf8"
          fillOpacity="0.75"
          filter="drop-shadow(0 0 6px rgba(56, 189, 248, 0.7))"
        />
        <circle cx="22" cy="107" r="1.5" fill="#ffffff" />
      </svg>

      {/* ─── Floating Timer HUD Widget ────────────────────────── */}
      <StudyTimerHUD />

      {/* ─── Main Island Assembly ─────────────────────────────── */}
      <div className={styles.islandAssembly}>
        {/* Embedded Canonical Companion in Reading Pose */}
        <div className={styles.companionLayer}>
          <Companion
            state="READING"
            motion="quiet"
            size={220}
          />
        </div>

        {/* ─── Low-Poly Island, Shards, and Props SVG ─────────── */}
        <svg
          viewBox="0 0 680 540"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-auto overflow-visible select-none pointer-events-none"
        >
          <defs>
            {/* Plateau rim gradient */}
            <linearGradient id="plateauRim" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#3b487c" />
              <stop offset="100%" stopColor="#1a203a" />
            </linearGradient>

            {/* Brass metallic lantern gradient */}
            <linearGradient id="brassGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#d4af37" />
              <stop offset="60%" stopColor="#8c6d37" />
              <stop offset="100%" stopColor="#5a4421" />
            </linearGradient>

            {/* Flame glow filter */}
            <filter id="flameBlur" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="glow" />
              <feComposite in="SourceGraphic" in2="glow" operator="over" />
            </filter>
          </defs>

          {/* ─── Floating Detached Crystal Shards ───────────────── */}
          {/* Shard 1: Left */}
          <g className={styles.crystal1}>
            <polygon points="106,350 106,392 94,371" fill="#1b2244" />
            <polygon points="106,350 106,392 118,371" fill="#4d5fa8" />
          </g>

          {/* Shard 2: Mid-Left Lower */}
          <g className={styles.crystal2}>
            <polygon points="208,446 208,482 198,464" fill="#181e3a" />
            <polygon points="208,446 208,482 218,464" fill="#3a4886" />
          </g>

          {/* Shard 3: Center Tip Bottom */}
          <g className={styles.crystal1}>
            <polygon points="335,502 335,532 326,517" fill="#141932" />
            <polygon points="335,502 335,532 344,517" fill="#3d4e92" />
          </g>

          {/* Shard 4: Right Lower */}
          <g className={styles.crystal2}>
            <polygon points="468,418 468,454 456,436" fill="#202952" />
            <polygon points="468,418 468,454 480,436" fill="#5467b4" />
          </g>

          {/* Shard 5: Far Right Mid */}
          <g className={styles.crystal1}>
            <polygon points="576,296 576,326 566,311" fill="#1a2140" />
            <polygon points="576,296 576,326 586,311" fill="#445498" />
          </g>

          {/* ─── Island Underside Facets (12 low-poly planes) ───── */}
          {/* Facet 1: Upper Left Flank */}
          <polygon points="60,195 120,225 140,310" fill="#151b34" />

          {/* Facet 2: Upper Mid-Left */}
          <polygon points="120,225 230,234 250,345 140,310" fill="#1c2448" />

          {/* Facet 3: Upper Center-Left */}
          <polygon points="230,234 340,238 340,360 250,345" fill="#242e5a" />

          {/* Facet 4: Upper Center-Right (highlight plane) */}
          <polygon points="340,238 450,234 430,340 340,360" fill="#33417a" />

          {/* Facet 5: Upper Mid-Right */}
          <polygon points="450,234 560,225 520,300 430,340" fill="#222b54" />

          {/* Facet 6: Upper Far-Right Flank */}
          <polygon points="560,225 620,195 520,300" fill="#19203e" />

          {/* Facet 7: Mid Left Face */}
          <polygon points="140,310 250,345 230,420" fill="#181e3c" />

          {/* Facet 8: Mid Center-Left */}
          <polygon points="250,345 340,360 340,445 230,420" fill="#273264" />

          {/* Facet 9: Mid Center-Right (Key light facet) */}
          <polygon points="340,360 430,340 420,415 340,445" fill="#3e4f90" />

          {/* Facet 10: Mid Right Face */}
          <polygon points="430,340 520,300 420,415" fill="#1e274c" />

          {/* Facet 11: Lower Left Tip */}
          <polygon points="230,420 340,445 335,490" fill="#141932" />

          {/* Facet 12: Lower Right Tip */}
          <polygon points="340,445 420,415 335,490" fill="#2f3b72" />

          {/* ─── Top Plateau Surface ───────────────────────────── */}
          <polygon
            points="60,195 190,172 340,170 490,172 620,195 560,225 340,238 120,225"
            fill="#181f38"
            stroke="url(#plateauRim)"
            strokeWidth="1.5"
          />

          {/* Edge vegetation sprigs */}
          {/* Left sprig beside books */}
          <path
            d="M 125 210 C 112 198 106 202 102 212 C 112 216 120 213 125 210 Z"
            fill="#4a5a9c"
            fillOpacity="0.7"
          />
          <path
            d="M 128 214 C 120 205 114 207 111 216 C 118 220 125 218 128 214 Z"
            fill="#6173ba"
            fillOpacity="0.6"
          />

          {/* Right sprig near lantern */}
          <path
            d="M 525 212 C 538 200 545 204 548 214 C 538 218 530 215 525 212 Z"
            fill="#4a5a9c"
            fillOpacity="0.7"
          />

          {/* ─── Study Props on Plateau ────────────────────────── */}
          {/* Stack of Books (Left of Companion) */}
          <g>
            {/* Bottom Book */}
            <polygon points="144,196 216,184 238,204 166,216" fill="#1a234a" stroke="#2a3974" strokeWidth="1" />
            <polygon points="166,216 238,204 238,212 166,224" fill="#e2e8f0" />
            <line x1="166" y1="216" x2="166" y2="224" stroke="#2a3974" strokeWidth="1.2" />

            {/* Top Book */}
            <polygon points="150,183 218,172 235,192 167,203" fill="#28366e" stroke="#3b4d96" strokeWidth="1" />
            <polygon points="167,203 235,192 235,199 167,210" fill="#f1f5f9" />
            <line x1="167" y1="203" x2="167" y2="210" stroke="#3b4d96" strokeWidth="1.2" />
            {/* Sylf Star Rune on Top Book Cover */}
            <polygon points="193,184 195,188 199,189 195,190 193,194 191,190 187,189 191,188" fill="#38bdf8" />
          </g>

          {/* Study Mug & Animated Steam */}
          <g>
            {/* Mug Body */}
            <rect x="246" y="186" width="22" height="26" rx="4" fill="#141c36" stroke="#283868" strokeWidth="1" />
            {/* Mug Handle */}
            <path d="M 268 191 C 275 191 275 205 268 205" stroke="#283868" strokeWidth="2" fill="none" />
            {/* Crescent Moon Rune on Mug */}
            <path d="M 257 194 C 253 196 251 200 253 204 C 255 208 260 209 263 207 C 259 208 256 206 255 202 C 254 198 255 195 257 194 Z" fill="#ffffff" opacity="0.8" />

            {/* Rising Steam Curves */}
            <path
              d="M 252 182 Q 248 172 254 163 Q 258 155 253 147"
              stroke="#a5b4fc"
              strokeWidth="1"
              strokeLinecap="round"
              fill="none"
              className={styles.steamLine1}
            />
            <path
              d="M 260 182 Q 266 173 260 164 Q 256 156 262 148"
              stroke="#a5b4fc"
              strokeWidth="1"
              strokeLinecap="round"
              fill="none"
              className={styles.steamLine2}
            />
          </g>

          {/* Fantasy Study Lantern (Right of Companion) */}
          <g>
            {/* Lantern Stand Base */}
            <ellipse cx="492" cy="210" rx="15" ry="4" fill="#665233" />
            {/* Curved Brass Arch Pole */}
            <path
              d="M 492 210 L 492 136 C 492 110 462 110 462 132"
              stroke="url(#brassGrad)"
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
            />
            {/* Hanging Hook & Lantern */}
            <line x1="462" y1="132" x2="462" y2="141" stroke="#8c6d37" strokeWidth="1.5" />
            {/* Lantern Roof */}
            <polygon points="450,145 474,145 462,139" fill="url(#brassGrad)" />
            {/* Glass Housing */}
            <rect x="451" y="145" width="22" height="28" rx="2" fill="rgba(14, 24, 48, 0.55)" stroke="#785d30" strokeWidth="1" />
            {/* Lantern Base Ring */}
            <rect x="449" y="173" width="26" height="4" rx="1" fill="url(#brassGrad)" />

            {/* Inner Cyan Glowing Flame */}
            <g className={styles.flameGlow} filter="url(#flameBlur)">
              <circle cx="462" cy="159" r="10" fill="#38bdf8" fillOpacity="0.25" />
              <path
                d="M 462 151 Q 466 159 462 166 Q 458 159 462 151 Z"
                fill="#38bdf8"
              />
              <circle cx="462" cy="160" r="1.5" fill="#ffffff" />
            </g>
          </g>
        </svg>
      </div>

      {/* ─── Bottom Right Editorial Tagline ───────────────────── */}
      <div className={styles.mottoContainer}>
        <div>Your effort.</div>
        <div>Your character.</div>
        <div>
          Your next chapter.<span className={styles.mottoStar}>✦</span>
        </div>
      </div>
    </div>
  );
}
export default StudyIslandScene;
