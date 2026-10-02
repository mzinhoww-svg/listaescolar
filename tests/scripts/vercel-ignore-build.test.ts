import { describe, expect, it } from "vitest";

// @ts-expect-error módulo .mjs sem tipos
import { shouldSkipBuild } from "../../scripts/vercel-ignore-build.mjs";

describe("vercel-ignore-build", () => {
  it("pula quando só docs, markdown e .claude mudam", () => {
    expect(shouldSkipBuild(["docs/GO-LIVE.md", "README.md", ".claude/settings.json", "docs/brand/logo.svg"])).toBe(true);
    expect(shouldSkipBuild(["CLAUDE.md"])).toBe(true);
  });
  it("constrói se qualquer arquivo de código ou config mudar", () => {
    expect(shouldSkipBuild(["docs/a.md", "app/page.tsx"])).toBe(false);
    expect(shouldSkipBuild(["vercel.json"])).toBe(false);
    expect(shouldSkipBuild(["supabase/migrations/0001_x.sql"])).toBe(false);
    expect(shouldSkipBuild(["package.json"])).toBe(false);
  });
  it("lista vazia constrói", () => {
    expect(shouldSkipBuild([])).toBe(false);
    expect(shouldSkipBuild([""])).toBe(false);
  });
});
