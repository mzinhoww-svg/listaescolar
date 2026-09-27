import { describe, expect, it } from "vitest";

import { D057_WATCH_LIST, buildSizeReport, countLines, isSourceFile, isTestFile } from "@/scripts/check-file-sizes-lib";

describe("isTestFile / isSourceFile", () => {
  it("reconhece testes por sufixo ou pasta tests/", () => {
    expect(isTestFile("features/cart/repository.test.ts")).toBe(true);
    expect(isTestFile("tests/db/audit.test.ts")).toBe(true);
    expect(isTestFile("features/cart/repository.ts")).toBe(false);
  });
  it("aceita .ts/.tsx fonte, recusa teste e .d.ts", () => {
    expect(isSourceFile("features/cart/repository.ts")).toBe(true);
    expect(isSourceFile("components/Button.tsx")).toBe(true);
    expect(isSourceFile("features/cart/repository.test.ts")).toBe(false);
    expect(isSourceFile("lib/env.d.ts")).toBe(false);
    expect(isSourceFile("scripts/x.mjs")).toBe(false);
  });
});

describe("countLines", () => {
  it("conta linhas com e sem \\n final", () => {
    expect(countLines("")).toBe(0);
    expect(countLines("a")).toBe(1);
    expect(countLines("a\nb")).toBe(2);
    expect(countLines("a\nb\n")).toBe(2);
    expect(countLines("a\nb\n\n")).toBe(3);
  });
});

describe("buildSizeReport", () => {
  const entries = [
    { path: "a.ts", lines: 100 },
    { path: "b.ts", lines: 300 },
    { path: "c.ts", lines: 260 },
  ];

  it("lista só os acima do limite, do maior para o menor", () => {
    const report = buildSizeReport(entries, 250, []);
    expect(report.overLimit.map((e) => e.path)).toEqual(["b.ts", "c.ts"]);
    expect(report.watchedRegressions).toEqual([]);
  });

  it("marca regressão só para arquivo vigiado que ainda está acima do limite", () => {
    const report = buildSizeReport(entries, 250, ["c.ts", "a.ts"]);
    expect(report.watchedRegressions.map((e) => e.path)).toEqual(["c.ts"]);
  });

  it("arquivo vigiado dentro do limite não é regressão", () => {
    const withFixed = [...entries, { path: "d.ts", lines: 200 }];
    const report = buildSizeReport(withFixed, 250, ["d.ts"]);
    expect(report.watchedRegressions).toEqual([]);
  });

  it("a lista D057_WATCH_LIST tem os 10 caminhos esperados, sem duplicata", () => {
    expect(D057_WATCH_LIST).toHaveLength(10);
    expect(new Set(D057_WATCH_LIST).size).toBe(10);
  });
});
