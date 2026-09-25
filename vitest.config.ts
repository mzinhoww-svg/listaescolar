import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    // tests/db roda em `pnpm test:db` (exige Supabase local).
    exclude: [
      "tests/db/**",
      "tests/**/repository.test.ts",
      "tests/submissions/store.test.ts",
      "tests/submissions/edge-function.e2e.test.ts",
      "node_modules/**",
      ".track-workdir/**",
    ],
    globals: false,
  },
});
