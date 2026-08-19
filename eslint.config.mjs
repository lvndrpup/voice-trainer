import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

const boundaryMessage = (from, to) =>
  `src/${from} must not import from src/${to} — see the module boundaries in CLAUDE.md.`;

export default tseslint.config(
  {
    ignores: ["dist/**"],
  },
  { files: ["**/*.ts"], ...js.configs.recommended },
  ...tseslint.configs.strictTypeChecked.map((config) => ({
    ...config,
    files: ["**/*.ts"],
  })),
  ...tseslint.configs.stylisticTypeChecked.map((config) => ({
    ...config,
    files: ["**/*.ts"],
  })),
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.browser },
    },
    rules: {
      // Numbers stringify predictably (unlike objects/any) and this is a
      // numeric-heavy DSP codebase — allow them in template expressions.
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
    },
  },
  {
    files: ["eslint.config.mjs"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  // Module boundaries per CLAUDE.md's Architecture section. Only the
  // explicitly stated restrictions are enforced — src/store has no stated
  // import restriction, so none is added here.
  {
    files: ["src/audio/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["**/dsp", "**/dsp/*"], message: boundaryMessage("audio", "dsp") },
            { group: ["**/render", "**/render/*"], message: boundaryMessage("audio", "render") },
            { group: ["**/store", "**/store/*"], message: boundaryMessage("audio", "store") },
          ],
        },
      ],
    },
  },
  {
    files: ["src/dsp/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["**/audio", "**/audio/*"], message: boundaryMessage("dsp", "audio") },
            { group: ["**/render", "**/render/*"], message: boundaryMessage("dsp", "render") },
            { group: ["**/store", "**/store/*"], message: boundaryMessage("dsp", "store") },
          ],
        },
      ],
    },
  },
  {
    files: ["src/render/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["**/audio", "**/audio/*"], message: boundaryMessage("render", "audio") },
          ],
        },
      ],
    },
  },
);
