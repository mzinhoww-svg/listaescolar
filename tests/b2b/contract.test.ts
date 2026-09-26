import { readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ENDPOINTS } from "@/features/b2b/api/endpoints";
import { scopeFor } from "@/features/b2b/scopes";

// Teste de contrato (S24): todo `ENDPOINTS[].example` valida contra o próprio esquema; o escopo declarado bate com
// `scopeFor`; e um teste de completude garante que todo arquivo `app/v1/**/route.ts` está ou no registro, ou é
// `openapi.json`, ou é o catch-all — nenhuma rota escapa da varredura de vazamento (Task 2, Step 4).

function findRouteFiles(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findRouteFiles(full, base));
    else if (entry.name === "route.ts") out.push(full.slice(base.length + 1).replace(/\\/g, "/"));
  }
  return out;
}

describe("ENDPOINTS", () => {
  it("tem exatamente os 6 endpoints do contrato", () => {
    expect(ENDPOINTS).toHaveLength(6);
    expect(new Set(ENDPOINTS.map((e) => e.entry.id))).toEqual(
      new Set(["schools.list", "schools.get", "schools.lists", "lists.get", "lists.items", "carts.match"]),
    );
  });

  for (const { entry } of ENDPOINTS) {
    it(`${entry.id}: o exemplo de resposta valida contra o próprio esquema`, () => {
      expect(() => entry.responseSchema.parse(entry.example.response)).not.toThrow();
    });
    it(`${entry.id}: escopo declarado bate com scopeFor`, () => {
      expect(entry.scope).toBe(scopeFor(entry.id));
    });
    it(`${entry.id}: response schema é .strict() (campo extra é rejeitado)`, () => {
      const withExtra = { ...(Array.isArray(entry.example.response) ? entry.example.response[0] : entry.example.response), _leak: "x" };
      const target = Array.isArray(entry.example.response) ? [withExtra] : withExtra;
      expect(entry.responseSchema.safeParse(target).success).toBe(false);
    });
  }

  it("completude: todo app/v1/**/route.ts está no registro, é openapi.json ou é o catch-all", () => {
    const files = findRouteFiles(join(process.cwd(), "app", "v1"));
    const expectedPaths = new Set([
      "schools/route.ts",
      "schools/[inep]/route.ts",
      "schools/[inep]/lists/route.ts",
      "lists/[id]/route.ts",
      "lists/[id]/items/route.ts",
      "carts/match/route.ts",
      "openapi.json/route.ts",
      "[...rest]/route.ts",
    ]);
    expect(new Set(files)).toEqual(expectedPaths);
    // Cada rota do registro corresponde a um arquivo real (nenhum endpoint "fantasma" sem rota).
    for (const { entry } of ENDPOINTS) {
      const asFile = entry.path.replace(/^\/v1\//, "").replace(/\{([a-z]+)\}/g, "[$1]") + "/route.ts";
      expect(files).toContain(asFile);
    }
  });
});
