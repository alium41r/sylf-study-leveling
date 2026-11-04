// ESLint for the Sylf Native workspace (independent of the root Next.js config).
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

const repoEscape = {
  group: ["../../../../*", "../../../../../*", "**/../lib/*"],
  message: "Only packages/shared/src/index.ts, backend.ts and catalogs.ts may import the Sylf repository's lib/ (see tooling/checks/check-boundaries.mjs).",
};

export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/dist/**", "**/.expo/**", "apps/sylf/android/**", "apps/sylf/ios/**", "packages/*/android/build/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [repoEscape, { group: ["@sylf/phone"], message: "The phone companion is selected only by the app entry (master plan §4.5)." }] }],
    },
  },
  { files: ["packages/shared/src/index.ts", "packages/shared/src/backend.ts", "packages/shared/src/catalogs.ts"], rules: { "no-restricted-imports": "off" } },
  { files: ["apps/sylf/index.ts"], rules: { "no-restricted-imports": ["error", { patterns: [repoEscape] }], "@typescript-eslint/no-require-imports": "off" } },
  // Metro resolves font assets through require(); there is no import form for them.
  { files: ["packages/design-system/src/theme/font-loader.web.ts"], rules: { "@typescript-eslint/no-require-imports": "off" } },
  { files: ["apps/desktop/**/*.{mjs,cjs}", "tooling/**/*.{js,mjs,cjs}", "**/*.config.{js,mjs,ts,mts}", "apps/sylf/metro.config.js"], languageOptions: { globals: { ...globals.node } } },
  { files: ["**/*.cjs", "tooling/metro/*.js", "apps/sylf/metro.config.js"], languageOptions: { sourceType: "commonjs" }, rules: { "@typescript-eslint/no-require-imports": "off" } },
);
