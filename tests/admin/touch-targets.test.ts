import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CASES: [string, string][] = [
  ["app/admin/reivindicacoes/[id]/page.tsx", "Voltar à fila"],
  ["app/admin/reivindicacoes/[id]/page.tsx", "Abrir (link de 60 s)"],
  ["app/admin/papelarias/[id]/page.tsx", "Voltar à fila"],
  ["app/admin/parceiros/page.tsx", "Gerir\n"],
  ["app/admin/parceiros/[id]/page.tsx", "Voltar à lista"],
];

describe("UX-107 alvos de toque das telas de detalhe do admin", () => {
  it.each(CASES)("%s: link '%s' tem min-h-11", (file, label) => {
    const src = readFileSync(file, "utf8");
    const i = src.lastIndexOf(label.trim());
    const tagStart = src.lastIndexOf("<", src.lastIndexOf(">", i) - 1);
    const tag = src.slice(tagStart, src.indexOf(">", tagStart));
    expect(tag).toMatch(/min-h-11/);
    expect(tag).toMatch(/inline-flex/);
  });
});

describe("UX-103 coluna de ação visível a 390 px (fixa à direita)", () => {
  it.each(["components/stationeries/AdminTable.tsx", "components/review/ReviewQueueTable.tsx", "app/admin/parceiros/page.tsx"])("%s", (f) => {
    const src = readFileSync(f, "utf8");
    expect(src).toMatch(/data-sticky-action/);
    expect(src).toMatch(/sticky right-0/);
  });
});
