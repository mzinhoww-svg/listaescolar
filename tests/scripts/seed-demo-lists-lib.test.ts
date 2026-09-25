// @vitest-environment node
import { describe, expect, it } from "vitest";

import { itemsInputSchema } from "@/features/lists/schemas";
import { findGrade } from "@/features/grades/catalog";
import {
  DEMO_ACTOR_ID,
  DEMO_LIST_PLANS,
  assertExistingListMatches,
  parseSeedArgs,
} from "@/scripts/seed-demo-lists-lib";

describe("plano de listas demo", () => {
  it("só escolas demo, séries do catálogo e itens válidos pelo schema do repositório", () => {
    for (const p of DEMO_LIST_PLANS) {
      expect(p.inep).toMatch(/^9900100\d$/);
      expect(findGrade(p.gradeSlug)).not.toBeNull();
      expect(p.versions.length).toBeGreaterThan(0);
      for (const items of p.versions) expect(() => itemsInputSchema.parse(items)).not.toThrow();
    }
  });
  it("cobre publicada, histórico (2 versões) e não publicada; chave natural única por ano", () => {
    expect(DEMO_LIST_PLANS.some((p) => p.publish && p.versions.length === 1)).toBe(true);
    expect(DEMO_LIST_PLANS.some((p) => p.publish && p.versions.length === 2)).toBe(true);
    expect(DEMO_LIST_PLANS.some((p) => !p.publish)).toBe(true);
    const keys = DEMO_LIST_PLANS.map((p) => `${p.inep}/${p.gradeSlug}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("nunca traz preço nem estoque nos itens", () => {
    expect(JSON.stringify(DEMO_LIST_PLANS)).not.toMatch(/pre[cç]o|price|estoque|R\$/i);
  });
  it("ator é uuid e argumentos desconhecidos são recusados", () => {
    expect(DEMO_ACTOR_ID).toMatch(/^[0-9a-f-]{36}$/);
    expect(parseSeedArgs([])).toEqual({ allowProduction: false });
    expect(() => parseSeedArgs(["--x"])).toThrow(/desconhecida/i);
  });
  it("recusa a flag de produção: o seed só roda em local ou staging", () => {
    expect(() => parseSeedArgs(["--i-know-this-is-production"])).toThrow(/desconhecida/i);
  });
  it("lista existente só conta como já existia se o estado bate com o plano", () => {
    const pub1 = DEMO_LIST_PLANS.find((p) => p.publish && p.versions.length === 1)!;
    const pub2 = DEMO_LIST_PLANS.find((p) => p.publish && p.versions.length === 2)!;
    const appr = DEMO_LIST_PLANS.find((p) => !p.publish)!;
    expect(() =>
      assertExistingListMatches(pub1, { status: "published", versionCount: 1 }),
    ).not.toThrow();
    expect(() =>
      assertExistingListMatches(pub2, { status: "published", versionCount: 2 }),
    ).not.toThrow();
    expect(() =>
      assertExistingListMatches(appr, { status: "approved", versionCount: 1 }),
    ).not.toThrow();
    expect(() => assertExistingListMatches(pub2, { status: "published", versionCount: 1 })).toThrow(
      /99001002\/ef-1/,
    );
    expect(() => assertExistingListMatches(pub1, { status: "draft", versionCount: 0 })).toThrow(
      /status/i,
    );
    expect(() => assertExistingListMatches(appr, { status: "published", versionCount: 1 })).toThrow(
      /status/i,
    );
  });
});
