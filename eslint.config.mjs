import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Regras do projeto (CLAUDE.md).
  {
    rules: { "@typescript-eslint/no-explicit-any": "error" },
  },
  {
    files: ["**/*.tsx"],
    rules: { "max-lines": ["error", { max: 250, skipBlankLines: false, skipComments: false }] },
  },
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "coverage/**",
    ".track-workdir/**",
    "supabase/functions/ocr-worker/**", // Deno
  ]),
]);

export default eslintConfig;
