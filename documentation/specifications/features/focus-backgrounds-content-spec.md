# Sylf Focus Backgrounds — Official Content Specification & Standards

This document establishes the official quality, technical, and compositional standards for official and user environments in Sylf Focus Timer.

---

## 1. Technical Targets & Specifications

| Parameter | Official Master Target | Official Minimum | Custom Personal Uploads | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Aspect Ratio** | **16:9** (1.777:1) | 16:9 recommended | 16:9 recommended | Letterbox/pillarbox avoided via CSS cover + focal positioning |
| **Resolution** | **2560 × 1440** (QHD) | 1920 × 1080 (FHD target)<br>*1280 × 720 technical min* | 1280 × 720 min<br>7680 × 4320 max (≤35 MP) | 2560×1440 provides optimal sharpness on 4K/retina displays with controlled download sizes |
| **File Formats** | **WebP** or **JPEG** | PNG accepted | WebP, JPEG, PNG | Static images only (animated GIFs rejected) |
| **File Size Ceiling** | **< 10 MB** (preferred) | **15 MB** (hard server max) | **10 MB** (hard server max) | Fast CDN delivery and smooth decoding |
| **Color Space** | **sRGB** standard | sRGB | sRGB | Prevents cross-browser gamma shifts |
| **Sharpness** | Clean 100% pixel clarity | No visible artifacts | Crisp clarity | Avoid aggressive compression artifacts or blur |

---

## 2. Cross-Device Composition & Safe Frame

Sylf displays wallpapers using CSS `object-fit: cover` with focal-point coordinates (`focalX`, `focalY` from `0.0` to `1.0`). Because devices vary in aspect ratio (from 16:9 desktops to 16:10 laptops, 4:3 tablets, and 9:19.5 mobile viewports):

1. **Approximate Cross-Device Safe Zone (Inner 90%)**:
   - Keep key subjects, character faces, and architectural focal points within the central 90% of the image (at least 5% away from extreme outer edges).
   - Never place essential subjects at extreme edges, which will crop on narrower or taller screens.
2. **Focal Point Placement (`focalX`, `focalY`)**:
   - Every asset in Background Studio must have its focal center explicitly set to anchor the camera when the browser viewport scales.
3. **Negative Space**:
   - Backgrounds should have at least one open, low-complexity quadrant or half suitable for docking timer digits and controls without visual clash.

---

## 3. Category Compositional Guidelines

### A. Anime (`/anime`)
- **Atmosphere**: Vibrant, immersive study sanctums, lo-fi twilight bedrooms, rooftop vistas, rain-slicked train cabins, library corners.
- **Subject Placement**: Strong focal character or key subject positioned intentionally to one side (e.g. `focalX: 0.25` or `0.75`).
- **Timer Zone**: The opposite side must have clean, calm negative space (soft sky, calm wall, quiet shadow) where the `AnimeTimerLayout` floating glass pod can dock cleanly without obscuring the character's face.
- **Admin Configuration**:
  - `timerPosition`: `"left"` or `"right"` (opposite of character).
  - `focalX` / `focalY`: Centered on the character's eye line.

### B. Landscapes (`/landscapes`)
- **Atmosphere**: Expansive panoramic nature, misty mountain ridges, serene lakes, aurora borealis, alpine sunsets, tranquil forests.
- **Subject Placement**: Broad scenic vistas with natural horizons placed along the upper or lower third lines.
- **Timer Zone**: The `LandscapeTimerLayout` features floating typography docked in the lower third (left, right, or center). Avoid cluttering the lower third with heavy high-contrast jagged details that compete with timer digits.
- **Admin Configuration**:
  - `timerPosition`: `"auto"`, `"left"`, or `"right"`.
  - `focalX` / `focalY`: Centered on the scenic vista's primary horizon point.

### C. Fantasy (`/fantasy`)
- **Atmosphere**: Ancient scholar sanctuaries, grand arcana libraries, ethereal celestial towers, floating islands, astronomical observatories.
- **Subject Placement**: Mythical architectural elements, celestial bodies, or scholar instruments.
- **Timer Zone**: `FantasyTimerLayout` incorporates a celestial astrolabe dial and fine orbital linework. Ensure ample breathing room around the chosen quadrant so celestial tick marks and phase glows feel organic.
- **Admin Configuration**:
  - `timerPosition`: `"left"`, `"right"`, or `"center"`.
  - `focalX` / `focalY`: Centered on the primary celestial or architectural anchor.

### D. Classic Sylf (`/classic-sylf`)
- **Atmosphere**: Distraction-free ambient obsidian gradient with phase-responsive radial glows (green for breaks, Sylf accent for focus).
- **Subject Placement**: Pure digital focus ring, centrally focused, zero external imagery required.

---

## 4. Contrast & Readability Rules

To maintain high contrast and accessibility across diverse wallpapers:
- **Do Not Globally Blackout**: The engine applies subtle ambient vignettes (`rgba(10, 12, 16, 0.15)` to `0.65`) and localized backdrop glows behind timer digits. Wallpapers do not need artificial artificial dark overlays baked into the source image.
- **High Key / Snow / Desert Scenes**: Ensure there is enough mid-tone or color saturation in the negative space zone so white digits remains legible against the localized contrast backing.
- **Low Key / Dark Scenes**: Avoid pitch-black crushed shadows; maintain subtle texture so the background feels alive rather than flat black.

---

## 5. Curation & Catalog Publishing Checklist

Before approving and activating an official background in Background Studio:
- [ ] File verified in 16:9 aspect ratio (2560×1440 preferred).
- [ ] File size within 15 MB limit (< 10 MB preferred for instant load).
- [ ] Color profile verified as sRGB.
- [ ] `focalX` and `focalY` tested on mobile (390×844) and desktop (1920×1080) in preview.
- [ ] `timerPosition` verified against the negative space quadrant.
- [ ] Digits easily legible in both Focus phase and Break phase.
- [ ] Duplicate name warning verified (ensure distinct, poetic names).
- [ ] Active toggle enabled once production quality is confirmed.
