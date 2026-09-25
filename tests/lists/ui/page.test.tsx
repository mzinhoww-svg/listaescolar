import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSchoolByInep = vi.fn();
const getPublishedList = vi.fn();
const listVersionHistory = vi.fn();
vi.mock("@/features/schools/search/repository", () => ({ getSchoolByInep: (...a: unknown[]) => getSchoolByInep(...a) }));
vi.mock("@/features/lists/queries", () => ({
  getPublishedList: (...a: unknown[]) => getPublishedList(...a),
  listVersionHistory: (...a: unknown[]) => listVersionHistory(...a),
}));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(f: T) => f }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

import ListPage, { generateMetadata } from "@/app/escolas/[inep]/[serie]/page";
import { academicYears } from "@/features/grades/catalog";

const school = { id: "3f2b8c1e-5d4a-4b6f-9a7e-1c2d3e4f5a6b", inep: "99001001", name: "Escola Demonstração 1", isDemo: true };
const props = (serie: string, sp: Record<string, string> = {}, inep = "99001001") => ({
  params: Promise.resolve({ inep, serie }),
  searchParams: Promise.resolve(sp),
});
const year = academicYears(new Date())[1];
const list = {
  id: "3f2b8c1e-5d4a-4b6f-9a7e-1c2d3e4f5a01",
  gradeSlug: "ef-5",
  schoolYear: year,
  publishedAt: "2027-01-10T15:00:00Z",
  isDemo: true,
  version: {
    id: "3f2b8c1e-5d4a-4b6f-9a7e-1c2d3e4f5a02",
    versionNumber: 2,
    status: "published" as const,
    publishedAt: "2027-01-10T15:00:00Z",
    itemCount: 1,
    items: [{ id: "3f2b8c1e-5d4a-4b6f-9a7e-1c2d3e4f5a03", position: 1, name: "Lápis preto", normalizedName: "lapis preto", category: null, quantity: 12, unit: "un" }],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  getSchoolByInep.mockResolvedValue(school);
  getPublishedList.mockResolvedValue(null);
  listVersionHistory.mockResolvedValue([]);
});

describe("página da lista", () => {
  it("INEP inexistente, série inválida e ano inválido são 404", async () => {
    getSchoolByInep.mockResolvedValueOnce(null);
    await expect(ListPage(props("ef-5", {}, "00000000"))).rejects.toThrow("NOT_FOUND");
    await expect(ListPage(props("xx-9"))).rejects.toThrow("NOT_FOUND");
    await expect(ListPage(props("ef-5", { ano: "1900" }))).rejects.toThrow("NOT_FOUND");
    await expect(ListPage(props("ef-5", { ano: "abc" }))).rejects.toThrow("NOT_FOUND");
  });

  it("sem lista publicada mostra o estado (sem inventar itens)", async () => {
    render(await ListPage(props("ef-5", { ano: String(year) })));
    expect(screen.getByText(`5º ano · ${year}: lista não publicada`)).toBeInTheDocument();
    expect(screen.queryByText("Itens da lista")).toBeNull();
  });

  it("lista publicada mostra itens e histórico com versão anterior", async () => {
    getPublishedList.mockResolvedValue(list);
    listVersionHistory.mockResolvedValue([
      { id: list.version.id, versionNumber: 2, status: "published", publishedAt: list.publishedAt, itemCount: 1 },
      { id: "3f2b8c1e-5d4a-4b6f-9a7e-1c2d3e4f5a04", versionNumber: 1, status: "superseded", publishedAt: list.publishedAt, itemCount: 1 },
    ]);
    render(await ListPage(props("ef-5", { ano: String(year) })));
    expect(screen.getByText("Lápis preto")).toBeInTheDocument();
    expect(screen.getByText("Versão 1 · versão anterior")).toBeInTheDocument();
    expect(getPublishedList).toHaveBeenCalledWith("99001001", "ef-5", year);
  });

  it("metadata: noindex; título com Demonstração; inválidos viram 'não encontrada'", async () => {
    const m = await generateMetadata(props("ef-5", { ano: String(year) }));
    expect(String(m.title)).toContain("Demonstração");
    expect(m.robots).toMatchObject({ index: false });
    const bad = await generateMetadata(props("xx"));
    expect(String(bad.title)).toContain("não encontrada");
  });
});
