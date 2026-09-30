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

describe("UX-114 caminho de volta e link público em /admin/listas/[id]; alvo em /admin/denuncias", () => {
  it("lista: voltar às denúncias e link ao perfil público da escola", () => {
    const src = readFileSync("app/admin/listas/[id]/page.tsx", "utf8");
    expect(src).toMatch(/href="\/admin\/denuncias"[^>]*>Voltar às denúncias/);
    expect(src).toMatch(/Ver a página pública da escola/);
  });
  it("denúncias: link Abrir com min-h-11", () => {
    const src = readFileSync("app/admin/denuncias/page.tsx", "utf8");
    expect(src).toMatch(/min-h-11[^"]*"[^>]*>Abrir</);
  });
});
