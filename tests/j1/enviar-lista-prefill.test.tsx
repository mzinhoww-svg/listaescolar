import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAccess = vi.fn();
vi.mock("@/features/auth/guard", () => ({ requireAccess: (...a: unknown[]) => requireAccess(...a) }));
const loadSchool = vi.fn();
vi.mock("@/features/schools/search/load-school", () => ({ loadSchool: (...a: unknown[]) => loadSchool(...a) }));
vi.mock("@/app/enviar-lista/school-search-action", () => ({ searchSchoolsAction: async () => ({ status: "ok", hits: [] }) }));
vi.mock("@/app/enviar-lista/actions", () => ({ submitListAction: vi.fn() }));
vi.mock("@/lib/analytics/track", () => ({ trackUploadStarted: vi.fn(), track: vi.fn() }));

import Page from "@/app/enviar-lista/page";

const sp = (o: Record<string, string>) => ({ searchParams: Promise.resolve(o) }) as never;

beforeEach(() => {
  requireAccess.mockReset().mockResolvedValue({});
  loadSchool.mockReset().mockResolvedValue({ id: "3f2b8c1e-5d4a-4b6f-9a7e-1c2d3e4f5a6b", inep: "99029001", name: "Escola Demo S29", neighborhood: "Centro", municipalityName: "Cuiabá" });
});

describe("/enviar-lista com escola e série da página de origem (UX-012)", () => {
  it("chega com a escola escolhida, a série marcada e o ano da URL", async () => {
    const y = new Date().getFullYear() + 1;
    render(await Page(sp({ escola: "99029001", serie: "ef-3", ano: String(y) })));
    expect(screen.getByTestId("school-chosen")).toHaveTextContent("Escola Demo S29");
    expect(screen.getByLabelText("Série")).toHaveValue("3º ano");
    expect(screen.getByLabelText("Ano letivo")).toHaveValue(String(y));
    expect(requireAccess).toHaveBeenCalledWith(`/enviar-lista?escola=99029001&serie=ef-3&ano=${y}`);
  });

  it("sem parâmetros, o formulário é o de sempre (sem escola nem série)", async () => {
    render(await Page(sp({})));
    expect(screen.queryByTestId("school-chosen")).toBeNull();
    expect(screen.getByLabelText("Série")).toHaveValue("");
    expect(requireAccess).toHaveBeenCalledWith("/enviar-lista");
    expect(loadSchool).not.toHaveBeenCalled();
  });

  it("escola inexistente ou parâmetro inválido não quebra: a pessoa escolhe no formulário", async () => {
    loadSchool.mockResolvedValue(null);
    render(await Page(sp({ escola: "00000000", serie: "xx-9", ano: "1999" })));
    expect(screen.queryByTestId("school-chosen")).toBeNull();
    expect(screen.getByLabelText("Série")).toHaveValue("");
  });
});
