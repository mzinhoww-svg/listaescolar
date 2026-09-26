import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Testes de banco (RLS, schema) contra o Postgres do Supabase local. Rode com `pnpm test:db`.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: [
      "tests/db/**/*.test.ts",
      "tests/**/repository.test.ts",
      "tests/submissions/store.test.ts",
      "tests/submissions/edge-function.e2e.test.ts",
    ],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
    maxWorkers: 1,
    globals: false,
    // Garante um plano de cobrança (S21) ativo antes de QUALQUER arquivo, independente da ordem alfabética: o
    // gatilho leads_billing_charge cobre toda inserção em `leads`, inclusive dos testes de outras fatias.
    globalSetup: ["./tests/db/db-global-setup.ts"],
  },
});
