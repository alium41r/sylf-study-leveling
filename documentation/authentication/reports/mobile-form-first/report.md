# Form-first layout on smaller viewports

Verified 2026-10-14.

At 900px and below, login and registration put the complete form directly after the header. Beneath the form, a two-column scene places the quote on the left and the floating island at the lower right. The small scene uses icon controls with their existing accessible labels. The footer tagline and scene-location caption are hidden at these sizes to reduce surrounding text.

Above 900px, the desktop arrangement remains form-left/island-right with the quote above the island. Both routes remove their decorative journey/account overline at every viewport. The quotes are shortened to one sentence. Authentication handlers, companion reactions, island geometry, and the landing-derived edge foliage are preserved.

## Verification

- Eleven route/viewport/appearance combinations between 320px and 1920px passed the browser checks. Explicit 900px and 901px checks confirm the layout boundary.
- Smaller screens have the form before the scene and the quote entirely left of the island. Desktop retains separate form/scene columns and its quote above the island. No horizontal overflow or decorative journey label remains.
- Phone, tablet, desktop, small-phone registration, light/dark, and custom-color screenshots were inspected.
- Password focus still selects sleepy eyes; reduced motion removes all scene and edge animations. No browser page errors were observed.
- Authentication tests: 9 passed. ESLint on both changed routes passed.
- Full TypeScript check and production build passed. Generated verification-only TypeScript include entries were removed afterward; the repository configuration is unchanged.

Browser API calls were isolated as unauthenticated. Live OAuth and account creation were not attempted.

## Evidence

- [Results](evidence/results.json) and [repeatable browser script](evidence/verify.js).
- [Phone login](evidence/login-mobile.png), [tablet login](evidence/login-tablet.png), [small-phone registration](evidence/register-small.png), and [custom green/mint registration](evidence/register-custom-dark.png).
- [Desktop login](evidence/login-desktop.png), [900px layout](evidence/login-mobile-breakpoint.png), and [901px layout](evidence/login-desktop-breakpoint.png).
- [Production build log](evidence/build.log).
