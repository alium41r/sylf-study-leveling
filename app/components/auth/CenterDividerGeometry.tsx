import React from "react";

/**
 * CenterDividerGeometry: Central vertical ornamental spine for the auth split,
 * now featuring fully connected ascending branches that seamlessly extend from the spine
 * and gracefully arch across the upper left (above form) and upper right (above scene).
 * 
 * - Full-viewport 1600x900 coordinate space anchored to screen center (x = 800)
 * - Single continuous luminous spine extending from ceiling (y = 0) to floor (y = 880)
 * - Branches seamlessly peeling off from the spine with zero gaps or disconnections
 * - Suspended teardrop lantern at x = 848 (matching reference artwork)
 * - Glowing 4-point radiant starburst at vertical midpoint (800, 460)
 * - Subtle secondary tendrils, hanging crystal pendants, and minimal bud nodes
 */
export function CenterDividerGeometry({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1600 900"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid slice"
      className={`w-full h-full overflow-visible ${className}`}
      aria-hidden="true"
    >
      <defs>
        {/* Soft vertical luminous spine gradient */}
        <linearGradient id="dividerSpineGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.75" />
          <stop offset="12%" stopColor="#818cf8" stopOpacity="0.55" />
          <stop offset="50%" stopColor="#38bdf8" stopOpacity="0.85" />
          <stop offset="85%" stopColor="#818cf8" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0.1" />
        </linearGradient>

        {/* Delicate tendril winding gradient */}
        <linearGradient id="dividerTendrilGrad1" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#818cf8" stopOpacity="0.4" />
          <stop offset="30%" stopColor="#a5b4fc" stopOpacity="0.6" />
          <stop offset="70%" stopColor="#38bdf8" stopOpacity="0.65" />
          <stop offset="100%" stopColor="#818cf8" stopOpacity="0.25" />
        </linearGradient>

        {/* Extended upper branch gradient (Center to Left) */}
        <linearGradient id="dividerLeftBranchGrad" x1="100%" y1="0%" x2="0%" y2="0%">
          <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.8" />
          <stop offset="35%" stopColor="#818cf8" stopOpacity="0.6" />
          <stop offset="75%" stopColor="#6366f1" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#818cf8" stopOpacity="0.15" />
        </linearGradient>

        {/* Extended upper branch gradient (Center to Right) */}
        <linearGradient id="dividerRightBranchGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.8" />
          <stop offset="35%" stopColor="#818cf8" stopOpacity="0.6" />
          <stop offset="75%" stopColor="#6366f1" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#818cf8" stopOpacity="0.15" />
        </linearGradient>

        {/* Hanging crystal diamond gradient */}
        <linearGradient id="dividerCrystalGrad" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="45%" stopColor="#c7d2fe" />
          <stop offset="75%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#1e293b" />
        </linearGradient>

        {/* Glowing teardrop lantern gradient */}
        <linearGradient id="dividerLanternGrad" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="30%" stopColor="#e0e7ff" stopOpacity="0.85" />
          <stop offset="65%" stopColor="#818cf8" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.4" />
        </linearGradient>

        {/* Restrained star glow filter */}
        <filter id="dividerCenterStarGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* ─── 1. Main Continuous Vertical Luminous Spine (y = 0 to 880) ─── */}
      <path
        d="M 800 0 L 800 870"
        stroke="url(#dividerSpineGrad)"
        strokeWidth="1.2"
        strokeLinecap="round"
      />

      {/* ─── 2. Upper Branches Extending Continuously from Spine ─────── */}
      {/* Primary Left Branch peeling off spine at y = 170 and sweeping out */}
      <path
        d="M 800 170 
           C 795 110, 770 55, 710 30 
           C 645 8, 555 22, 475 16 
           C 390 10, 310 26, 210 18"
        stroke="url(#dividerLeftBranchGrad)"
        strokeWidth="1.15"
        strokeLinecap="round"
      />

      {/* Secondary Left Tendril branching higher at y = 110 */}
      <path
        d="M 800 110 
           C 785 75, 750 42, 695 38 
           C 635 34, 570 50, 495 34 
           C 420 18, 350 28, 280 22"
        stroke="#818cf8"
        strokeWidth="0.85"
        strokeLinecap="round"
        strokeOpacity="0.55"
      />

      {/* Primary Right Branch peeling off spine at y = 170 and sweeping out */}
      <path
        d="M 800 170 
           C 805 110, 830 55, 890 30 
           C 955 8, 1045 22, 1125 16 
           C 1210 10, 1290 26, 1390 18"
        stroke="url(#dividerRightBranchGrad)"
        strokeWidth="1.15"
        strokeLinecap="round"
      />

      {/* Secondary Right Tendril branching higher at y = 110 */}
      <path
        d="M 800 110 
           C 815 75, 850 42, 905 38 
           C 965 34, 1030 50, 1105 34 
           C 1180 18, 1250 28, 1320 22"
        stroke="#818cf8"
        strokeWidth="0.85"
        strokeLinecap="round"
        strokeOpacity="0.55"
      />

      {/* ─── 3. Suspended Teardrop Lantern (Right of Spine, x = 848) ──── */}
      {/* Drops directly from the right branch at (848, 38) */}
      <g>
        <path
          d="M 848 38 L 848 132"
          stroke="#818cf8"
          strokeWidth="0.75"
          strokeOpacity="0.65"
        />
        {/* Lantern top mount */}
        <ellipse cx="848" cy="132" rx="4" ry="1.8" fill="#c7d2fe" opacity="0.85" />
        {/* Lantern luminous body */}
        <path
          d="M 848 134 
             C 859 144, 861 162, 848 176 
             C 835 162, 837 144, 848 134 Z"
          fill="url(#dividerLanternGrad)"
          stroke="#38bdf8"
          strokeWidth="0.75"
          strokeOpacity="0.75"
        />
        {/* Faceted lower crystal */}
        <polygon points="848,176 851.5,184 848,192 844.5,184" fill="url(#dividerCrystalGrad)" />
        {/* Inner radiant sparkle */}
        <polygon points="848,148 850,154 856,155 850,156 848,162 846,156 840,155 846,154" fill="#ffffff" />
      </g>

      {/* ─── 4. Upper Secondary Curved Tendrils Wrapping Spine ──────── */}
      <path
        d="M 800 170 C 816 230, 828 290, 816 350 C 806 405, 786 435, 800 460"
        stroke="url(#dividerTendrilGrad1)"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <path
        d="M 786 240 C 774 290, 780 370, 800 410 C 810 435, 806 450, 800 460"
        stroke="#818cf8"
        strokeWidth="0.8"
        strokeOpacity="0.45"
        strokeLinecap="round"
      />

      {/* ─── 5. Lower Secondary Curved Tendrils Wrapping Spine ──────── */}
      <path
        d="M 800 460 C 790 530, 775 600, 783 680 C 791 750, 817 800, 800 870"
        stroke="url(#dividerTendrilGrad1)"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <path
        d="M 800 460 C 813 520, 823 610, 815 690 C 807 760, 793 810, 800 870"
        stroke="#818cf8"
        strokeWidth="0.8"
        strokeOpacity="0.45"
        strokeLinecap="round"
      />

      {/* ─── 6. Hanging Crystal Ornaments ──────────────────────────── */}
      {/* Mid-upper branch hanging crystal (y ~ 260) */}
      <path
        d="M 822 230 Q 830 245 830 260 L 830 268"
        stroke="#818cf8"
        strokeWidth="0.75"
        strokeOpacity="0.5"
      />
      <polygon
        points="830,268 833.5,274 830,281 826.5,274"
        fill="url(#dividerCrystalGrad)"
        opacity="0.9"
      />

      {/* Mid-lower branch hanging crystal (y ~ 700) */}
      <path
        d="M 783 670 Q 775 685 775 705 L 775 714"
        stroke="#818cf8"
        strokeWidth="0.75"
        strokeOpacity="0.5"
      />
      <polygon
        points="775,714 778.5,720 775,727 771.5,720"
        fill="url(#dividerCrystalGrad)"
        opacity="0.9"
      />

      {/* Bottom terminal crystal pendant (y ~ 855) */}
      <path
        d="M 800 850 L 800 860"
        stroke="#38bdf8"
        strokeWidth="0.9"
        strokeOpacity="0.6"
      />
      <polygon
        points="800,860 804,868 800,878 796,868"
        fill="url(#dividerCrystalGrad)"
      />
      <circle cx="800" cy="854" r="1.5" fill="#ffffff" />

      {/* ─── 7. Tiny Minimal Seed / Bud Accents (No heavy foliage!) ── */}
      {/* Upper branch buds */}
      <ellipse cx="710" cy="30" rx="1.5" ry="3.2" transform="rotate(-30 710 30)" fill="#a5b4fc" fillOpacity="0.45" />
      <ellipse cx="610" cy="20" rx="1.5" ry="3.2" transform="rotate(25 610 20)" fill="#818cf8" fillOpacity="0.45" />
      <ellipse cx="490" cy="22" rx="1.5" ry="3.2" transform="rotate(-20 490 22)" fill="#a5b4fc" fillOpacity="0.45" />
      <ellipse cx="890" cy="30" rx="1.5" ry="3.2" transform="rotate(30 890 30)" fill="#a5b4fc" fillOpacity="0.45" />
      <ellipse cx="990" cy="20" rx="1.5" ry="3.2" transform="rotate(-25 990 20)" fill="#818cf8" fillOpacity="0.45" />
      <ellipse cx="1110" cy="22" rx="1.5" ry="3.2" transform="rotate(20 1110 22)" fill="#a5b4fc" fillOpacity="0.45" />

      {/* Spine tendril buds */}
      <ellipse cx="813" cy="200" rx="1.5" ry="3.2" transform="rotate(30 813 200)" fill="#a5b4fc" fillOpacity="0.5" />
      <ellipse cx="781" cy="290" rx="1.5" ry="3.2" transform="rotate(-35 781 290)" fill="#818cf8" fillOpacity="0.5" />
      <ellipse cx="810" cy="370" rx="1.6" ry="3.5" transform="rotate(25 810 370)" fill="#a5b4fc" fillOpacity="0.5" />
      <ellipse cx="793" cy="425" rx="1.5" ry="3.2" transform="rotate(-20 793 425)" fill="#818cf8" fillOpacity="0.45" />
      <ellipse cx="788" cy="552" rx="1.6" ry="3.5" transform="rotate(-30 788 552)" fill="#818cf8" fillOpacity="0.5" />
      <ellipse cx="819" cy="638" rx="1.5" ry="3.2" transform="rotate(25 819 638)" fill="#a5b4fc" fillOpacity="0.5" />
      <ellipse cx="793" cy="762" rx="1.5" ry="3.2" transform="rotate(-25 793 762)" fill="#818cf8" fillOpacity="0.45" />
      <ellipse cx="808" cy="820" rx="1.5" ry="3.2" transform="rotate(30 808 820)" fill="#a5b4fc" fillOpacity="0.4" />

      {/* ─── 8. Glowing 4-Point Starburst Centerpiece (y = 460) ────── */}
      <g filter="url(#dividerCenterStarGlow)">
        {/* Soft radial glow aura */}
        <circle cx="800" cy="460" r="14" fill="#38bdf8" fillOpacity="0.15" />

        {/* Main 4-point radiant star */}
        <polygon
          points="800,438 803.5,456.5 819,460 803.5,463.5 800,482 796.5,463.5 781,460 796.5,456.5"
          fill="#ffffff"
        />

        {/* Inner crisp diamond core */}
        <polygon
          points="800,452 802.5,460 800,468 797.5,460"
          fill="#e0f2fe"
        />

        {/* Center glint point */}
        <circle cx="800" cy="460" r="1.5" fill="#ffffff" />
      </g>
    </svg>
  );
}

export default CenterDividerGeometry;
