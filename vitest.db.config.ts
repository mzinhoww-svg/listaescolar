import { defineConfig } from "vitest/config";

// Testes de banco (RLS, schema) contra o Postgres do Supabase local. Rode com `pnpm test:db`.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/db/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
    maxWorkers: 1,
    globals: false,
  },
});
