/**
 * SVGO Configuration for Sylv Modular Character SVGs.
 * Preserves anchor IDs, semantic groups, viewBox, and dynamic CSS custom properties.
 */
export default {
  multipass: true,
  plugins: [
    {
      name: "preset-default",
      params: {
        overrides: {
          // CRITICAL: Preserve semantic element IDs (sylv-head, sylv-tail, etc.)
          cleanupIds: false,
          // CRITICAL: Keep custom data attributes
          removeUnknownsAndDefaults: {
            keepDataAttrs: true,
          },
          // Do not collapse groups that represent modular layers
          collapseGroups: false,
        },
      },
    },
  ],
};
