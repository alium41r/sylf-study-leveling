# Sylf landing page — The next chapter

This route-specific direction implements the user's September 8–9, 2026 brief. It overrides the unrelated hospitality defaults in MASTER.md for `/` only. The refinement keeps the original editorial typography, midnight canvas, alternating chapters, window frames, and early-access story.

## Visual system

- Midnight canvas `#080d17`, inset surface `#0e1522`, raised surface `#121c2b`.
- Paper-white text `#eef1f8`, muted text `#a1adc1`, quiet text `#8291aa`.
- Restrained moon-blue accent `#b7cbf7`, with a local readable light variant.
- Georgia editorial headings and the existing Inter/system sans body; no new font dependency.
- Mobile keeps reading order and uses a simplified botanical trail in the left gutter.

## Actual product screenshots

Every product frame now contains a capture from the authenticated local Sylf app, with its real existing account data. No data was seeded, no replacement UI was invented, and no sessions or parties were created for these captures. Browser chrome was cropped away; the actual app navigation and content were retained. Screenshots are 1175 × 689 WebP files in `public/landing/screenshots`.

| File | Actual view | Capture state |
| --- | --- | --- |
| timer.webp | `/timer` | Existing daily focus total and subjects; no session started |
| dashboard.webp | `/dashboard` | Existing player level, rank, XP and dashboard |
| stats.webp | `/settings/stats` | Player statistics and cognitive attributes; naturally no sidebar |
| character.webp | `/locker?tab=identity` → Enter Character Studio | Equipped character and customization controls; nothing saved |
| ai.webp | `/system` | Existing AI conversation; no message generated |
| social.webp | `/social` | Existing friends and study activity |
| party-lobby.webp | `/social?tab=party` | Actual empty lobby; no party created |

The progression and social frames switch between their respective real screenshots. Each frame opens a native dialog for a larger view. On mobile the original resolution can be panned; Escape/close return focus to the opener. The waitlist still uses the existing API, referral attribution, access-pass restoration and error handling.

## Walking asset

The supplied `chibi walking animation.mp4` is preserved unchanged as `public/landing/chibi-walk-original.mp4`. SHA-256: `39cf128800cb5363142679feee10022344965ccfc6fd570f6c51a79daefe3450`.

The user explicitly approved removing only its white background. The browser derivative `chibi-walk.webm` uses all 240 original frames, at the original 24 fps and 10-second duration. It is proportionally downsampled from 1280 × 720 to 640 × 360 with no crop, character redesign, regeneration, or horizontal mirroring. Alpha removes edge-connected near-white pixels plus enclosed white gaps between the dark lower legs. Only the outer contour is softly unmatted; internal silver hair and the original ground shadow remain. The video is silent. `chibi-walk-poster.png` is its first transparent frame.

The previous generated companion sprite assets are legacy files and are not rendered by the landing page.

## Trail and playback

DOM waypoints define a vertical cubic route. Its Y is monotonic, so downward scroll travels down and upward scroll retraces the route. A binary search maps document Y to arc length; a requestAnimationFrame loop eases the traveler with a 95 ms response and runs only while moving. There is no scroll hijacking or per-frame React state.

The route is an invisible guide for individually placed leaves, sprouts, seed marks, occasional flowers and arcane marks. Focus stays leafy, progression blooms, AI introduces sparse runes, and Social connects stems. Marks brighten subtly near the traveler. A small clearance adjustment below the introduction keeps the upright character off its copy.

The supplied videos now feed one stable 640 × 360 canvas, preserving the existing presentation without browser video controls. All four media elements stay mounted with `preload="auto"`; only the selected, visible clip plays. Each runs at its native 1× speed. A decoded incoming frame is first drawn into a back buffer, then copied to the visible canvas. While a new clip buffers, the last complete frame remains visible. Each clip retains its own playback position when paused.

`companion-motion.ts` defines four explicit states: `wave`, `travel`, `idle-standing`, and `idle-meditation`. The top 24 px and last 48 px of document scroll select wave. Active meaningful scrolling (2 px accumulated distance) or remaining eased path movement selects travel. Once both movement and a 320 ms idle debounce settle, the final path stop selects wave; the lower half of the Focus Timer screenshot through the bottom of its section selects meditation; other intermediate positions select standing. The final-stop rule makes the acknowledgment visible at the existing final CTA before the footer, without extending the route. Scrolling away from that stop selects travel.

The meditation region is measured from `#focus figure` and its section on resize, keeping the calm pose beside the actual timer as responsive heights change. The animation policy only reads journey position; switching clips cannot reset or move the route. Fixed scale/offset registration inside the shared canvas aligns the supplied character bodies while retaining the authored floating motion. The walking file, wrapper dimensions, route geometry, section order, screenshots, typography and trail remain unchanged in this phase.

Offscreen, hidden-tab and visitor-pause behavior pauses every decoder and cancels frame callbacks. Reduced motion keeps the existing static-companion policy, using the supplied wave poster. Interrupted play promises reconcile the latest selection so quick switches cannot strand a paused clip or cancel a newer renderer. See `docs/landing-companion-motion-qa.md` for asset provenance, exact presentation registration and verification results.
