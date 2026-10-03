---
name: sylf-ui-implementation
description: Implement or refine Sylf UI pages, components, styling, responsive layouts, and interactions. Use for Sylf UI work; backend-only tasks do not need this skill.
---

# Sylf UI implementation

Follow the repository's [AGENTS.md](../../../AGENTS.md) for project authorities, boundaries, and verification commands. This skill adds the UI implementation loop. Resolve the paths below from the repository root.

1. **Inspect before editing.** Read the target route's actual screen/component, styles, relevant hooks, and enclosing layout. Inspect nearby comparable UI in source and, when available, in the running app. Open supplied screenshots and reference pages; identify the requested hierarchy, spacing, and interactions, adapting reference colors to Sylf's appearance system. Use the [documentation index](../../../documentation/README.md) and [design index](../../../documentation/design/README.md) to locate only task-relevant guidance.

2. **Choose what to reuse.** Search `app/components/` and the target feature for suitable components, icons, layouts, and control patterns; inspect their consumers before reuse or modification. Match nearby typography, spacing, density, and interaction conventions unless the request changes them. Check shell-owned navigation, scrolling, viewport sizing, and safe-area padding before adding page layout rules. Consult `lib/motion.ts` when changing animations. Check `mobile/` consumers when editing shared screens.

3. **Style for the actual surface.** Trace unfamiliar global tokens and local CSS aliases through `app/globals.css`, `lib/color-utils.ts`, and the target stylesheet. Choose existing surface, text, border, and accent tokens by their role: accent text and foreground on a filled accent control need different contrast tokens. Custom backgrounds can change surface polarity independently of the selected mode. Use the existing appearance flow in `app/settings/appearance/` and `GlobalSystemWrapper`; avoid fixed palettes or page-specific theme state.

4. **Implement the requested UI.** Make the smallest coherent change in the existing owner. Preserve handlers, data flow, business logic, and existing states unless the task explicitly changes their behavior. Keep redesign within the requested scope; introduce components or abstractions only for a concrete reuse need. Leave unrelated cleanup alone.

5. **Inspect the rendered result.** After implementation, open the affected UI and inspect browser renders or screenshots against the request, supplied references, and nearby UI. Use the configured `playwright` MCP browser tools when available to navigate, snapshot, interact, resize, and take screenshots. Target controls from fresh snapshots; use screenshots to judge visual layout. Cover relevant desktop and mobile widths, light/dark modes, and representative custom accent/background combinations. Exercise affected states such as loading, empty/populated content, errors, disabled controls, and open dialogs. Check alignment, wrapping, clipping, scrolling, overlay placement, contrast, and keyboard/touch interaction where applicable. Code review and passing tests do not replace this visual inspection.

6. **Repair and finish.** Fix visual regressions caused by the change, then inspect the affected states again. When shared UI or styles change, check representative callers too. Run the applicable checks from `AGENTS.md`. Briefly report the change and the viewports, states, and appearance variations actually verified; identify any rendering or verification blocker and what remains unverified.
