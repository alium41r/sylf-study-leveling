# Study Sanctuary — Phase 5C

This page-specific art direction overrides the generic MASTER.md for Study Sanctuary only. It follows the user's Phase 5C brief; it does not rebrand Sylf or change the other Focus Room environments.

## Composition

The Lantern Window is an upper-floor walnut study with an expansive reservoir view, four cushioned chairs around one connected table, brass lamps, distant hills, and cropped foreground shelving. Two center stations sit further back; the outer chairs sit at the angled ends. Empty chairs remain furnished and have no visible vacancy labels.

The generated room is used as two precisely registered layers of the SAME cached WebP. A polygon clips the foreground layer to the table silhouette. Existing live CharacterRenderer instances sit between those layers, with contact shadows and a restrained shared warm/cool lighting treatment. No participant panels, pedestals, avatar auras, or paused-user dimming.

## Ownership and boundaries

StudySanctuaryScene is presentational. It consumes normalized participant profiles, existing derived live seconds and states, and its timer child. SanctuaryTimerDock receives the parent's current timer state, seconds, loading flag, and existing action callback. Neither component owns a clock, subscription, backend call, or session state. Character configuration is passed into the existing renderer using its existing keys, with default fallbacks for absent or malformed profile values.

FocusPartyRoom selects the compact dock and quieter header styles only for study-sanctuary. All other scenes keep their current timer presentation. Routes, persistence, party state, realtime, security, and timer actions are unchanged.

## Palette and typography

- Ink: #f3e8d5. Secondary text: #c7b9a5. Brass: #b79661. Room shadow: #090c0d. Walnut: #352416.
- Personal accent: existing --accent-primary-light, used on the user marker, mobile notebook ribbon, and a fine timer-button accent.
- The authored wood, lamplight, water and sky retain their own colors in every theme, including light UI themes.
- Existing Rajdhani typography, tabular timer numerals, no new font dependencies.
- Compact text has a feathered local shadow over the desktop table. Text states supplement every status color. Controls have 44px minimum targets and visible keyboard focus outlines.

## Responsive composition

- Desktop (>1100px): one full, undistorted illustration fitted within the viewport; live participants anchored to the four physical chairs; personal timer on the dark foreground rug.
- Tablet (768–1100px): full room width, smaller decorative detail; timer immediately below the room; compact header prevents overlap.
- Mobile (<768px): architectural view above a prominent personal timer, followed by two continuous walnut desk rows with chairs, brass lamps and notebooks. Participants are recomposed at usable sprite sizes rather than shrinking the desktop composition. Long names truncate visually with their full name preserved in the accessible station label and title.
- Ambience: slow 19s reflection and 24s curtain-shading movement, without particles or flashing lamps. All sanctuary animations/transitions stop under prefers-reduced-motion.

## Character art limitation

CharacterRenderer currently exposes a single front-facing full-body form plus optional relic; it has no pose or orientation API. This change does not rotate, deform, replace, or reconstruct avatars. Table overlap hides the lower body, but true seated studying is not yet available. Future art should add seated reading, writing, and resting forms, with three-quarter/profile variants and aligned hand/book/table anchors to the existing character asset contract. Paused users should use the resting pose, retaining the same lighting and visual weight.

## Art assets

- Production: public/environments/study-sanctuary/lantern-window.webp (1672 × 941; 181,402 bytes).
- Source: public/environments/study-sanctuary/lantern-window.png.
- Generated with the built-in image generation tool, then lossily encoded to WebP without changing composition. No user or remote Pinterest image was copied.
- The table mask and station anchors are specific to this illustration. Replacing the artwork requires recalibrating both together.

## Verification

- `npx vitest run __tests__/focus/`: 103 tests passed across 6 files. The two previous visual assertions were updated to require aura-free avatars and unlabelled empty furniture.
- `npx tsc --noEmit`: passed separately (the existing Next configuration skips build-time type validation).
- `npx next build`: passed; 77 static pages generated. The sandboxed attempt could not bind Turbopack's local worker port; the authorized rerun succeeded without configuration changes.
- Browser review of the actual FocusPartyRoom with isolated fixture data at 1440, 1024, 768, 375, and 320px. Checked solo, two-person and four-person occupancy; paused and focusing states; pause/resume callbacks; a mint theme accent; and all UI hidden. No live party or backend data was altered for visual review.
- At 1024 × 768, the timer action ends at y=758 with a 44px target; document size matches the viewport with no overflow. Mobile deliberately allows vertical scrolling for all four stations on shorter screens.
- Reduced-motion rules disable scene animations and transitions; they are scoped to the sanctuary.

## Generation prompt

Use case: stylized-concept. Create one finished landscape environment illustration for Sylf, a premium multiplayer study app. Wide 16:9 composition, 2048x1152 ideally. This is a production game environment asset, NOT a UI mockup. NO TEXT, NO LETTERS, NO NUMBERS, NO CHARACTERS, NO PEOPLE, NO interface or borders.
Art direction: exceptional sophisticated 2.5D hand-painted game background with subtle pixel-art informed texture, clean readable shapes, beautiful architectural perspective. Cozy but adult, elegant, not photorealistic, no generic fantasy clutter. Controlled detail, dark atmospheric shadows yet clearly visible architecture.
SCENE: private upper-floor late-night walnut study sanctuary. Expansive deeply recessed panoramic window taking up upper center of image, from approximately x18% to92%, y8% to48%. Beyond the window an extraordinarily beautiful quiet alpine reservoir, layers of misty tree-covered hills, a tiny handful of warm distant hillside house lights, cool teal blue night sky, small subdued moon. Cool night exterior contrasted with warm brass table lamps. Tall walnut bookcase cropped along left foreground, some books; structural wood ceiling beams near top, dark curtains gathered to both sides of window. Brass scholar rune detail very small on wood, abstract not text.
CRITICAL SPATIAL LAYOUT: one broad substantial communal walnut table in the midground and lower middle, seen with a slightly elevated three-quarter camera. Table has a generous flat clean writing surface, four physically believable EMPTY cushioned wooden chairs, FOUR study positions only. Arrange all four visible chairs along the far side and angled ends of the table, angled subtly toward center so their front seat areas are visible to camera. Two middle chairs slightly further away, two outer chairs closer to camera at angled ends. Approximate chair centers x30%,45%,61%,76%, backs y46-55%. Keep chairs large enough for chibi people to be composited in them later. Table edge must occlude the bottom of characters that will later sit in these chairs, and each station needs a small clean notebook and warm brass lamp placed BESIDE its future character space. No chairs on the near side blocking the view. Each of the four warm table lamps pools golden light onto writing surface. Four independent work areas on ONE CONNECTED TABLE. Avoid identical repeated computer desks. No screens. No glowing platforms. No person painted into art. Spare elegant still life: tea cup, book, brass fittings.
Foreground: table legs, patterned dark woven rug, warm wooden floor with soft contact shadows. Bottom 15% center is mostly dark calm negative space for screen-facing timer overlay; no physical clock. Partial foreground bookcase left and cropped small plant right frame image without blocking any chairs. Layered depth, atmospheric perspective, visible wood grain restrained, beautiful silhouettes. Room should feel whole and inviting when completely empty. Rich amber, dark walnut, muted teal, deep blue; NO purple, no saturated neon, no magic particles, no galaxy gradients, no busy decoration. Finish as a polished original game scene suitable to leave open for 3 hours.
